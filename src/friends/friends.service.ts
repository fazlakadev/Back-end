import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendStatus } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import { RealtimeService } from '../realtime/realtime.service';
import { AuthEventsService } from '../auth-events/auth-events.service';
import { requestAuditStore } from '../common/middleware/request-audit.middleware';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly authEvents: AuthEventsService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  private track(userId: string, eventType: string, metadata?: Record<string, unknown>) {
    const auditCtx = requestAuditStore.getStore() ?? {};
    void this.authEvents.record({
      userId,
      eventType,
      method: 'friend',
      ctx: auditCtx,
      metadata,
    });
  }

  private resolve(key: string, args?: Record<string, unknown>): string {
    const i18n = this.i18n();
    if (!i18n) return key;
    try {
      return i18n.t(key, args ? { args } : undefined);
    } catch {
      return key;
    }
  }

  async sendRequest(senderId: string, receiverId: string) {
    if (senderId === receiverId) {
      throw new BadRequestException(
        this.i18n()?.t('errors.selfFriendRequest') ?? 'Cannot friend self',
      );
    }
    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
    });
    if (!receiver || receiver.status === 'banned') {
      throw new NotFoundException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }

    const existing = await this.prisma.friend.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'accepted') {
        throw new ConflictException(
          this.i18n()?.t('errors.alreadyFriends') ?? 'Already friends',
        );
      }
      if (existing.status === 'blocked') {
        throw new ConflictException(
          this.i18n()?.t('errors.cannotRemoveBlocked') ?? 'Blocked',
        );
      }
      throw new ConflictException(
        this.i18n()?.t('errors.requestAlreadySent') ?? 'Request exists',
      );
    }

    const request = await this.prisma.friend.create({
      data: { senderId, receiverId, status: 'pending' },
    });

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: this.userSelect(),
    });

    const notification = await this.prisma.notification.create({
      data: {
        userId: receiverId,
        type: 'friend_request',
        title: this.resolve('common.friendRequestTitle'),
        body: this.resolve('common.friendRequestBody', {
          name: sender?.name ?? sender?.username ?? 'unknown',
        }),
        data: { senderId, requestId: request.id },
      },
    });
    await this.realtime.triggerToUser(receiverId, 'notification:new', {
      notification,
    });

    await this.realtime.triggerToUser(receiverId, 'friend:request', {
      requestId: request.id,
      sender,
    });
    this.track(senderId, 'friend_request_sent', { receiverId });

    return request;
  }

  async respond(
    requestId: string,
    userId: string,
    action: 'accept' | 'reject',
  ) {
    const request = await this.prisma.friend.findUnique({
      where: { id: requestId },
    });
    if (!request || request.receiverId !== userId) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (request.status !== 'pending') {
      throw new ConflictException(
        this.i18n()?.t('errors.requestAlreadySent') ?? 'Already handled',
      );
    }

    const status: FriendStatus = action === 'accept' ? 'accepted' : 'rejected';
    const updated = await this.prisma.friend.update({
      where: { id: requestId },
      data: { status },
    });

    if (action === 'accept') {
      const friend = await this.prisma.user.findUnique({
        where: { id: request.receiverId },
        select: this.userSelect(),
      });
      const notification = await this.prisma.notification.create({
        data: {
          userId: request.senderId,
          type: 'friend_accepted',
          title: this.resolve('common.friendAcceptedTitle'),
          body: this.resolve('common.friendAcceptedBody', {
            name: friend?.name ?? friend?.username ?? 'unknown',
          }),
          data: { friendId: request.receiverId },
        },
      });
      await this.realtime.triggerToUser(request.senderId, 'notification:new', {
        notification,
      });

      await this.realtime.triggerToUser(request.senderId, 'friend:accepted', {
        friend,
      });
    }
    this.track(userId, action === 'accept' ? 'friend_request_accepted' : 'friend_request_rejected', {
      otherId: action === 'accept' ? request.senderId : request.senderId,
    });

    return updated;
  }

  async remove(userId: string, friendId: string) {
    const rel = await this.prisma.friend.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
    });
    if (rel) {
      await this.prisma.friend.delete({ where: { id: rel.id } });
    }
    this.track(userId, 'friend_removed', { friendId });
    return { success: true };
  }

  async block(userId: string, targetId: string) {
    if (userId === targetId) {
      throw new BadRequestException(
        this.i18n()?.t('errors.selfFriendRequest') ?? 'Cannot block self',
      );
    }
    const existing = await this.prisma.friend.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: targetId },
          { senderId: targetId, receiverId: userId },
        ],
      },
    });
    if (existing) {
      await this.prisma.friend.update({
        where: { id: existing.id },
        data: { status: 'blocked' },
      });
    } else {
      await this.prisma.friend.create({
        data: { senderId: userId, receiverId: targetId, status: 'blocked' },
      });
    }
    this.track(userId, 'user_blocked', { targetId });
    return { success: true };
  }

  async unblock(userId: string, targetId: string) {
    const existing = await this.prisma.friend.findFirst({
      where: {
        status: 'blocked',
        OR: [
          { senderId: userId, receiverId: targetId },
          { senderId: targetId, receiverId: userId },
        ],
      },
    });
    if (existing) {
      await this.prisma.friend.delete({ where: { id: existing.id } });
    }
    this.track(userId, 'user_unblocked', { targetId });
    return { success: true };
  }

  async listFriends(userId: string, page: number, limit: number) {
    const { skip } = resolvePagination({ page, limit });
    const where = {
      status: 'accepted' as const,
      OR: [{ senderId: userId }, { receiverId: userId }],
    };
    const [rows, total] = await Promise.all([
      this.prisma.friend.findMany({
        where,
        include: {
          sender: { select: this.userSelect() },
          receiver: { select: this.userSelect() },
        },
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.friend.count({ where }),
    ]);
    const data = rows.map((r: any) =>
      r.senderId === userId ? r.receiver : r.sender,
    );
    return { data, meta: buildMeta(total, page, limit) };
  }

  async incomingRequests(userId: string, page: number, limit: number) {
    const { skip } = resolvePagination({ page, limit });
    const where = { receiverId: userId, status: 'pending' as const };
    const [rows, total] = await Promise.all([
      this.prisma.friend.findMany({
        where,
        include: { sender: { select: this.userSelect() } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.friend.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async outgoingRequests(userId: string, page: number, limit: number) {
    const { skip } = resolvePagination({ page, limit });
    const where = { senderId: userId, status: 'pending' as const };
    const [rows, total] = await Promise.all([
      this.prisma.friend.findMany({
        where,
        include: { receiver: { select: this.userSelect() } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.friend.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async relationship(userId: string, otherId: string) {
    const rel = await this.prisma.friend.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: otherId },
          { senderId: otherId, receiverId: userId },
        ],
      },
    });
    if (!rel) return { status: 'none' };
    return {
      status: rel.status,
      id: rel.id,
      incoming: rel.senderId !== userId,
    };
  }

  async getFriendIds(userId: string): Promise<string[]> {
    const rels = await this.prisma.friend.findMany({
      where: {
        status: 'accepted',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
    });
    return rels.map((r: any) => (r.senderId === userId ? r.receiverId : r.senderId));
  }

  async suggestions(userId: string, limit = 10) {
    const friendIds = await this.getFriendIds(userId);
    const excluded = [userId, ...friendIds];
    const suggestions = await this.prisma.user.findMany({
      where: {
        id: { notIn: excluded },
        status: 'active',
      },
      select: this.userSelect(),
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
    });
    return suggestions;
  }

  async search(userId: string, q: string) {
    const query = (q || '').trim();
    if (!query || query.length < 2) return [];

    const friendIds = await this.getFriendIds(userId);
    const relations = await this.prisma.friend.findMany({
      where: {
        status: 'pending',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
    });

    const users = await this.prisma.user.findMany({
      where: {
        id: { notIn: [userId, ...friendIds] },
        status: 'active',
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: this.userSelect(),
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return users.map((u: any) => {
      const rel = relations.find(
        (r: any) => r.senderId === u.id || r.receiverId === u.id,
      );
      return {
        ...u,
        relation: rel
          ? { status: rel.status, incoming: rel.senderId !== userId }
          : { status: 'none' as const },
      };
    });
  }

  private userSelect() {
    return {
      id: true,
      publicId: true,
      name: true,
      username: true,
      avatarUrl: true,
      bio: true,
    };
  }
}
