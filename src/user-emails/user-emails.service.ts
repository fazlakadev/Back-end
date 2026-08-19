import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { VerificationService } from '../verification/verification.service';
import { MailService } from '../mail/mail.service';
import { AuthEventsService } from '../auth-events/auth-events.service';
import { requestAuditStore } from '../common/middleware/request-audit.middleware';
import {
  AddUserEmailDto,
  MakePrimaryUserEmailDto,
  RemoveUserEmailDto,
  VerifyUserEmailDto,
} from './dto/user-email.dto';

@Injectable()
export class UserEmailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: VerificationService,
    private readonly mail: MailService,
    private readonly authEvents: AuthEventsService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  async list(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { secondaryEmails: { orderBy: { createdAt: 'asc' } } },
    });
    if (!user) {
      throw new NotFoundException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    return {
      primary: {
        email: user.email,
        isVerified: !!user.emailVerified,
      },
      secondary: user.secondaryEmails.map((e: any) => ({
        id: e.id,
        email: e.email,
        isVerified: e.isVerified,
        createdAt: e.createdAt,
      })),
    };
  }

  async add(userId: string, dto: AddUserEmailDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const email = dto.email.toLowerCase().trim();

    if (email === user.email) {
      throw new ConflictException('userEmails.isPrimary');
    }
    const existing = await this.prisma.userEmail.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('errors.emailInUse');
    }

    const record = await this.prisma.userEmail.create({
      data: { userId, email },
    });

    const issued = await this.verification.issue(userId, 'SECONDARY_VERIFY', {
      ttlMs: 30 * 60 * 1000,
    });
    await this.mail.sendOtpEmail(
      email,
      user.name,
      issued.otp,
      'secondary',
      user.locale,
    );
    this.trackEmailEvent(userId, 'secondary_email_added', email);

    return {
      id: record.id,
      email: record.email,
      isVerified: false,
      hint: 'Check your inbox for the verification code.',
    };
  }

  private trackEmailEvent(userId: string, eventType: string, email: string) {
    const auditCtx = requestAuditStore.getStore() ?? {};
    void this.authEvents.record({
      userId,
      eventType,
      method: 'email',
      ctx: auditCtx,
      metadata: { email },
    });
  }

  async verify(userId: string, dto: VerifyUserEmailDto) {
    const email = dto.email.toLowerCase().trim();
    const record = await this.prisma.userEmail.findFirst({
      where: { userId, email },
    });
    if (!record) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (record.isVerified) {
      return { success: true, email: record.email, alreadyVerified: true };
    }

    if (dto.otp) {
      const ok = await this.verification.verifyOtp(
        userId,
        'SECONDARY_VERIFY',
        dto.otp,
      );
      if (!ok) {
        throw new BadRequestException(
          this.i18n()?.t('errors.otpInvalid') ?? 'Invalid code',
        );
      }
    } else if (dto.token) {
      const tokenRecord = await this.verification.verifyToken(
        dto.token,
        'SECONDARY_VERIFY',
      );
      if (!tokenRecord || tokenRecord.userId !== userId) {
        throw new BadRequestException(
          this.i18n()?.t('errors.invalidToken') ?? 'Invalid token',
        );
      }
    } else {
      throw new BadRequestException(
        this.i18n()?.t('errors.invalidToken') ?? 'Missing code',
      );
    }

    await this.prisma.userEmail.update({
      where: { id: record.id },
      data: { isVerified: true, verifiedAt: new Date() },
    });
    this.trackEmailEvent(userId, 'secondary_email_verified', record.email);
    return { success: true, email: record.email, alreadyVerified: false };
  }

  async remove(userId: string, dto: RemoveUserEmailDto) {
    const email = dto.email.toLowerCase().trim();
    const record = await this.prisma.userEmail.findFirst({
      where: { userId, email },
    });
    if (!record) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    await this.prisma.userEmail.delete({ where: { id: record.id } });
    this.trackEmailEvent(userId, 'secondary_email_removed', email);
    return { success: true, removed: email };
  }

  async requestPrimary(userId: string, dto: AddUserEmailDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const email = dto.email.toLowerCase().trim();
    if (email === user.email) {
      throw new BadRequestException('userEmails.alreadyPrimary');
    }
    const target = await this.prisma.userEmail.findFirst({
      where: { userId, email },
    });
    if (!target || !target.isVerified) {
      throw new BadRequestException('userEmails.notVerified');
    }

    const issued = await this.verification.issue(userId, 'SECONDARY_VERIFY', {
      ttlMs: 30 * 60 * 1000,
    });
    await this.mail.sendOtpEmail(
      email,
      user.name,
      issued.otp,
      'primary',
      user.locale,
    );
    return { expiresAt: issued.expiresAt };
  }

  async makePrimary(userId: string, dto: MakePrimaryUserEmailDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const email = dto.email.toLowerCase().trim();
    if (email === user.email) {
      throw new BadRequestException('userEmails.alreadyPrimary');
    }

    const target = await this.prisma.userEmail.findFirst({
      where: { userId, email },
    });
    if (!target || !target.isVerified) {
      throw new BadRequestException('userEmails.notVerified');
    }

    const ok = await this.verification.verifyOtp(
      userId,
      'SECONDARY_VERIFY',
      dto.otp,
    );
    if (!ok) {
      throw new BadRequestException(
        this.i18n()?.t('errors.otpInvalid') ?? 'Invalid code',
      );
    }

    const oldPrimary = user.email;
    await this.prisma.$transaction([
      this.prisma.userEmail.create({
        data: {
          userId,
          email: oldPrimary,
          isVerified: true,
          verifiedAt: new Date(),
        },
      }),
      this.prisma.userEmail.delete({ where: { id: target.id } }),
      this.prisma.user.update({
        where: { id: userId },
        data: { email, emailVerified: new Date() },
      }),
    ]);
    this.trackEmailEvent(userId, 'primary_email_changed', email);

    return { success: true, primary: email };
  }
}
