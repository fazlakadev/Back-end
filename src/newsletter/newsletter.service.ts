import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { NewsletterStatus, Prisma } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { resolvePagination, buildMeta } from '../common/utils/pagination';
import {
  SendNewsletterDto,
  SubscribeNewsletterDto,
  UnsubscribeNewsletterDto,
} from './dto/newsletter.dto';

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  private tokenFor(email: string): string {
    const secret = this.config.get<string>('jwt.secret') || 'dev-secret';
    return createHash('sha256')
      .update(`${email}:${secret}:newsletter`)
      .digest('hex')
      .slice(0, 32);
  }

  private unsubscribeUrl(email: string): string {
    const base =
      this.config.get<string>('websiteUrl') || 'http://localhost:3000';
    return `${base}/newsletter/unsubscribe?email=${encodeURIComponent(
      email,
    )}&token=${this.tokenFor(email)}`;
  }

  async subscribe(dto: SubscribeNewsletterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { email },
    });

    if (!existing) {
      await this.prisma.newsletterSubscriber.create({
        data: {
          email,
          name: dto.name,
          locale: dto.locale || 'ar',
          status: NewsletterStatus.pending,
        },
      });
    } else if (existing.status === 'pending') {
      await this.prisma.newsletterSubscriber.update({
        where: { email },
        data: { status: NewsletterStatus.pending },
      });
    }

    if (!existing || existing.status !== 'active') {
      const lang =
        dto.locale === 'en' || dto.locale === 'fr' ? dto.locale : 'ar';
      const subject =
        lang === 'en'
          ? 'Confirm your newsletter subscription — Fazlaka'
          : lang === 'fr'
            ? 'Confirmez votre abonnement — Fazlaka'
            : 'تأكيد اشتراكك في النشرة — فذلكة';
      await this.mail.sendNewsletterEmail(
        email,
        dto.name || '',
        subject,
        this.confirmBlock(lang),
        undefined,
        lang,
      );
    }

    return { message: 'newsletter.subscribed' };
  }

  private confirmBlock(lang: 'ar' | 'en' | 'fr'): string {
    const text =
      lang === 'en'
        ? 'Thanks for subscribing! You will receive our updates soon.'
        : lang === 'fr'
          ? 'Merci pour votre abonnement ! Vous recevrez nos actualités très bientôt.'
          : 'شكراً لاشتراكك! ستصلك آخر تحديثاتنا قريباً.';
    return `<p style="font-size:15px;line-height:1.7;color:#334155;margin:0 0 18px">${text}</p>`;
  }

  async confirm(token: string, email?: string) {
    if (!email) {
      throw new BadRequestException(
        this.i18n()?.t('newsletter.invalidToken') ?? 'Invalid token',
      );
    }
    const normalized = email.trim().toLowerCase();
    if (this.tokenFor(normalized) !== token) {
      throw new BadRequestException(
        this.i18n()?.t('newsletter.invalidToken') ?? 'Invalid token',
      );
    }
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: normalized },
    });
    if (!subscriber) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const updated = await this.prisma.newsletterSubscriber.update({
      where: { email: normalized },
      data: { status: NewsletterStatus.active, subscribedAt: new Date() },
    });
    return { success: true, status: updated.status };
  }

  async unsubscribe(dto: UnsubscribeNewsletterDto) {
    const email = dto.email.trim().toLowerCase();
    if (this.tokenFor(email) !== dto.token) {
      throw new BadRequestException(
        this.i18n()?.t('newsletter.invalidToken') ?? 'Invalid token',
      );
    }
    const updated = await this.prisma.newsletterSubscriber.update({
      where: { email },
      data: {
        status: NewsletterStatus.unsubscribed,
        unsubscribedAt: new Date(),
      },
    });
    return { success: true, status: updated.status };
  }

  async listSubscribers(
    page: number,
    limit: number,
    status?: NewsletterStatus,
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.NewsletterSubscriberWhereInput = status
      ? { status }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);
    return { rows, meta: buildMeta(total, page, limit) };
  }

  async updateSubscriber(
    adminId: string,
    id: string,
    status: NewsletterStatus,
  ) {
    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const updated = await this.prisma.newsletterSubscriber.update({
      where: { id },
      data: {
        status,
        ...(status === 'unsubscribed'
          ? { unsubscribedAt: new Date() }
          : status === 'active'
            ? { subscribedAt: existing.subscribedAt ?? new Date() }
            : {}),
      },
    });
    await this.audit.record(adminId, 'newsletter.update', 'subscriber', id, {
      status,
    });
    return updated;
  }

  async removeSubscriber(adminId: string, id: string) {
    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    await this.prisma.newsletterSubscriber.delete({ where: { id } });
    await this.audit.record(adminId, 'newsletter.delete', 'subscriber', id, {});
    return { success: true };
  }

  async send(adminId: string, dto: SendNewsletterDto) {
    const subscribers = await this.prisma.newsletterSubscriber.findMany({
      where: { status: NewsletterStatus.active },
      select: { email: true, name: true, locale: true },
    });
    const paragraphs = dto.body
      .split(/\n{2,}/)
      .map(
        (p) =>
          `<p style="font-size:15px;line-height:1.7;color:#334155;margin:0 0 18px">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
      )
      .join('\n');

    let sent = 0;
    for (const subscriber of subscribers) {
      const ok = await this.mail.sendNewsletterEmail(
        subscriber.email,
        subscriber.name || '',
        dto.subject,
        paragraphs,
        this.unsubscribeUrl(subscriber.email),
        dto.locale || subscriber.locale,
      );
      if (ok) sent += 1;
    }
    const recipientCount = subscribers.length;
    await this.audit.record(adminId, 'newsletter.send', 'newsletter', 'batch', {
      recipients: recipientCount,
      subject: dto.subject,
    });
    this.logger.log(
      `Newsletter "${dto.subject}" sent to ${sent}/${recipientCount} subscribers`,
    );
    return { sent, recipients: recipientCount };
  }

  generateInvite(): { email: string; token: string; confirmUrl: string } {
    const email = `invite+${randomBytes(6).toString('hex')}@fazlaka.app`;
    const token = this.tokenFor(email);
    const base =
      this.config.get<string>('websiteUrl') || 'http://localhost:3000';
    return {
      email,
      token,
      confirmUrl: `${base}/newsletter/confirm?email=${encodeURIComponent(email)}&token=${token}`,
    };
  }
}
