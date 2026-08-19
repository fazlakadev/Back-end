import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, RequestContext } from '../common/types/request-context';
import { requestAuditStore } from '../common/middleware/request-audit.middleware';
import { AuthEventsService } from '../auth-events/auth-events.service';
import {
  generatePublicId,
  generateReferralCode,
  randomToken,
} from '../common/utils/helpers';
import { MailService } from '../mail/mail.service';
import { VerificationService } from '../verification/verification.service';
import { TotpService } from './totp.service';
import { UploadService } from '../upload/upload.service';
import { GeoService } from '../common/geo/geo.service';
import { GoogleProfileResult } from './strategies/google.strategy';
import { GithubProfileResult } from './strategies/github.strategy';
import { FacebookProfileResult } from './strategies/facebook.strategy';
import { PhoneService } from '../phone/phone.service';
import {
  AcceptTermsDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  OauthLinkOtpDto,
  OauthLinkStartDto,
  OauthProvider,
  PhoneAuthCompleteDto,
  PhoneLoginRequestDto,
  RegisterDto,
  RegisterPhoneDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
export const TERMS_VERSION = '1';

export type LoginMethodKey =
  'password' | 'phone' | 'google' | 'github' | 'facebook';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly verification: VerificationService,
    private readonly authEvents: AuthEventsService,
    private readonly totp: TotpService,
    private readonly upload: UploadService,
    private readonly geo: GeoService,
    private readonly phone: PhoneService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  private track(
    userId: string,
    eventType: string,
    method: string | undefined,
    ctx: RequestContext,
    status: 'success' | 'failed' = 'success',
    metadata?: Record<string, unknown>,
  ): void {
    void this.authEvents.record({
      userId,
      eventType,
      method,
      status,
      ctx,
      metadata,
    });
  }

  /**
   * Sends a "new sign-in" security email on EVERY successful login so the
   * account owner always knows when/where/from which device their account
   * was accessed. Users can opt out via the `loginAlerts` preference.
   */
  private async maybeNotifyNewLogin(
    prevIp: string | null | undefined,
    user: Pick<
      User,
      'id' | 'email' | 'name' | 'locale' | 'lastLoginNotifiedIp'
    >,
    ctx: RequestContext,
    method: string,
  ): Promise<void> {
    void prevIp;
    try {
      const cleaned = (ctx.ip || '').replace(/^::ffff:/, '').trim();

      let { country, city, region } = ctx as {
        country?: string;
        city?: string;
        region?: string;
      };
      if (!country && !city && cleaned && cleaned !== 'unknown') {
        const info = await this.geo.lookupIp(cleaned);
        country = info.country;
        city = info.city;
        region = info.region;
      }

      const preference = await this.prisma.userPreference.findUnique({
        where: { userId: user.id },
        select: { emailNotifications: true, loginAlerts: true },
      });
      if (preference) {
        if (preference.emailNotifications === false) return;
        if (preference.loginAlerts === false) return;
      }

      await this.mail.sendNewLoginEmail(user.email, user.name, {
        method,
        ip: cleaned,
        country,
        city,
        region,
        lat: typeof ctx.lat === 'number' ? String(ctx.lat) : null,
        lng: typeof ctx.lng === 'number' ? String(ctx.lng) : null,
        platform: ctx.platform,
        device: ctx.deviceName || ctx.deviceType,
        browser: ctx.browser,
        os: ctx.os,
        locale: user.locale,
      });
      if (cleaned) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lastLoginNotifiedIp: cleaned },
        });
      }
    } catch (error) {
      this.logger.debug('New-login notification skipped', error as Error);
    }
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private async issueAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      trm: !!user.termsAcceptedAt,
    };
    return this.jwt.signAsync(payload);
  }

  private async issueRefreshToken(
    user: User,
    ctx: RequestContext,
  ): Promise<string> {
    const raw = randomToken(48);
    const hashed = this.hashRefresh(raw);
    await this.prisma.refreshToken.create({
      data: {
        token: hashed,
        userId: user.id,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        platform: this.toPlatform(ctx.platform),
        deviceType: ctx.deviceType,
        deviceName: ctx.deviceName,
        os: ctx.os,
        browser: ctx.browser,
        country: ctx.country,
        countryCode: ctx.countryCode,
        city: ctx.city,
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    });
    return raw;
  }

  private hashRefresh(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private refreshTtlMs(): number {
    const raw = this.config.get<string>('jwt.refreshExpiresIn') || '30d';
    if (raw.endsWith('d')) return parseInt(raw, 10) * 24 * 60 * 60 * 1000;
    if (raw.endsWith('h')) return parseInt(raw, 10) * 60 * 60 * 1000;
    return 30 * 24 * 60 * 60 * 1000;
  }

  private toPlatform(platform?: string) {
    const p = (platform || '').toUpperCase();
    if (p === 'MOBILE' || p === 'DESKTOP') return p;
    return 'WEB' as const;
  }

  private verifyBaseUrl(): string {
    return this.config.get<string>('websiteUrl') || 'http://localhost:3000';
  }

  async register(
    dto: RegisterDto,
    ctx: RequestContext,
  ): Promise<TokenPair & { user: Partial<User> }> {
    const email = dto.email.toLowerCase().trim();

    if (!dto.termsAccepted) {
      throw new BadRequestException(
        this.i18n()?.t('errors.termsRequired') ?? 'You must accept the terms',
      );
    }

    const [emailExists, usernameExists] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.user.findUnique({ where: { username: dto.username } }),
    ]);
    if (emailExists) {
      throw new ConflictException(
        this.i18n()?.t('errors.emailInUse') ?? 'Email already in use',
      );
    }
    if (usernameExists) {
      throw new ConflictException(
        this.i18n()?.t('errors.usernameInUse') ?? 'Username taken',
      );
    }

    let referredById: string | undefined;
    if (dto.referralCode) {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: dto.referralCode },
      });
      referredById = referrer?.id;
    }

    const user = await this.prisma.$transaction(async (tx: any) => {
      const preferredLocale =
        dto.locale ??
        (ctx.locale === 'ar' || ctx.locale === 'fr' ? ctx.locale : 'ar');
      const created = await tx.user.create({
        data: {
          email,
          username: dto.username,
          publicId: generatePublicId(),
          name: dto.name,
          passwordHash: await this.hashPassword(dto.password),
          locale: preferredLocale,
          referralCode: generateReferralCode(dto.name),
          referredById,
          termsAcceptedAt: new Date(),
          termsVersion: TERMS_VERSION,
          lastLoginIp: ctx.ip,
          lastPlatform: this.toPlatform(ctx.platform),
          lastActiveAt: new Date(),
        },
      });
      await tx.userPreference.create({
        data: {
          userId: created.id,
          locale: preferredLocale,
          primaryLocale: preferredLocale,
        },
      });
      return created;
    });

    if (dto.backupEmail && dto.backupEmail.toLowerCase().trim() !== email) {
      const backup = dto.backupEmail.toLowerCase().trim();
      const [usedAsPrimary, usedAsSecondary] = await Promise.all([
        this.prisma.user.findUnique({ where: { email: backup } }),
        this.prisma.userEmail.findUnique({ where: { email: backup } }),
      ]);
      if (!usedAsPrimary && !usedAsSecondary) {
        await this.prisma.userEmail.create({
          data: { userId: user.id, email: backup, isVerified: false },
        });
      }
    }

    await this.sendEmailVerification(user);

    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(user),
      this.issueRefreshToken(user, ctx),
    ]);

    this.track(user.id, 'register', 'password', ctx);
    return { accessToken, refreshToken, user: this.sanitize(user) };
  }

  /**
   * Returns either a token pair, or a "two-step" signal when the account has
   * 2FA enabled (an OTP is emailed; no tokens are issued yet).
   */
  async login(
    dto: LoginDto,
    ctx: RequestContext,
  ): Promise<
    | (TokenPair & { user: Partial<User> })
    | { requiresTwoFactor: true; email: string; method: 'EMAIL' | 'APP' }
  > {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      if (user && !user.passwordHash && user.googleId) {
        throw new UnauthorizedException(
          this.i18n()?.t('errors.loginWithGoogle') ??
            'This account uses Google sign-in',
        );
      }
      if (user && !user.passwordHash && (user.phone || user.githubId)) {
        throw new UnauthorizedException(
          this.i18n()?.t('errors.loginWithOther') ??
            'This account uses another sign-in method',
        );
      }
      throw new UnauthorizedException(
        this.i18n()?.t('errors.credentialsInvalid') ?? 'Invalid credentials',
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.track(user.id, 'failed_login', 'password', ctx, 'failed', {
        reason: 'locked',
      });
      throw new ThrottlerException(
        this.i18n()?.t('errors.accountLocked') ??
          'Too many attempts, try later',
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      const now = new Date();
      const lockExpired = user.lockedUntil && user.lockedUntil <= now;
      const nextCount = lockExpired ? 1 : (user.failedLoginCount ?? 0) + 1;
      const data: Prisma.UserUpdateInput = {
        failedLoginAt: now,
        failedLoginCount: nextCount,
      };
      if (nextCount >= MAX_FAILED_LOGINS) {
        data.lockedUntil = new Date(now.getTime() + LOCKOUT_MS);
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data,
      });
      this.track(user.id, 'failed_login', 'password', ctx, 'failed', {
        reason: 'invalid_credentials',
        attempts: nextCount,
      });
      const attemptsLeft = Math.max(0, MAX_FAILED_LOGINS - nextCount);
      throw new UnauthorizedException({
        message:
          attemptsLeft > 0
            ? (this.i18n()?.t('errors.credentialsInvalid') ??
              'Invalid credentials')
            : (this.i18n()?.t('errors.accountLocked') ??
              'Too many attempts, try later'),
        attemptsLeft,
      });
    }

    try {
      this.assertAllowed(user);
    } catch (e) {
      this.track(user.id, 'failed_login', 'password', ctx, 'failed', {
        reason: user.status,
      });
      throw e;
    }

    if (user.twoFactorEnabled) {
      if (user.twoFactorMethod === 'APP') {
        return { requiresTwoFactor: true, email: user.email, method: 'APP' };
      }
      await this.sendTwoFactorOtp(user);
      return { requiresTwoFactor: true, email: user.email, method: 'EMAIL' };
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastActiveAt: new Date(),
        lastLoginIp: ctx.ip,
        lastPlatform: this.toPlatform(ctx.platform),
        failedLoginAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(updated),
      this.issueRefreshToken(updated, ctx),
    ]);

    this.track(user.id, 'login', 'password', ctx);
    void this.maybeNotifyNewLogin(user.lastLoginIp, user, ctx, 'password');
    return { accessToken, refreshToken, user: this.sanitize(updated) };
  }

  /**
   * Completes a 2FA login: validates the emailed OTP and then issues tokens.
   */
  async verifyTwoFactorLogin(
    email: string,
    otp: string,
    ctx: RequestContext,
  ): Promise<TokenPair & { user: Partial<User> }> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user || !user.twoFactorEnabled) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.credentialsInvalid') ?? 'Invalid credentials',
      );
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.track(user.id, 'failed_login', 'otp', ctx, 'failed', {
        reason: 'locked',
      });
      throw new ThrottlerException(
        this.i18n()?.t('errors.accountLocked') ??
          'Too many attempts, try later',
      );
    }
    const ok =
      user.twoFactorMethod === 'APP'
        ? this.totp.verify(user.twoFactorSecret ?? '', otp)
        : await this.verification.verifyOtp(user.id, 'TWO_FACTOR', otp);
    if (!ok) {
      this.track(user.id, 'failed_login', 'otp', ctx, 'failed', {
        reason: 'otp_invalid',
      });
      throw new UnauthorizedException(
        this.i18n()?.t('errors.otpInvalid') ?? 'Invalid verification code',
      );
    }
    try {
      this.assertAllowed(user);
    } catch (e) {
      this.track(user.id, 'failed_login', 'otp', ctx, 'failed', {
        reason: user.status,
      });
      throw e;
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastActiveAt: new Date(),
        lastLoginIp: ctx.ip,
        lastPlatform: this.toPlatform(ctx.platform),
        failedLoginAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(updated),
      this.issueRefreshToken(updated, ctx),
    ]);

    this.track(user.id, 'login', 'otp', ctx);
    void this.maybeNotifyNewLogin(user.lastLoginIp, user, ctx, 'otp');
    return { accessToken, refreshToken, user: this.sanitize(updated) };
  }

  async googleLogin(profile: GoogleProfileResult, ctx: RequestContext) {
    const email = profile.email;
    if (!email) {
      throw new BadRequestException('Google account has no email');
    }

    let avatarUrl = profile.avatarUrl;
    if (avatarUrl && /googleusercontent\.com/i.test(avatarUrl)) {
      const rehosted = await this.upload
        .uploadAvatarFromUrl(avatarUrl)
        .catch(() => null);
      if (rehosted?.url) avatarUrl = rehosted.url;
    }

    let user = await this.prisma.user.findUnique({ where: { email } });
    const prevLoginIp = user?.lastLoginIp;
    if (user && !user.googleId) {
      // An account already exists for this email with a different sign-in
      // method. Never auto-link: ask the user to sign in and link from
      // Settings (the OAuth link flow handles linking instead).
      throw new UnauthorizedException(
        this.i18n()?.t('errors.linkViaSettings', {
          args: { provider: 'Google' },
        }) ??
          'This email already has an account. Sign in and link it from Settings.',
      );
    }
    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { googleId: profile.googleId },
      });
    }
    if (!user) {
      user = await this.prisma.$transaction(async (tx: any) => {
        const created = await tx.user.create({
          data: {
            email,
            googleId: profile.googleId,
            name: profile.name,
            username: await this.generateUniqueUsername(profile.name),
            publicId: generatePublicId(),
            emailVerified: new Date(),
            avatarUrl,
            referralCode: generateReferralCode(profile.name),
            termsAcceptedAt: null,
            termsVersion: TERMS_VERSION,
            lastLoginIp: ctx.ip,
            lastPlatform: this.toPlatform(ctx.platform),
            lastActiveAt: new Date(),
          },
        });
        await tx.userPreference.create({
          data: {
            userId: created.id,
            locale:
              ctx.locale === 'ar' || ctx.locale === 'fr' ? ctx.locale : 'en',
          },
        });
        return created;
      });
    } else {
      const data: Prisma.UserUpdateInput = {
        lastActiveAt: new Date(),
        lastLoginIp: ctx.ip,
        lastPlatform: this.toPlatform(ctx.platform),
      };
      if (
        avatarUrl &&
        (!user.avatarUrl || /googleusercontent\.com/i.test(user.avatarUrl))
      ) {
        data.avatarUrl = avatarUrl;
      }
      user = await this.prisma.user.update({
        where: { id: user.id },
        data,
      });
    }

    try {
      this.assertAllowed(user);
    } catch (e) {
      this.track(user.id, 'failed_login', 'google', ctx, 'failed', {
        reason: user.status,
      });
      throw e;
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(user),
      this.issueRefreshToken(user, ctx),
    ]);

    this.track(user.id, 'google', 'google', ctx);
    void this.maybeNotifyNewLogin(prevLoginIp, user, ctx, 'google');
    return { accessToken, refreshToken, user: this.sanitize(user) };
  }

  async githubLogin(profile: GithubProfileResult, ctx: RequestContext) {
    const email = profile.email;
    if (!email) {
      throw new BadRequestException('GitHub account has no email');
    }

    let user = await this.prisma.user.findUnique({ where: { email } });
    const prevLoginIp = user?.lastLoginIp;
    if (user && !user.githubId) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.linkViaSettings', {
          args: { provider: 'GitHub' },
        }) ??
          'This email already has an account. Sign in and link it from Settings.',
      );
    }
    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { githubId: profile.githubId },
      });
    }

    if (!user) {
      user = await this.prisma.$transaction(async (tx: any) => {
        const created = await tx.user.create({
          data: {
            email,
            githubId: profile.githubId,
            name: profile.name,
            username: await this.generateUniqueUsername(profile.name),
            publicId: generatePublicId(),
            emailVerified: new Date(),
            avatarUrl: profile.avatarUrl,
            referralCode: generateReferralCode(profile.name),
            termsAcceptedAt: null,
            termsVersion: TERMS_VERSION,
            lastLoginIp: ctx.ip,
            lastPlatform: this.toPlatform(ctx.platform),
            lastActiveAt: new Date(),
          },
        });
        await tx.userPreference.create({
          data: {
            userId: created.id,
            locale:
              ctx.locale === 'ar' || ctx.locale === 'fr' ? ctx.locale : 'en',
          },
        });
        return created;
      });
    } else {
      const data: Prisma.UserUpdateInput = {
        lastActiveAt: new Date(),
        lastLoginIp: ctx.ip,
        lastPlatform: this.toPlatform(ctx.platform),
      };
      if (profile.avatarUrl && !user.avatarUrl) {
        data.avatarUrl = profile.avatarUrl;
      }
      user = await this.prisma.user.update({
        where: { id: user.id },
        data,
      });
    }

    try {
      this.assertAllowed(user);
    } catch (e) {
      this.track(user.id, 'failed_login', 'github', ctx, 'failed', {
        reason: user.status,
      });
      throw e;
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(user),
      this.issueRefreshToken(user, ctx),
    ]);

    this.track(user.id, 'github', 'github', ctx);
    void this.maybeNotifyNewLogin(prevLoginIp, user, ctx, 'github');
    return { accessToken, refreshToken, user: this.sanitize(user) };
  }

  async facebookLogin(profile: FacebookProfileResult, ctx: RequestContext) {
    const email = profile.email;
    if (!email) {
      throw new BadRequestException('Facebook account has no email');
    }

    let avatarUrl = profile.avatarUrl;
    if (avatarUrl && /lookaside\.fbsbx\.com/i.test(avatarUrl)) {
      const rehosted = await this.upload
        .uploadAvatarFromUrl(avatarUrl)
        .catch(() => null);
      if (rehosted?.url) avatarUrl = rehosted.url;
    }

    let user = await this.prisma.user.findUnique({ where: { email } });
    const prevLoginIp = user?.lastLoginIp;
    if (user && !user.facebookId) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.linkViaSettings', {
          args: { provider: 'Facebook' },
        }) ??
          'This email already has an account. Sign in and link it from Settings.',
      );
    }
    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { facebookId: profile.facebookId },
      });
    }

    if (!user) {
      user = await this.prisma.$transaction(async (tx: any) => {
        const created = await tx.user.create({
          data: {
            email,
            facebookId: profile.facebookId,
            name: profile.name,
            username: await this.generateUniqueUsername(profile.name),
            publicId: generatePublicId(),
            emailVerified: new Date(),
            avatarUrl,
            referralCode: generateReferralCode(profile.name),
            termsAcceptedAt: null,
            termsVersion: TERMS_VERSION,
            lastLoginIp: ctx.ip,
            lastPlatform: this.toPlatform(ctx.platform),
            lastActiveAt: new Date(),
          },
        });
        await tx.userPreference.create({
          data: {
            userId: created.id,
            locale:
              ctx.locale === 'ar' || ctx.locale === 'fr' ? ctx.locale : 'en',
          },
        });
        return created;
      });
    } else {
      const data: Prisma.UserUpdateInput = {
        lastActiveAt: new Date(),
        lastLoginIp: ctx.ip,
        lastPlatform: this.toPlatform(ctx.platform),
      };
      if (avatarUrl && !user.avatarUrl) {
        data.avatarUrl = avatarUrl;
      }
      user = await this.prisma.user.update({
        where: { id: user.id },
        data,
      });
    }

    try {
      this.assertAllowed(user);
    } catch (e) {
      this.track(user.id, 'failed_login', 'facebook', ctx, 'failed', {
        reason: user.status,
      });
      throw e;
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(user),
      this.issueRefreshToken(user, ctx),
    ]);

    this.track(user.id, 'facebook', 'facebook', ctx);
    void this.maybeNotifyNewLogin(prevLoginIp, user, ctx, 'facebook');
    return { accessToken, refreshToken, user: this.sanitize(user) };
  }

  /**
   * Creates an account using only a phone number. The number is verified via
   * the Fazlaka Telegram bot, then tokens are issued through completePhoneAuth.
   */
  async registerWithPhone(
    dto: RegisterPhoneDto,
    ctx: RequestContext,
  ): Promise<{
    verificationId: string;
    phone: string;
    status: 'code_sent' | 'not_linked';
    botUsername: string;
    botUrl: string;
    expiresIn: number;
  }> {
    const phone = this.phone.normalizePhone(dto.phone);
    const taken = await this.prisma.user.findFirst({ where: { phone } });
    if (taken) {
      throw new ConflictException(
        this.i18n()?.t('errors.phoneInUse') ?? 'Phone already in use',
      );
    }

    if (!dto.termsAccepted) {
      throw new BadRequestException(
        this.i18n()?.t('errors.termsRequired') ?? 'You must accept the terms',
      );
    }

    const usernameTaken = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: { id: true },
    });
    if (usernameTaken) {
      throw new ConflictException(
        this.i18n()?.t('errors.usernameInUse') ?? 'Username taken',
      );
    }

    const preferredLocale =
      dto.locale ??
      (ctx.locale === 'ar' || ctx.locale === 'fr' ? ctx.locale : 'ar');
    const name = dto.name?.trim() || 'مستخدم جديد';

    const user = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.user.create({
        data: {
          email: `user_${randomToken(8)}@fazlaka.local`,
          username: dto.username,
          publicId: generatePublicId(),
          name,
          locale: preferredLocale,
          referralCode: generateReferralCode(name),
          termsAcceptedAt: new Date(),
          termsVersion: TERMS_VERSION,
          lastLoginIp: ctx.ip,
          lastPlatform: this.toPlatform(ctx.platform),
          lastActiveAt: new Date(),
        },
      });
      await tx.userPreference.create({
        data: {
          userId: created.id,
          locale: preferredLocale,
          primaryLocale: preferredLocale,
        },
      });
      return created;
    });

    this.track(user.id, 'register', 'telegram', ctx);
    return this.phone.requestVerification(user.id, phone);
  }

  /**
   * Starts a phone-based login for an existing account (verified via Telegram).
   */
  async requestPhoneLogin(
    dto: PhoneLoginRequestDto,
    ctx: RequestContext,
  ): Promise<{
    verificationId: string;
    phone: string;
    status: 'code_sent' | 'not_linked';
    botUsername: string;
    botUrl: string;
    expiresIn: number;
  }> {
    const phone = this.phone.normalizePhone(dto.phone);
    const user = await this.prisma.user.findFirst({ where: { phone } });
    if (!user) {
      throw new BadRequestException(
        this.i18n()?.t('errors.phoneNotRegistered') ??
          'No account linked to this phone',
      );
    }
    if (ctx) {
      this.track(user.id, 'phone_login_request', 'telegram', ctx);
    }
    return this.phone.requestVerification(user.id, phone);
  }

  /** Whether a phone has shared its number with the Telegram bot yet. */
  async phoneLinkStatus(phoneRaw: string) {
    const phone = this.phone.normalizePhone(phoneRaw);
    const link = await this.phone.getLink(phone);
    return {
      phone,
      linked: !!link,
      botUsername: this.phone.botUsername(),
      botUrl: `https://t.me/${this.phone.botUsername()}`,
    };
  }

  /** Re-sends the verification code for a pending phone verification. */
  async resendPhoneCode(verificationId: string, phoneRaw: string) {
    return this.phone.resendCode(verificationId, phoneRaw);
  }

  /**
   * Completes a phone auth. When `dto.code` is provided, the code the user
   * entered on the website is verified against the pending verification.
   * Otherwise (backward-compatible) it just reports whether verification is
   * still pending.
   */
  async completePhoneAuth(
    dto: PhoneAuthCompleteDto,
    ctx: RequestContext,
  ): Promise<{ pending: true } | (TokenPair & { user: Partial<User> })> {
    const phone = this.phone.normalizePhone(dto.phone);
    const record = await this.prisma.phoneVerification.findUnique({
      where: { id: dto.verificationId },
    });
    if (
      !record ||
      record.phone !== phone ||
      record.expiresAt < new Date() ||
      record.consumedAt
    ) {
      throw new BadRequestException(
        this.i18n()?.t('errors.invalidToken') ?? 'Invalid token',
      );
    }

    if (dto.code) {
      // User entered the code on the website — verify it now.
      await this.phone.completeCode(phone, dto.code);
    } else if (!record.usedAt) {
      return { pending: true };
    }

    await this.prisma.phoneVerification.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: record.userId },
    });
    this.assertAllowed(user);

    await this.prisma.userPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        locale: user.locale,
        primaryLocale: user.locale,
      },
      update: {},
    });

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastActiveAt: new Date(),
        lastLoginIp: ctx.ip,
        lastPlatform: this.toPlatform(ctx.platform),
        failedLoginAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(updated),
      this.issueRefreshToken(updated, ctx),
    ]);

    this.track(user.id, 'login', 'telegram', ctx);
    void this.maybeNotifyNewLogin(user.lastLoginIp, user, ctx, 'telegram');
    return { accessToken, refreshToken, user: this.sanitize(updated) };
  }

  async refresh(refreshToken: string, ctx: RequestContext): Promise<TokenPair> {
    const hashed = this.hashRefresh(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: hashed },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      if (stored && !stored.revokedAt) {
        await this.prisma.refreshToken.update({
          where: { id: stored.id },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException(
        this.i18n()?.t('errors.invalidRefreshToken') ?? 'Invalid refresh token',
      );
    }

    this.assertAllowed(stored.user);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });

    const accessToken = await this.issueAccessToken(stored.user);
    const newRefresh = await this.issueRefreshToken(stored.user, ctx);
    return { accessToken, refreshToken: newRefresh };
  }

  async logout(refreshToken: string, ctx?: RequestContext): Promise<void> {
    const hashed = this.hashRefresh(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: hashed },
    });
    if (stored && !stored.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      if (ctx) {
        this.track(stored.userId, 'logout', 'password', ctx);
      }
    }
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
    ctx?: RequestContext,
  ): Promise<void> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return;
    }

    if (ctx) {
      this.track(user.id, 'password_reset_request', 'token', ctx);
    }

    const issued = await this.verification.issue(user.id, 'PASSWORD_RESET', {
      ttlMs: 30 * 60 * 1000,
    });
    const resetLink = `${this.verifyBaseUrl()}/reset-password?token=${issued.token}`;
    await this.mail.sendPasswordResetEmail(user.email, user.name, {
      link: resetLink,
      otp: issued.otp,
      locale: user.locale,
    });
  }

  async resetPassword(
    dto: ResetPasswordDto,
    ctx?: RequestContext,
  ): Promise<void> {
    let userId: string;

    if (dto.token) {
      const record = await this.verification.verifyToken(
        dto.token,
        'PASSWORD_RESET',
      );
      if (!record) {
        throw new BadRequestException(
          this.i18n()?.t('errors.invalidToken') ?? 'Invalid token',
        );
      }
      userId = record.userId;
    } else if (dto.email && dto.otp) {
      const email = dto.email.toLowerCase().trim();
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (!user) {
        throw new BadRequestException(
          this.i18n()?.t('errors.invalidToken') ?? 'Invalid token',
        );
      }
      const ok = await this.verification.verifyOtp(
        user.id,
        'PASSWORD_RESET',
        dto.otp,
      );
      if (!ok) {
        throw new BadRequestException(
          this.i18n()?.t('errors.invalidToken') ?? 'Invalid token',
        );
      }
      userId = user.id;
    } else {
      throw new BadRequestException(
        this.i18n()?.t('errors.invalidToken') ?? 'Invalid token',
      );
    }

    const passwordHash = await this.hashPassword(dto.password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    if (ctx) {
      this.track(userId, 'password_reset', dto.token ? 'token' : 'otp', ctx);
    }
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ctx?: RequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.credentialsInvalid') ?? 'Invalid credentials',
      );
    }
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException(
        this.i18n()?.t('errors.currentPasswordWrong') ??
          'Current password is wrong',
      );
    }
    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (ctx) {
      this.track(userId, 'password_changed', 'password', ctx);
    }
  }

  /**
   * Verifies email via quick-link token OR a 6-digit OTP (+ email).
   */
  async verifyEmail(dto: VerifyEmailDto, ctx?: RequestContext): Promise<void> {
    let verifiedUserId: string | undefined;
    if (dto.otp && dto.email) {
      const email = dto.email.toLowerCase().trim();
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (!user) {
        throw new BadRequestException(
          this.i18n()?.t('errors.invalidToken') ?? 'Invalid token',
        );
      }
      const ok = await this.verification.verifyOtp(
        user.id,
        'EMAIL_VERIFY',
        dto.otp,
      );
      if (!ok) {
        throw new BadRequestException(
          this.i18n()?.t('errors.invalidToken') ?? 'Invalid token',
        );
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
      verifiedUserId = user.id;
    } else if (dto.token) {
      const record = await this.verification.verifyToken(
        dto.token,
        'EMAIL_VERIFY',
      );
      if (!record) {
        throw new BadRequestException(
          this.i18n()?.t('errors.invalidToken') ?? 'Invalid token',
        );
      }
      await this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: new Date() },
      });
      verifiedUserId = record.userId;
    } else {
      throw new BadRequestException(
        this.i18n()?.t('errors.invalidToken') ?? 'Invalid token',
      );
    }

    if (ctx && verifiedUserId) {
      this.track(
        verifiedUserId,
        'email_verified',
        dto.token ? 'token' : 'otp',
        ctx,
      );
    }
  }

  async resendVerification(email: string, ctx?: RequestContext): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user || user.emailVerified) return;
    if (ctx) {
      this.track(user.id, 'verify_email_resend', 'token', ctx);
    }
    await this.sendEmailVerification(user);
  }

  /**
   * Records Terms & Privacy consent for an account (required before any
   * mutation). Optionally lets the user claim a username (needed after an
   * OAuth-first sign-up). Issues a fresh token pair so the JWT `trm` claim
   * reflects the new state.
   */
  async acceptTerms(
    userId: string,
    dto: AcceptTermsDto,
    ctx: RequestContext,
  ): Promise<TokenPair & { user: Partial<User> }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    if (!dto.termsAccepted) {
      throw new BadRequestException(
        this.i18n()?.t('errors.termsRequired') ?? 'You must accept the terms',
      );
    }

    const data: Prisma.UserUpdateInput = {
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    };
    let usernameChanged = false;
    if (dto.username && dto.username !== user.username) {
      const exists = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (exists) {
        throw new ConflictException(
          this.i18n()?.t('errors.usernameInUse') ?? 'Username taken',
        );
      }
      data.username = dto.username;
      usernameChanged = true;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    if (usernameChanged) {
      await this.revokeAllSessions(userId);
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(updated),
      this.issueRefreshToken(updated, ctx),
    ]);

    this.track(userId, 'terms_accepted', undefined, ctx);
    return { accessToken, refreshToken, user: this.sanitize(updated) };
  }

  /**
   * Begins linking an OAuth provider to the current account. When the account
   * has a password, the current password is required as proof. Passwordless
   * accounts (pure OAuth / phone) get an emailed LINK_CONFIRM OTP instead.
   * Returns the provider OAuth URL to redirect to once proof is complete.
   */
  async startOauthLink(
    userId: string,
    dto: OauthLinkStartDto,
    ctx: RequestContext,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const field = this.providerField(dto.provider);
    if ((user as Record<string, unknown>)[field]) {
      throw new ConflictException(
        this.i18n()?.t('errors.providerAlreadyLinked') ??
          'This provider is already linked to your account',
      );
    }

    if (user.passwordHash) {
      if (
        !dto.currentPassword ||
        !(await bcrypt.compare(dto.currentPassword, user.passwordHash))
      ) {
        throw new BadRequestException(
          this.i18n()?.t('errors.currentPasswordWrong') ??
            'Current password is wrong',
        );
      }
    } else {
      const issued = await this.verification.issue(userId, 'LINK_CONFIRM');
      await this.mail.sendOtpEmail(
        user.email,
        user.name,
        issued.otp,
        'primary',
        user.locale,
      );
      this.track(user.id, 'oauth_link_intent', dto.provider, ctx);
      return { requiresOtp: true, expiresAt: issued.expiresAt };
    }

    this.track(user.id, 'oauth_link_intent', dto.provider, ctx);
    return { redirectUrl: this.oauthUrl(dto.provider) };
  }

  /** Confirms an OAuth link for a passwordless account using the emailed OTP. */
  async confirmOauthLinkOtp(
    userId: string,
    dto: OauthLinkOtpDto,
    ctx: RequestContext,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const ok = await this.verification.verifyOtp(
      userId,
      'LINK_CONFIRM',
      dto.otp,
    );
    if (!ok) {
      throw new BadRequestException(
        this.i18n()?.t('errors.otpInvalid') ?? 'Invalid verification code',
      );
    }
    this.track(userId, 'oauth_link_intent', dto.provider, ctx);
    return { redirectUrl: this.oauthUrl(dto.provider) };
  }

  /**
   * Attaches an OAuth provider to the signed-in account. Called from the OAuth
   * callback when a signed `fazlaka_link` intent cookie is present.
   */
  async linkOauth(
    userId: string,
    provider: OauthProvider,
    profile: {
      email?: string | null;
      avatarUrl?: string | null;
      name?: string;
      [key: string]: unknown;
    },
    ctx: RequestContext,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const field = this.providerField(provider);
    const profileId = profile[`${provider}Id`] as string | undefined;
    if (!profileId) {
      throw new BadRequestException(
        this.i18n()?.t('errors.invalidProvider') ?? 'Invalid provider',
      );
    }
    if ((user as Record<string, unknown>)[field]) {
      throw new ConflictException(
        this.i18n()?.t('errors.providerAlreadyLinked') ??
          'This provider is already linked to your account',
      );
    }

    const profileEmail = profile.email?.toLowerCase().trim();
    if (profileEmail && user.email.toLowerCase().trim() !== profileEmail) {
      throw new BadRequestException(
        this.i18n()?.t('errors.providerEmailMismatch') ??
          'The provider email does not match your account email',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { [field]: profileId } as unknown as Prisma.UserWhereUniqueInput,
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException(
        this.i18n()?.t('errors.providerAlreadyLinked') ??
          'This provider is already linked to another account',
      );
    }

    const data: Prisma.UserUpdateInput = {
      [field]: profileId,
      ...(profile.avatarUrl && !user.avatarUrl
        ? { avatarUrl: profile.avatarUrl }
        : {}),
    };
    await this.prisma.user.update({ where: { id: userId }, data });

    this.track(userId, `${provider}_linked`, provider, ctx);
    return { success: true, provider };
  }

  /** Removes an OAuth provider from the account (never the last login method). */
  async unlinkProvider(
    userId: string,
    provider: OauthProvider,
    ctx: RequestContext,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const field = this.providerField(provider);
    if (!(user as Record<string, unknown>)[field]) {
      throw new BadRequestException(
        this.i18n()?.t('errors.providerNotLinked') ??
          'This provider is not linked to your account',
      );
    }
    const remaining = this.countLoginMethods(user);
    if (remaining <= 1) {
      throw new BadRequestException(
        this.i18n()?.t('errors.cannotUnlinkLast') ??
          'You must keep at least one sign-in method',
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { [field]: null },
    });
    this.track(userId, `${provider}_unlinked`, provider, ctx);
    return { success: true, provider };
  }

  /** Which sign-in methods are available on the account. */
  async linkStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    return {
      password: !!user.passwordHash,
      phone: !!user.phone,
      google: !!user.googleId,
      github: !!user.githubId,
      facebook: !!user.facebookId,
    };
  }

  /** Signs a short-lived OAuth-link intent (stored in an httpOnly cookie). */
  signLinkIntent(provider: OauthProvider, userId: string): Promise<string> {
    return this.jwt.signAsync(
      { provider, userId },
      { secret: this.config.get<string>('jwt.secret'), expiresIn: 600 },
    );
  }

  /** Verifies an OAuth-link intent cookie. */
  async readLinkIntent(
    token: string,
  ): Promise<{ provider: OauthProvider; userId: string } | null> {
    try {
      return await this.jwt.verifyAsync<{
        provider: OauthProvider;
        userId: string;
      }>(token, { secret: this.config.get<string>('jwt.secret') });
    } catch {
      return null;
    }
  }

  private providerField(
    provider: OauthProvider,
  ): 'googleId' | 'githubId' | 'facebookId' {
    if (provider === 'google') return 'googleId';
    if (provider === 'github') return 'githubId';
    return 'facebookId';
  }

  private oauthUrl(provider: OauthProvider): string {
    const cb = this.config.get<string>(`${provider}.callbackUrl`);
    if (cb) {
      const idx = cb.indexOf('/auth/');
      if (idx > -1) return `${cb.slice(0, idx)}/auth/${provider}`;
    }
    return `http://localhost:3001/auth/${provider}`;
  }

  private countLoginMethods(user: User): number {
    let count = 0;
    if (user.passwordHash) count += 1;
    if (user.phone) count += 1;
    if (user.googleId) count += 1;
    if (user.githubId) count += 1;
    if (user.facebookId) count += 1;
    return count;
  }

  /**
   * Sends a 2FA code to confirm enabling two-factor (user is authenticated).
   */
  async requestEnableTwoFactor(userId: string): Promise<{ expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    if (user.twoFactorEnabled) {
      throw new ConflictException('auth.twoFactorAlreadyEnabled');
    }
    const issued = await this.verification.issue(userId, 'TWO_FACTOR');
    await this.mail.sendOtpEmail(
      user.email,
      user.name,
      issued.otp,
      '2FA',
      user.locale,
    );
    return { expiresAt: issued.expiresAt };
  }

  /**
   * Confirms enabling two-factor after OTP validation.
   */
  async enableTwoFactor(
    userId: string,
    otp: string,
    ctx?: RequestContext,
  ): Promise<void> {
    const ok = await this.verification.verifyOtp(userId, 'TWO_FACTOR', otp);
    if (!ok) {
      throw new BadRequestException(
        this.i18n()?.t('errors.otpInvalid') ?? 'Invalid verification code',
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
    if (ctx) {
      this.track(userId, 'two_factor', 'otp', ctx, 'success', {
        action: 'enabled',
      });
    }
  }

  /**
   * Sends a 2FA code to confirm disabling two-factor (user is authenticated).
   */
  async requestDisableTwoFactor(userId: string): Promise<{ expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    if (!user.twoFactorEnabled) {
      throw new ConflictException('auth.twoFactorNotEnabled');
    }
    const issued = await this.verification.issue(userId, 'TWO_FACTOR');
    await this.mail.sendOtpEmail(
      user.email,
      user.name,
      issued.otp,
      '2FA',
      user.locale,
    );
    return { expiresAt: issued.expiresAt };
  }

  /**
   * Disables two-factor after OTP validation.
   */
  async disableTwoFactor(
    userId: string,
    otp: string,
    ctx?: RequestContext,
  ): Promise<void> {
    const ok = await this.verification.verifyOtp(userId, 'TWO_FACTOR', otp);
    if (!ok) {
      throw new BadRequestException(
        this.i18n()?.t('errors.otpInvalid') ?? 'Invalid verification code',
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false },
    });
    if (ctx) {
      this.track(userId, 'two_factor', 'otp', ctx, 'success', {
        action: 'disabled',
      });
    }
  }

  /**
   * Generates (or reuses) a TOTP secret for the user and returns provisioning
   * data (secret + otpauth URL + QR data URL) to scan with an authenticator app.
   */
  async setupTotp(
    userId: string,
  ): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    if (user.twoFactorEnabled && user.twoFactorMethod === 'APP') {
      throw new ConflictException('auth.twoFactorAlreadyEnabled');
    }
    let secret = user.twoFactorSecret;
    if (!secret) {
      secret = this.totp.generateSecret();
      await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: secret },
      });
    }
    const otpauthUrl = this.totp.buildAuthUrl(secret, user.email, 'Fazlaka');
    const qrDataUrl = await this.totp.qrDataUrl(otpauthUrl);
    return { secret, otpauthUrl, qrDataUrl };
  }

  /**
   * Confirms enabling app-based 2FA after validating the scanned TOTP code.
   */
  async enableTotp(
    userId: string,
    code: string,
    ctx?: RequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    if (user.twoFactorEnabled && user.twoFactorMethod === 'APP') {
      throw new ConflictException('auth.twoFactorAlreadyEnabled');
    }
    if (!user.twoFactorSecret) {
      throw new BadRequestException('auth.totpNotSetup');
    }
    if (!this.totp.verify(user.twoFactorSecret, code)) {
      throw new BadRequestException(
        this.i18n()?.t('errors.otpInvalid') ?? 'Invalid verification code',
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorMethod: 'APP' },
    });
    if (ctx) {
      this.track(userId, 'two_factor', 'totp', ctx, 'success', {
        action: 'enabled',
        method: 'app',
      });
    }
  }

  /**
   * Disables app-based 2FA after validating the current TOTP code.
   */
  async disableTotp(
    userId: string,
    code: string,
    ctx?: RequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    if (!user.twoFactorEnabled || user.twoFactorMethod !== 'APP') {
      throw new ConflictException('auth.twoFactorNotEnabled');
    }
    if (!this.totp.verify(user.twoFactorSecret ?? '', code)) {
      throw new BadRequestException(
        this.i18n()?.t('errors.otpInvalid') ?? 'Invalid verification code',
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorMethod: 'EMAIL',
        twoFactorSecret: null,
      },
    });
    if (ctx) {
      this.track(userId, 'two_factor', 'totp', ctx, 'success', {
        action: 'disabled',
        method: 'app',
      });
    }
  }

  async requestChangeEmail(
    userId: string,
    newEmail: string,
  ): Promise<{ expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const email = newEmail.toLowerCase().trim();
    if (email === user.email) {
      throw new ConflictException('auth.sameEmail');
    }
    await this.assertEmailAvailable(email, userId);

    const issued = await this.verification.issue(userId, 'EMAIL_CHANGE', {
      ttlMs: 30 * 60 * 1000,
    });
    await this.mail.sendOtpEmail(
      email,
      user.name,
      issued.otp,
      'emailChange',
      user.locale,
    );
    return { expiresAt: issued.expiresAt };
  }

  async confirmChangeEmail(
    userId: string,
    newEmail: string,
    otp: string,
    ctx?: RequestContext,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const email = newEmail.toLowerCase().trim();
    const ok = await this.verification.verifyOtp(userId, 'EMAIL_CHANGE', otp);
    if (!ok) {
      throw new BadRequestException(
        this.i18n()?.t('errors.otpInvalid') ?? 'Invalid verification code',
      );
    }
    await this.assertEmailAvailable(email, userId);

    const oldEmail = user.email;
    await this.prisma.$transaction([
      this.prisma.userEmail.create({
        data: {
          userId,
          email: oldEmail,
          isVerified: true,
          verifiedAt: new Date(),
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { email, emailVerified: new Date() },
      }),
    ]);
    await this.revokeAllSessions(userId);
    if (ctx) {
      this.track(userId, 'email_changed', 'otp', ctx);
    }
    return { success: true, email };
  }

  private async assertEmailAvailable(email: string, exceptUserId: string) {
    const byUser = await this.prisma.user.findFirst({ where: { email } });
    if (byUser && byUser.id !== exceptUserId) {
      throw new ConflictException('errors.emailInUse');
    }
    const bySecondary = await this.prisma.userEmail.findUnique({
      where: { email },
    });
    if (bySecondary) {
      throw new ConflictException('errors.emailInUse');
    }
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getSessions(userId: string, currentRefreshToken?: string) {
    let currentId: string | undefined;
    if (currentRefreshToken) {
      const current = await this.prisma.refreshToken.findUnique({
        where: { token: this.hashRefresh(currentRefreshToken) },
      });
      currentId = current?.id;
    }
    const sessions = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        platform: true,
        deviceType: true,
        deviceName: true,
        os: true,
        browser: true,
        ip: true,
        country: true,
        city: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
    return sessions.map((s: any) => ({ ...s, isCurrent: s.id === currentId }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });
    if (!session) {
      throw new NotFoundException(
        this.i18n()?.t('auth.sessionNotFound') ?? 'Session not found',
      );
    }
    await this.prisma.refreshToken.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    const auditCtx = requestAuditStore.getStore() ?? {};
    void this.authEvents.record({
      userId,
      eventType: 'session_revoked',
      method: 'session',
      ctx: auditCtx,
      metadata: { sessionId },
    });
  }

  async revokeOtherSessions(
    userId: string,
    currentRefreshToken?: string,
  ): Promise<{ count: number }> {
    let currentId: string | undefined;
    if (currentRefreshToken) {
      const hashed = this.hashRefresh(currentRefreshToken);
      const current = await this.prisma.refreshToken.findUnique({
        where: { token: hashed },
      });
      currentId = current?.id;
    }
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentId ? { NOT: { id: currentId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return { count: result.count };
  }

  /**
   * Hourly housekeeping: revoke expired refresh tokens and purge used/expired
   * verification tokens so they don't accumulate indefinitely.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    try {
      const [sessions, tokens] = await Promise.all([
        this.prisma.refreshToken.updateMany({
          where: { revokedAt: null, expiresAt: { lte: now } },
          data: { revokedAt: now },
        }),
        this.prisma.verificationToken.deleteMany({
          where: {
            OR: [{ usedAt: { not: null } }, { expiresAt: { lte: now } }],
          },
        }),
      ]);
      if (sessions.count > 0 || tokens.count > 0) {
        this.logger.log(
          `Cleanup: revoked ${sessions.count} expired sessions, purged ${tokens.count} verification tokens`,
        );
      }
    } catch (e) {
      this.logger.error('Session cleanup failed', (e as Error).stack);
    }
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preference: true },
    });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    return {
      ...this.sanitize(user),
      hasPassword: !!user.passwordHash,
      phoneLinked: !!user.phone,
      googleLinked: !!user.googleId,
      githubLinked: !!user.githubId,
      facebookLinked: !!user.facebookId,
    };
  }

  private async sendEmailVerification(user: User): Promise<void> {
    const issued = await this.verification.issue(user.id, 'EMAIL_VERIFY', {
      ttlMs: 24 * 60 * 60 * 1000,
    });
    const verifyLink = `${this.verifyBaseUrl()}/verify-email?token=${issued.token}`;
    await this.mail.sendVerificationEmail(user.email, user.name, {
      link: verifyLink,
      otp: issued.otp,
      locale: user.locale,
    });
  }

  private async sendTwoFactorOtp(user: User): Promise<void> {
    const issued = await this.verification.issue(user.id, 'TWO_FACTOR', {
      ttlMs: 5 * 60 * 1000,
    });
    await this.mail.sendOtpEmail(
      user.email,
      user.name,
      issued.otp,
      '2FA',
      user.locale,
    );
  }

  private assertAllowed(user: User): void {
    if (user.status === 'suspended') {
      throw new ForbiddenException(
        this.i18n()?.t('errors.accountSuspended') ?? 'Account suspended',
      );
    }
    if (user.status === 'banned') {
      throw new ForbiddenException(
        this.i18n()?.t('errors.accountBanned') ?? 'Account banned',
      );
    }
  }

  private async generateUniqueUsername(base: string): Promise<string> {
    const slug =
      base
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '.')
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, 20) || 'user';
    let candidate = slug;
    let n = 1;
    while (
      await this.prisma.user.findUnique({ where: { username: candidate } })
    ) {
      candidate = `${slug}${n++}`;
    }
    return candidate;
  }

  sanitize(user: User): Partial<User> {
    const { passwordHash, twoFactorSecret, ...rest } = user;
    void passwordHash;
    void twoFactorSecret;
    return rest;
  }
}
