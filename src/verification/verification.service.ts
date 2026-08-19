import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { VerificationToken } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { randomToken } from '../common/utils/helpers';

export type VerificationType =
  | 'EMAIL_VERIFY'
  | 'PASSWORD_RESET'
  | 'EMAIL_CHANGE'
  | 'TWO_FACTOR'
  | 'SECONDARY_VERIFY'
  | 'LINK_CONFIRM';

export interface IssuedVerification {
  otp: string;
  token: string;
  expiresAt: Date;
}

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  private hash(value: string): string {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
  }

  private genOtp(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /**
   * Issues a new verification record carrying both a quick-link token and an
   * OTP (otpHash stored). Enforces a 60s resend cooldown per (userId, type).
   */
  async issue(
    userId: string,
    type: VerificationType,
    opts?: { ttlMs?: number },
  ): Promise<IssuedVerification> {
    const recent = await this.prisma.verificationToken.findFirst({
      where: { userId, type, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      throw new HttpException(
        'auth.otpThrottled',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = this.genOtp();
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + (opts?.ttlMs ?? OTP_TTL_MS));

    await this.prisma.verificationToken.create({
      data: {
        token,
        userId,
        type,
        expiresAt,
        otpHash: this.hash(otp),
        otpExpiresAt: expiresAt,
        attempts: 0,
      },
    });
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[DEV] OTP for ${type} (user ${userId}): ${otp}`);
    }
    return { otp, token, expiresAt };
  }

  /**
   * Verifies an OTP for a (userId, type). Fails after MAX_ATTEMPTS wrong tries.
   * By default consumes the record (marks usedAt). Pass { consume: false } to
   * only validate without consuming (e.g. pre-check before confirm).
   */
  async verifyOtp(
    userId: string,
    type: VerificationType,
    otp: string,
    opts?: { consume?: boolean },
  ): Promise<boolean> {
    const record = await this.prisma.verificationToken.findFirst({
      where: {
        userId,
        type,
        usedAt: null,
        otpExpiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) return false;
    if (record.attempts >= MAX_ATTEMPTS) return false;

    const ok =
      record.otpHash != null &&
      record.otpHash === this.hash(String(otp).trim());
    if (!ok) {
      await this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      return false;
    }
    if (opts?.consume !== false) {
      await this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
    }
    return true;
  }

  /**
   * Verifies a quick-link token. By default consumes it.
   */
  async verifyToken(
    token: string,
    type: VerificationType,
    opts?: { consume?: boolean },
  ): Promise<VerificationToken | null> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { token },
    });
    if (
      !record ||
      record.type !== type ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      return null;
    }
    if (opts?.consume !== false) {
      await this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
    }
    return record;
  }

  /**
   * Latest live (unused, unexpired) OTP record for resend/mail purposes.
   */
  async latest(userId: string, type: VerificationType) {
    return this.prisma.verificationToken.findFirst({
      where: {
        userId,
        type,
        usedAt: null,
        otpExpiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  requireOtp(value: string): string {
    const otp = String(value ?? '').trim();
    if (!/^\d{6}$/.test(otp)) {
      throw new BadRequestException('auth.otpInvalid');
    }
    return otp;
  }
}
