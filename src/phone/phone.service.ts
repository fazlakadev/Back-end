import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nContext, I18nService } from 'nestjs-i18n';
import * as crypto from 'crypto';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuthEventsService } from '../auth-events/auth-events.service';
import { TelegramService } from '../telegram/telegram.service';

const PHONE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_PENDING = 5;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

export type PhoneChallengeStatus = 'code_sent' | 'not_linked';

@Injectable()
export class PhoneService {
  private readonly logger = new Logger(PhoneService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
    private readonly authEvents: AuthEventsService,
    private readonly i18n: I18nService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegram: TelegramService,
  ) {}

  botUsername(): string {
    return (
      this.config.get<string>('telegram.botUsername') || 'Fazlaka_Auth_bot'
    );
  }

  normalizePhone(raw: string): string {
    const cleaned = String(raw ?? '')
      .replace(/[\s\-().]/g, '')
      .trim();
    if (!PHONE_RE.test(cleaned)) {
      throw new BadRequestException(this.current('errors.phoneInvalid'));
    }
    return cleaned;
  }

  private hash(value: string): string {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
  }

  private genCode(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private t(key: string, lang: string, args?: Record<string, string>): string {
    try {
      return this.i18n.t(key, { lang, args });
    } catch {
      return key;
    }
  }

  private current(key: string): string {
    const ctx = I18nContext.current();
    if (ctx) {
      try {
        return ctx.t(key);
      } catch {
        return key;
      }
    }
    return this.t(key, 'en');
  }

  /**
   * Creates a pending phone verification. If the phone is already linked to a
   * Telegram chat, the code is pushed to that chat (status `code_sent`);
   * otherwise the user must first share their phone with the bot
   * (status `not_linked`).
   */
  async requestVerification(userId: string, phoneRaw: string) {
    const phone = this.normalizePhone(phoneRaw);

    const taken = await this.prisma.user.findFirst({
      where: { phone, id: { not: userId } },
      select: { id: true },
    });
    if (taken) throw new ConflictException(this.current('errors.phoneInUse'));

    const recent = await this.prisma.phoneVerification.findFirst({
      where: {
        userId,
        usedAt: null,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new HttpException(
        this.current('errors.phoneVerifyThrottled'),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const pendingCount = await this.prisma.phoneVerification.count({
      where: {
        userId,
        usedAt: null,
        createdAt: { gt: new Date(Date.now() - PHONE_TTL_MS) },
      },
    });
    if (pendingCount >= MAX_PENDING) {
      throw new HttpException(
        this.current('errors.phoneVerifyThrottled'),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.genCode();
    const expiresAt = new Date(Date.now() + PHONE_TTL_MS);
    const record = await this.prisma.phoneVerification.create({
      data: {
        userId,
        phone,
        codeHash: this.hash(code),
        expiresAt,
        attempts: 0,
      },
    });
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(
        `[DEV] Phone code for user ${userId} (${phone}): ${code}`,
      );
    }

    const link = await this.prisma.telegramLink.findUnique({
      where: { phone },
    });
    if (link) {
      await this.sendCodeToChat(link, phone, code, expiresAt);
    }

    return this.challengePayload(
      record.id,
      phone,
      link ? 'code_sent' : 'not_linked',
    );
  }

  /**
   * Re-sends the verification code for an existing pending verification. The
   * code is pushed to the linked Telegram chat when available.
   */
  async resendCode(verificationId: string, phoneRaw: string) {
    const phone = this.normalizePhone(phoneRaw);
    const record = await this.prisma.phoneVerification.findUnique({
      where: { id: verificationId },
    });
    if (
      !record ||
      record.phone !== phone ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new BadRequestException(this.current('errors.phoneCodeInvalid'));
    }
    if (Date.now() - record.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new HttpException(
        this.current('errors.phoneVerifyThrottled'),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.genCode();
    const expiresAt = new Date(Date.now() + PHONE_TTL_MS);
    await this.prisma.phoneVerification.update({
      where: { id: record.id },
      data: {
        codeHash: this.hash(code),
        expiresAt,
        attempts: 0,
        createdAt: new Date(),
      },
    });
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(
        `[DEV] Phone code (resend) for user ${record.userId} (${phone}): ${code}`,
      );
    }

    const link = await this.prisma.telegramLink.findUnique({
      where: { phone },
    });
    if (link) {
      await this.sendCodeToChat(link, phone, code, expiresAt);
    }
    return {
      status: link ? ('code_sent' as const) : ('not_linked' as const),
      resendAt: Date.now() + RESEND_COOLDOWN_MS,
      expiresIn: PHONE_TTL_MS,
    };
  }

  /** Link status for a phone (whether it has shared its number with the bot). */
  async getLink(phoneRaw: string) {
    const phone = this.normalizePhone(phoneRaw);
    return this.prisma.telegramLink.findUnique({ where: { phone } });
  }

  /**
   * Completes a phone verification using the code the user entered on the
   * website (the code was pushed to their Telegram chat).
   */
  async completeCode(phoneRaw: string, code: string): Promise<User> {
    const phone = this.normalizePhone(phoneRaw);
    const link = await this.prisma.telegramLink.findUnique({
      where: { phone },
    });
    return this.completeVerification(phone, code, {
      chatId: link?.chatId,
      username: link?.username ?? undefined,
    });
  }

  private challengePayload(
    verificationId: string,
    phone: string,
    status: PhoneChallengeStatus,
  ) {
    const username = this.botUsername();
    return {
      verificationId,
      phone,
      status,
      botUsername: username,
      botUrl: `https://t.me/${username}`,
      expiresIn: PHONE_TTL_MS,
    };
  }

  private async chatLang(chatId: string): Promise<string> {
    try {
      const user = await this.prisma.user.findFirst({
        where: { telegramChatId: chatId },
        select: { locale: true },
      });
      if (user?.locale) return user.locale.toLowerCase();
    } catch {
      /* ignore */
    }
    return 'ar';
  }

  private async sendCodeToChat(
    link: { chatId: string; username?: string | null },
    phone: string,
    code: string,
    expiresAt: Date,
  ) {
    const minutes = Math.max(
      1,
      Math.round((expiresAt.getTime() - Date.now()) / 60_000),
    );
    const lang = await this.chatLang(link.chatId);
    const text = this.t('common.telegramVerificationCode', lang, {
      phone,
      code,
      minutes: String(minutes),
    });
    await this.telegram.sendMessage(Number(link.chatId), text);
  }

  /**
   * Called by the Telegram bot after the user sends /verify <phone> <code>.
   * Marks the phone verified, stores the Telegram link and notifies the app.
   */
  async completeVerification(
    phoneRaw: string,
    code: string,
    telegram?: { chatId?: string; username?: string },
  ): Promise<User> {
    const phone = this.normalizePhone(phoneRaw);

    const record = await this.prisma.phoneVerification.findFirst({
      where: { phone, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException(this.current('errors.phoneCodeInvalid'));
    }

    const ok = record.codeHash === this.hash(String(code).trim());
    if (!ok) {
      await this.prisma.phoneVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(this.current('errors.phoneCodeInvalid'));
    }

    const taken = await this.prisma.user.findFirst({
      where: { phone, id: { not: record.userId } },
      select: { id: true },
    });
    if (taken) throw new ConflictException(this.current('errors.phoneInUse'));

    await this.prisma.$transaction([
      this.prisma.phoneVerification.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          phone,
          phoneVerifiedAt: new Date(),
          telegramChatId: telegram?.chatId ?? undefined,
          telegramUsername: telegram?.username ?? undefined,
        },
      }),
    ]);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: record.userId },
    });

    await this.realtime.triggerToUser(user.id, 'phone:verified', {
      phone,
      telegramUsername: telegram?.username ?? null,
    });

    const lang = (user.locale || 'ar').toLowerCase();
    const notification = await this.prisma.notification.create({
      data: {
        userId: user.id,
        type: 'system',
        title: this.t('common.phoneVerifiedTitle', lang),
        body: this.t('common.phoneVerifiedBody', lang, { phone }),
        data: { phone },
      },
    });
    await this.realtime.triggerToUser(user.id, 'notification:new', {
      notification,
    });

    await this.authEvents.record({
      userId: user.id,
      eventType: 'phone_verified',
      method: 'telegram',
      metadata: { phone, telegramUsername: telegram?.username ?? null },
    });

    return user;
  }

  async remove(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.phone && !user.phoneVerifiedAt) {
      return { phone: null, phoneVerifiedAt: null };
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { phone: null, phoneVerifiedAt: null },
    });
    await this.authEvents.record({
      userId,
      eventType: 'phone_removed',
      method: 'telegram',
      metadata: { removedPhone: user.phone ?? undefined },
    });
    return { phone: updated.phone, phoneVerifiedAt: updated.phoneVerifiedAt };
  }
}
