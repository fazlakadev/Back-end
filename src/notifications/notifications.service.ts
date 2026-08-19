import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { NotificationType, Prisma } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { FirebaseService } from '../push/firebase.service';
import { DevicesService } from '../push/devices.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    private readonly firebase: FirebaseService,
    private readonly devices: DevicesService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    if (!userId) {
      return null;
    }
    const i18n = this.i18n();
    const resolve = (key: string): string =>
      i18n && key.includes('.')
        ? i18n.t(key, data ? { args: data } : undefined)
        : key;
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title: resolve(title),
        body: resolve(body),
        data: (data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await this.realtime.triggerToUser(userId, 'notification:new', {
      notification,
    });

    // Send FCM push notification in the background (fire-and-forget)
    this.sendFcmPush(userId, type, resolve(title), resolve(body), data).catch(
      () => {},
    );

    return notification;
  }

  private async sendFcmPush(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    if (!this.firebase.isInitialized) return;

    const tokens = await this.devices.getTokensForUser(userId);
    if (tokens.length === 0) return;

    // Map notification type to channel
    const channelMap: Record<string, string> = {
      comment: 'social',
      like: 'social',
      friend_request: 'social',
      friend_accepted: 'social',
      system: 'general',
      support: 'general',
      announcement: 'content',
    };

    const channelId = channelMap[type] || 'general';
    const dataType = (data as Record<string, string>)?.type || type;

    const { sent, failed } = await this.firebase.sendToUser(tokens, {
      title,
      body,
      data: {
        notificationId: type,
        type: dataType,
        channelId,
        ...(data ? { extra: JSON.stringify(data) } : {}),
      } as Record<string, string>,
    });

    if (failed.length > 0) {
      await this.devices.removeStaleTokens(failed);
    }

    if (sent > 0) {
      this.logger.debug(`FCM push sent to ${sent} device(s) for user ${userId}`);
    }
  }

  async list(userId: string, page: number, limit: number) {
    const { skip } = resolvePagination({ page, limit });
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, id?: string) {
    if (id) {
      const existing = await this.prisma.notification.findFirst({
        where: { id, userId },
      });
      if (!existing) {
        throw new NotFoundException(
          this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
        );
      }
      await this.prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
      return { success: true, marked: [id] };
    }
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, marked: 'all' };
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    await this.prisma.notification.delete({ where: { id } });
    return { success: true, removed: id };
  }

  async broadcast(
    adminId: string,
    dto: {
      title: string;
      body: string;
      locale?: string;
      imageUrl?: string;
      deepLink?: string;
      sendPush?: boolean;
      platform?: string;
      data?: Record<string, unknown>;
    },
  ) {
    const where: Prisma.UserWhereInput = {
      ...(dto.locale
        ? { locale: dto.locale as Prisma.UserWhereInput['locale'] }
        : {}),
    };
    const users = await this.prisma.user.findMany({
      where,
      select: { id: true },
    });
    if (users.length > 0) {
      await this.prisma.notification.createMany({
        data: users.map((u: { id: string }) => ({
          userId: u.id,
          type: 'announcement',
          title: dto.title,
          body: dto.body,
          data: {
            ...(dto.data ?? {}),
            ...(dto.imageUrl ? { imageUrl: dto.imageUrl } : {}),
            ...(dto.deepLink ? { deepLink: dto.deepLink } : {}),
          } as Prisma.InputJsonValue,
        })),
      });
    }
    await this.realtime.broadcast('announcement:new', {
      title: dto.title,
      body: dto.body,
      imageUrl: dto.imageUrl,
      deepLink: dto.deepLink,
      createdAt: new Date(),
    });

    // Send FCM push notifications if requested
    let pushSent = 0;
    let pushFailed = 0;
    if (dto.sendPush && this.firebase.isInitialized) {
      const userIds = users.map((u: { id: string }) => u.id);
      // Get all device tokens for matched users
      const tokens = await this.prisma.deviceToken.findMany({
        where: {
          userId: { in: userIds },
          ...(dto.platform ? { platform: dto.platform } : {}),
        },
        select: { token: true, userId: true },
      });

      if (tokens.length > 0) {
        // Group tokens by user for per-user send (handles cleanup)
        const tokenList = tokens.map((t: { token: string }) => t.token);
        const result = await this.firebase.sendToUser(tokenList, {
          title: dto.title,
          body: dto.body,
          imageUrl: dto.imageUrl,
          clickAction: dto.deepLink || 'OPEN_MAIN',
          data: {
            type: 'announcement',
            channelId: 'content',
            notificationId: 'announcement',
            ...(dto.deepLink ? { deepLink: dto.deepLink } : {}),
            ...(dto.data ? { extra: JSON.stringify(dto.data) } : {}),
          },
        });
        pushSent = result.sent;
        pushFailed = result.failed.length;
        if (result.failed.length > 0) {
          await this.devices.removeStaleTokens(result.failed);
        }
      }
    }

    // Save broadcast log
    await this.prisma.broadcastLog.create({
      data: {
        adminId,
        title: dto.title,
        body: dto.body,
        imageUrl: dto.imageUrl,
        deepLink: dto.deepLink,
        locale: dto.locale,
        platform: dto.platform,
        sendPush: dto.sendPush ?? false,
        sentCount: users.length,
        pushSent,
        pushFailed,
      },
    });

    await this.audit.record(
      adminId,
      'announcement.broadcast',
      'notification',
      undefined,
      {
        sent: users.length,
        locale: dto.locale,
        title: dto.title,
        sendPush: dto.sendPush,
        pushSent,
      },
    );
    await this.webhooks.send('notification.broadcast', {
      title: dto.title,
      body: dto.body,
      locale: dto.locale,
      sent: users.length,
      sendPush: dto.sendPush,
      pushSent,
    });
    return { success: true, sent: users.length, pushSent, pushFailed };
  }

  async broadcastHistory(page: number, limit: number) {
    const { skip } = resolvePagination({ page, limit });
    const [rows, total] = await Promise.all([
      this.prisma.broadcastLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.broadcastLog.count(),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }
}
