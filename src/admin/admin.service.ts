import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Admin, AdminRank } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GeoService } from '../common/geo/geo.service';
import { MailService } from '../mail/mail.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import {
  AdminJwtPayload,
  RequestContext,
} from '../common/types/request-context';
import { randomToken } from '../common/utils/helpers';
import { AdminAuthEventsService } from './admin-events.service';
import {
  AdminLoginDto,
  AdminOtpDto,
  ChangeAdminPasswordDto,
  CreateAdminDto,
  UpdateAdminDto,
} from './dto/admin.dto';

export interface AdminTokenPair {
  accessToken: string;
  refreshToken: string;
}

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly geo: GeoService,
    private readonly mail: MailService,
    private readonly adminEvents: AdminAuthEventsService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  private err(key: string, fallback: string): string {
    return this.i18n()?.t(`errors.${key}`) ?? fallback;
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private hashRefresh(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private hashOtp(value: string): string {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
  }

  private adminSecret(): string {
    return this.config.get<string>('adminJwt.secret') || 'dev-admin-secret';
  }

  private refreshTtlMs(): number {
    const raw = this.config.get<string>('adminJwt.refreshExpiresIn') || '7d';
    if (raw.endsWith('d')) return parseInt(raw, 10) * 24 * 60 * 60 * 1000;
    if (raw.endsWith('h')) return parseInt(raw, 10) * 60 * 60 * 1000;
    return 7 * 24 * 60 * 60 * 1000;
  }

  private async issueAccessToken(admin: Admin): Promise<string> {
    const payload: AdminJwtPayload = {
      sub: admin.id,
      username: admin.username,
      rank: admin.rank,
      permissions: admin.permissions,
    };
    return this.jwt.signAsync(payload, {
      secret: this.adminSecret(),
      expiresIn: (this.config.get<string>('adminJwt.expiresIn') ||
        '2h') as never,
    });
  }

  private async issueRefreshToken(
    admin: Admin,
    ctx: RequestContext,
  ): Promise<string> {
    const raw = randomToken(48);
    const hashed = this.hashRefresh(raw);
    await this.prisma.adminRefreshToken.create({
      data: {
        token: hashed,
        adminId: admin.id,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        deviceType: ctx.deviceType,
        deviceName: ctx.deviceName,
        os: ctx.os,
        browser: ctx.browser,
        country: ctx.country,
        countryCode: ctx.countryCode,
        city: ctx.city,
        lat: ctx.lat,
        lng: ctx.lng,
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    });
    return raw;
  }

  private maskEmail(email?: string | null): string | null {
    if (!email || !email.includes('@')) return email ?? null;
    const [user, domain] = email.split('@');
    const masked =
      user.length <= 2 ? user[0] + '***' : user.slice(0, 2) + '***';
    return `${masked}@${domain}`;
  }

  private async buildLoginTicket(admin: Admin): Promise<string> {
    return this.jwt.signAsync(
      { sub: admin.id, purpose: 'admin-login-ticket' },
      {
        secret: this.adminSecret(),
        expiresIn: '5m' as never,
      },
    );
  }

  private async resolveTicket(ticket: string): Promise<Admin> {
    let payload: { sub?: string; purpose?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: string; purpose?: string }>(
        ticket,
        { secret: this.adminSecret() },
      );
    } catch {
      throw new UnauthorizedException(
        this.err('sessionExpired', 'Session expired, please sign in again'),
      );
    }
    if (!payload.sub || payload.purpose !== 'admin-login-ticket') {
      throw new UnauthorizedException(
        this.err('sessionExpired', 'Session expired, please sign in again'),
      );
    }
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
    });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException(
        this.err('adminInactive', 'This admin account is disabled'),
      );
    }
    return admin;
  }

  private async sendAdminOtp(admin: Admin): Promise<void> {
    const recent = await this.prisma.adminOtp.findFirst({
      where: { adminId: admin.id, purpose: '2fa', usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      throw new HttpException(
        this.err(
          'otpThrottled',
          'Too many requests, wait a minute and try again',
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await this.prisma.adminOtp.create({
      data: {
        adminId: admin.id,
        otpHash: this.hashOtp(otp),
        otpExpiresAt: expiresAt,
        purpose: '2fa',
      },
    });
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[DEV] Admin 2FA OTP for ${admin.username}: ${otp}`);
    }
    if (admin.email) {
      await this.mail.sendOtpEmail(
        admin.email,
        admin.displayName || admin.username,
        otp,
        '2FA',
        this.i18n()?.lang,
      );
    }
  }

  private async applyGeo(ctx: RequestContext): Promise<{
    geoCtx: RequestContext;
    ipInfo: import('../common/geo/geo.service').GeoLocationInfo;
  }> {
    const info = await this.geo.lookupIp(ctx.ip);
    return {
      geoCtx: {
        ...ctx,
        country: ctx.country || info.country,
        countryCode: ctx.countryCode || info.countryCode,
        city: ctx.city || info.city,
        lat: ctx.lat ?? info.lat,
        lng: ctx.lng ?? info.lng,
      },
      ipInfo: info,
    };
  }

  async login(
    dto: AdminLoginDto,
    ctx: RequestContext,
  ): Promise<
    | (AdminTokenPair & { admin: Partial<Admin> })
    | {
        requires2fa: true;
        ticket: string;
        emailMasked: string | null;
        admin: Partial<Admin>;
      }
  > {
    const clientLat = dto.geo?.lat ?? ctx.lat;
    const clientLng = dto.geo?.lng ?? ctx.lng;
    const { geoCtx, ipInfo } = await this.applyGeo({
      ...ctx,
      lat: clientLat,
      lng: clientLng,
    });
    const admin = await this.prisma.admin.findUnique({
      where: { username: dto.username.toLowerCase().trim() },
    });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.credentialsInvalid') ?? 'Invalid credentials',
      );
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      await this.adminEvents.record({
        adminId: admin.id,
        eventType: 'lockout',
        status: 'failed',
        ctx: geoCtx,
        metadata: { reason: 'account_locked' },
      });
      throw new ForbiddenException(
        this.err(
          'adminLocked',
          'Admin sign-in temporarily locked. Try again in 15 minutes',
        ),
      );
    }

    const valid = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!valid) {
      const count = admin.failedLoginCount + 1;
      const shouldLock = count >= LOCKOUT_THRESHOLD;
      await this.prisma.admin.update({
        where: { id: admin.id },
        data: {
          failedLoginCount: count,
          lockedUntil: shouldLock
            ? new Date(Date.now() + LOCKOUT_DURATION_MS)
            : null,
        },
      });
      await this.adminEvents.record({
        adminId: admin.id,
        eventType: 'failed_login',
        status: 'failed',
        method: 'password',
        ctx: geoCtx,
        metadata: { attempts: count, locked: shouldLock },
      });
      await this.audit.record(
        admin.id,
        'admin.login_failed',
        'admin',
        admin.id,
        {
          attempts: count,
        },
      );
      throw new UnauthorizedException(
        this.i18n()?.t('errors.credentialsInvalid') ?? 'Invalid credentials',
      );
    }

    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const compare = this.geo.compareCoordinates(
      clientLat,
      clientLng,
      ipInfo.lat,
      ipInfo.lng,
    );
    if (compare?.mismatch) {
      await this.adminEvents.record({
        adminId: admin.id,
        eventType: 'geo_mismatch',
        status: 'failed',
        method: 'password',
        ctx: geoCtx,
        metadata: { distanceKm: compare.distanceKm },
      });
    }

    await this.adminEvents.record({
      adminId: admin.id,
      eventType: 'login',
      status: 'success',
      method: 'password',
      ctx: geoCtx,
    });
    await this.audit.record(
      admin.id,
      'admin.login',
      'admin',
      admin.id,
      undefined,
      geoCtx,
    );

    if (admin.email && admin.twoFactorEnabled) {
      const ticket = await this.buildLoginTicket(admin);
      await this.sendAdminOtp(admin);
      return {
        requires2fa: true,
        ticket,
        emailMasked: this.maskEmail(admin.email),
        admin: this.sanitize(admin),
      };
    }

    await this.updateLastLogin(admin, geoCtx);
    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(admin),
      this.issueRefreshToken(admin, geoCtx),
    ]);
    return { accessToken, refreshToken, admin: this.sanitize(admin) };
  }

  async verify2fa(
    dto: AdminOtpDto,
    ctx: RequestContext,
  ): Promise<AdminTokenPair & { admin: Partial<Admin> }> {
    const { geoCtx } = await this.applyGeo(ctx);
    const admin = await this.resolveTicket(dto.ticket);

    const record = await this.prisma.adminOtp.findFirst({
      where: {
        adminId: admin.id,
        purpose: '2fa',
        usedAt: null,
        otpExpiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      throw new BadRequestException(
        this.err('otpInvalid', 'Verification code is incorrect or expired'),
      );
    }

    const ok = this.hashOtp(String(dto.otp).trim()) === record.otpHash;
    if (!ok) {
      const attempts = record.attempts + 1;
      await this.prisma.adminOtp.update({
        where: { id: record.id },
        data: { attempts },
      });
      await this.adminEvents.record({
        adminId: admin.id,
        eventType: 'two_factor',
        status: 'failed',
        method: 'otp',
        ctx: geoCtx,
        metadata: { attempts },
      });
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await this.prisma.admin.update({
          where: { id: admin.id },
          data: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) },
        });
        await this.adminEvents.record({
          adminId: admin.id,
          eventType: 'lockout',
          status: 'failed',
          method: 'otp',
          ctx: geoCtx,
          metadata: { reason: 'otp_exhausted' },
        });
      }
      throw new BadRequestException(
        this.err('otpInvalid', 'Verification code is incorrect or expired'),
      );
    }

    await this.prisma.adminOtp.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await this.adminEvents.record({
      adminId: admin.id,
      eventType: 'two_factor',
      status: 'success',
      method: 'otp',
      ctx: geoCtx,
    });
    await this.updateLastLogin(admin, geoCtx);
    await this.audit.record(
      admin.id,
      'admin.login',
      'admin',
      admin.id,
      {
        method: 'otp',
      },
      geoCtx,
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(admin),
      this.issueRefreshToken(admin, geoCtx),
    ]);
    return { accessToken, refreshToken, admin: this.sanitize(admin) };
  }

  async resendOtp(ticket: string): Promise<{ emailMasked: string | null }> {
    const admin = await this.resolveTicket(ticket);
    await this.sendAdminOtp(admin);
    return { emailMasked: this.maskEmail(admin.email) };
  }

  private async updateLastLogin(admin: Admin, ctx: RequestContext) {
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ctx.ip,
        lastLoginCountry: ctx.country,
        lastLoginCity: ctx.city,
        lastLoginLat: ctx.lat,
        lastLoginLng: ctx.lng,
        lastLoginDevice: ctx.deviceType,
        lastLoginBrowser: ctx.browser,
        lastLoginOs: ctx.os,
      },
    });
  }

  async refresh(
    refreshToken: string,
    ctx: RequestContext,
  ): Promise<AdminTokenPair> {
    const { geoCtx } = await this.applyGeo(ctx);
    const hashed = this.hashRefresh(refreshToken);
    const stored = await this.prisma.adminRefreshToken.findUnique({
      where: { token: hashed },
      include: { admin: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      if (stored && !stored.revokedAt) {
        await this.prisma.adminRefreshToken.update({
          where: { id: stored.id },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException(
        this.i18n()?.t('errors.invalidRefreshToken') ?? 'Invalid refresh token',
      );
    }
    if (!stored.admin.isActive) {
      throw new ForbiddenException(
        this.err('adminInactive', 'This admin account is disabled'),
      );
    }

    await this.prisma.adminRefreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    await this.adminEvents.record({
      adminId: stored.admin.id,
      eventType: 'refresh',
      status: 'success',
      method: 'refresh_token',
      ctx: geoCtx,
    });

    const accessToken = await this.issueAccessToken(stored.admin);
    const newRefresh = await this.issueRefreshToken(stored.admin, geoCtx);
    return { accessToken, refreshToken: newRefresh };
  }

  async logout(refreshToken: string, ctx: RequestContext): Promise<void> {
    const hashed = this.hashRefresh(refreshToken);
    const stored = await this.prisma.adminRefreshToken.findUnique({
      where: { token: hashed },
    });
    if (stored && !stored.revokedAt) {
      await this.prisma.adminRefreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      await this.adminEvents.record({
        adminId: stored.adminId,
        eventType: 'logout',
        status: 'success',
        method: 'refresh_token',
        ctx,
      });
    }
  }

  async getMe(adminId: string): Promise<Partial<Admin>> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });
    if (!admin) {
      throw new UnauthorizedException(
        this.i18n()?.t('errors.userNotFound') ?? 'Admin not found',
      );
    }
    return this.sanitize(admin);
  }

  async changePassword(adminId: string, dto: ChangeAdminPasswordDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });
    if (!admin) {
      throw new UnauthorizedException(
        this.err('adminNotFound', 'Admin not found'),
      );
    }
    const valid = await bcrypt.compare(dto.currentPassword, admin.passwordHash);
    if (!valid) {
      throw new ConflictException('errors.currentPasswordWrong');
    }
    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.prisma.admin.update({
      where: { id: adminId },
      data: { passwordHash },
    });
    await this.prisma.adminRefreshToken.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record(adminId, 'admin.change_password', 'admin', adminId);
    return { success: true };
  }

  // ---- Super-admin admin management ----

  private assertSuperAdmin(actor: Admin): void {
    if (actor.rank !== AdminRank.SUPER_ADMIN) {
      throw new ForbiddenException(
        this.err('superAdminOnly', 'Only super admins can perform this action'),
      );
    }
  }

  async createAdmin(actor: Admin, dto: CreateAdminDto) {
    this.assertSuperAdmin(actor);
    const username = dto.username.toLowerCase().trim();
    const exists = await this.prisma.admin.findUnique({ where: { username } });
    if (exists) {
      throw new ConflictException(
        this.err(
          'adminUsernameTaken',
          'This username is already used by another admin',
        ),
      );
    }
    if (dto.email) {
      const emailExists = await this.prisma.admin.findUnique({
        where: { email: dto.email.toLowerCase().trim() },
      });
      if (emailExists) {
        throw new ConflictException(
          this.err(
            'adminEmailTaken',
            'This email is already used by another admin',
          ),
        );
      }
    }
    const admin = await this.prisma.admin.create({
      data: {
        username,
        email: dto.email?.toLowerCase().trim() ?? null,
        emailVerified: false,
        displayName: dto.displayName,
        avatarUrl: dto.avatarUrl,
        passwordHash: await this.hashPassword(dto.password),
        rank: dto.rank ?? 'ADMIN',
        permissions: dto.permissions ?? [],
        platforms: dto.platforms ?? ['WEB'],
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.record(actor.id, 'admin.create', 'admin', admin.id, {
      username,
      email: admin.email,
      rank: admin.rank,
      label: admin.displayName || username,
    });
    return this.sanitize(admin);
  }

  async listAdmins(actor: Admin, page: number, limit: number) {
    this.assertSuperAdmin(actor);
    const { skip } = resolvePagination({ page, limit });
    const [data, total] = await Promise.all([
      this.prisma.admin.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          email: true,
          avatarUrl: true,
          displayName: true,
          rank: true,
          permissions: true,
          platforms: true,
          isActive: true,
          twoFactorEnabled: true,
          lastLoginAt: true,
          lastLoginIp: true,
          lastLoginCountry: true,
          lastLoginCity: true,
          lastLoginDevice: true,
          lastLoginBrowser: true,
          lastLoginOs: true,
          createdAt: true,
        },
      }),
      this.prisma.admin.count(),
    ]);
    return { data, meta: buildMeta(total, page, limit) };
  }

  async getAdmin(actor: Admin, id: string) {
    this.assertSuperAdmin(actor);
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) {
      throw new NotFoundException(this.err('adminNotFound', 'Admin not found'));
    }
    return this.sanitize(admin);
  }

  async updateAdmin(actor: Admin, id: string, dto: UpdateAdminDto) {
    this.assertSuperAdmin(actor);
    const target = await this.prisma.admin.findUnique({ where: { id } });
    if (!target) {
      throw new NotFoundException(this.err('adminNotFound', 'Admin not found'));
    }
    // Never allow an admin to demote or deactivate themselves.
    if (target.id === actor.id) {
      if (dto.rank && dto.rank !== actor.rank) {
        throw new ForbiddenException(
          this.err(
            'cannotModifySelf',
            'You cannot modify your own account this way',
          ),
        );
      }
      if (dto.isActive === false) {
        throw new ForbiddenException(
          this.err(
            'cannotModifySelf',
            'You cannot modify your own account this way',
          ),
        );
      }
    }
    if (dto.email) {
      const email = dto.email.toLowerCase().trim();
      const emailExists = await this.prisma.admin.findFirst({
        where: { email, NOT: { id } },
      });
      if (emailExists) {
        throw new ConflictException(
          this.err(
            'adminEmailTaken',
            'This email is already used by another admin',
          ),
        );
      }
    }
    const admin = await this.prisma.admin.update({
      where: { id },
      data: {
        email:
          dto.email !== undefined ? dto.email.toLowerCase().trim() : undefined,
        emailVerified:
          dto.email !== undefined && dto.email !== target.email
            ? false
            : undefined,
        displayName: dto.displayName,
        avatarUrl: dto.avatarUrl,
        rank: dto.rank,
        permissions: dto.permissions,
        platforms: dto.platforms,
        isActive: dto.isActive,
        twoFactorEnabled: dto.twoFactorEnabled,
        ...(dto.password
          ? { passwordHash: await this.hashPassword(dto.password) }
          : {}),
      },
    });
    if (
      dto.isActive === false ||
      dto.password ||
      dto.twoFactorEnabled === true
    ) {
      await this.prisma.adminRefreshToken.updateMany({
        where: { adminId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.record(actor.id, 'admin.update', 'admin', id, {
      email: dto.email,
      rank: dto.rank,
      isActive: dto.isActive,
      passwordReset: !!dto.password,
      twoFactorEnabled: dto.twoFactorEnabled,
      permissions: dto.permissions,
      label: target.displayName || target.username,
    });
    return this.sanitize(admin);
  }

  async removeAdmin(actor: Admin, id: string) {
    this.assertSuperAdmin(actor);
    if (actor.id === id) {
      throw new ForbiddenException(
        this.err(
          'cannotModifySelf',
          'You cannot modify your own account this way',
        ),
      );
    }
    const target = await this.prisma.admin.findUnique({ where: { id } });
    if (!target) {
      throw new NotFoundException(this.err('adminNotFound', 'Admin not found'));
    }
    await this.prisma.admin.delete({ where: { id } });
    await this.audit.record(actor.id, 'admin.remove', 'admin', id, {
      username: target.username,
      label: target.displayName || target.username,
    });
    return { success: true };
  }

  sanitize(admin: Admin): Partial<Admin> {
    const { passwordHash, twoFactorSecret, ...rest } = admin;
    void passwordHash;
    void twoFactorSecret;
    return rest;
  }
}
