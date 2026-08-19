import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SavePushSubscriptionDto, SendPushDto } from './dto/push.dto';

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  badge?: string;
  icon?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {
    const publicKey = this.config.get<string>('vapid.publicKey');
    const privateKey = this.config.get<string>('vapid.privateKey');
    if (publicKey && privateKey) {
      webpush.setVapidDetails(
        'mailto:no-reply@fazlaka.app',
        publicKey,
        privateKey,
      );
      this.enabled = true;
    } else {
      this.logger.warn(
        'VAPID keys are missing — web push notifications are disabled.',
      );
    }
  }

  vapidPublicKey(): string | null {
    return this.enabled
      ? (this.config.get<string>('vapid.publicKey') ?? null)
      : null;
  }

  async save(userId: string, dto: SavePushSubscriptionDto) {
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: dto.endpoint },
    });
    if (existing) {
      const updated = await this.prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          p256dh: dto.p256dh,
          auth: dto.auth,
          userAgent: dto.userAgent ?? existing.userAgent,
          lastUsedAt: new Date(),
        },
      });
      return updated;
    }
    return this.prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.userAgent,
      },
    });
  }

  async remove(userId: string, endpoint: string) {
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint },
    });
    if (existing && existing.userId === userId) {
      await this.prisma.pushSubscription.delete({ where: { id: existing.id } });
    }
    return { success: true };
  }

  async list(userId: string, page = 1, limit = 20) {
    const [rows, total] = await Promise.all([
      this.prisma.pushSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pushSubscription.count({ where: { userId } }),
    ]);
    return { rows, total };
  }

  async sendToUser(userId: string, payload: PushPayload) {
    if (!this.enabled) return { sent: 0 };
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    return this.dispatch(subscriptions, this.localize(payload));
  }

  async sendToAll(payload: PushPayload) {
    if (!this.enabled) return { sent: 0 };
    const subscriptions = await this.prisma.pushSubscription.findMany({
      take: 10000,
    });
    return this.dispatch(subscriptions, payload);
  }

  private async dispatch(
    subscriptions: {
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }[],
    payload: PushPayload,
  ): Promise<{ sent: number }> {
    let sent = 0;
    const stale: string[] = [];
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
        );
        sent += 1;
        await this.prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          stale.push(subscription.id);
        } else {
          this.logger.warn(
            `Push failed for ${subscription.endpoint}: ${(error as Error).message}`,
          );
        }
      }
    }
    if (stale.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: stale } },
      });
    }
    return { sent };
  }

  async adminSend(adminId: string, dto: SendPushDto) {
    const payload: PushPayload = {
      title: dto.title,
      body: dto.body,
      url: dto.url,
    };
    const result = dto.userId
      ? await this.sendToUser(dto.userId, payload)
      : await this.sendToAll(payload);
    await this.audit.record(adminId, 'push.send', 'push', dto.userId ?? 'all', {
      title: dto.title,
    });
    return result;
  }

  private i18n() {
    return I18nContext.current();
  }

  private localize(payload: PushPayload): PushPayload {
    const i18n = this.i18n();
    if (!i18n) return payload;
    const resolve = (value?: string): string | undefined =>
      value && value.includes('.') ? i18n.t(value) : value;
    return {
      ...payload,
      title: resolve(payload.title) ?? payload.title,
      body: resolve(payload.body),
    };
  }
}
