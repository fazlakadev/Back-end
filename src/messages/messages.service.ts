import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConversationKind, MessageType, Prisma } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuthEventsService } from '../auth-events/auth-events.service';
import { requestAuditStore } from '../common/middleware/request-audit.middleware';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import { userSelect } from '../common/utils/selects';
import {
  CreateGroupDto,
  GroupMembersDto,
  SendMessageDto,
  UpdateGroupDto,
} from './dto/messages.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly authEvents: AuthEventsService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  private pair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  private track(
    userId: string,
    eventType: string,
    metadata?: Record<string, unknown>,
  ) {
    const auditCtx = requestAuditStore.getStore() ?? {};
    void this.authEvents.record({
      userId,
      eventType,
      method: 'messages',
      ctx: auditCtx,
      metadata,
    });
  }

  private async assertUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return user;
  }

  async getOrCreate(userId: string, otherUserId: string) {
    if (userId === otherUserId) {
      throw new BadRequestException(
        this.i18n()?.t('errors.cannotMessageSelf') ?? 'Cannot message yourself',
      );
    }
    await this.assertUserExists(otherUserId);
    const [a, b] = this.pair(userId, otherUserId);

    let conversation = await this.prisma.conversation.findFirst({
      where: { kind: 'direct', AND: [{ userAId: a }, { userBId: b }] },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { kind: 'direct', userAId: a, userBId: b },
      });
      this.track(userId, 'conversation_created', {
        conversationId: conversation.id,
        otherUserId,
      });
    }
    return this.detail(conversation.id, userId, 1, 50);
  }

  async list(userId: string, page: number, limit: number) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.ConversationWhereInput = {
      OR: [
        { kind: 'direct', userAId: userId },
        { kind: 'direct', userBId: userId },
        { kind: 'group', members: { some: { userId } } },
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          userA: { select: userSelect() },
          userB: { select: userSelect() },
          members: { select: { role: true, user: { select: userSelect() } } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (conversation: any) => {
        const isGroup = conversation.kind === 'group';
        const lastMessage = conversation.messages[0] ?? null;
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: userId },
            readAt: null,
          },
        });
        if (isGroup) {
          return {
            id: conversation.id,
            kind: 'group' as const,
            group: {
              id: conversation.id,
              name: conversation.name,
              avatarUrl: conversation.avatarUrl,
              bannerUrl: conversation.bannerUrl,
              memberCount: conversation.members.length,
            },
            lastMessage,
            unreadCount,
            updatedAt: conversation.updatedAt,
            createdAt: conversation.createdAt,
          };
        }
        return {
          id: conversation.id,
          kind: 'direct' as const,
          other: this.other(conversation, userId),
          lastMessage,
          unreadCount,
          updatedAt: conversation.updatedAt,
          createdAt: conversation.createdAt,
        };
      }),
    );

    return { data, meta: buildMeta(total, page, limit) };
  }

  private other(
    conversation: { userA: { id: string }; userB: { id: string } },
    userId: string,
  ) {
    return conversation.userA.id === userId
      ? conversation.userB
      : conversation.userA;
  }

  private async loadConversation(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        userA: { select: userSelect() },
        userB: { select: userSelect() },
        members: {
          include: { user: { select: userSelect() } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!conversation) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return conversation;
  }

  private assertParticipant(
    conversation: {
      id: string;
      kind: ConversationKind;
      userAId: string;
      userBId: string;
      members: { userId: string }[];
    },
    userId: string,
  ) {
    if (conversation.kind === 'group') {
      const isMember = conversation.members.some((m) => m.userId === userId);
      if (!isMember) {
        throw new ForbiddenException(
          this.i18n()?.t('errors.forbidden') ?? 'Forbidden',
        );
      }
      return;
    }
    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      throw new ForbiddenException(
        this.i18n()?.t('errors.forbidden') ?? 'Forbidden',
      );
    }
  }

  private assertGroupAdmin(
    conversation: {
      id: string;
      kind: ConversationKind;
      createdById: string | null;
      members: { userId: string; role: string }[];
    },
    userId: string,
  ) {
    if (conversation.kind !== 'group') {
      throw new BadRequestException(
        this.i18n()?.t('errors.notAGroup') ?? 'Not a group',
      );
    }
    if (conversation.createdById === userId) return;
    const member = conversation.members.find((m) => m.userId === userId);
    if (!member || member.role !== 'admin') {
      throw new ForbiddenException(
        this.i18n()?.t('errors.forbidden') ?? 'Forbidden',
      );
    }
  }

  async detail(
    conversationId: string,
    userId: string,
    page: number,
    limit: number,
  ) {
    const conversation = await this.loadConversation(conversationId);
    this.assertParticipant(conversation, userId);
    const { skip } = resolvePagination({ page, limit });
    const where = { conversationId };
    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { sender: { select: userSelect() } },
      }),
      this.prisma.message.count({ where }),
    ]);
    const isGroup = conversation.kind === 'group';
    return {
      conversation: {
        id: conversation.id,
        kind: conversation.kind,
        ...(isGroup
          ? {
              group: {
                id: conversation.id,
                name: conversation.name,
                avatarUrl: conversation.avatarUrl,
                bannerUrl: conversation.bannerUrl,
                createdById: conversation.createdById,
                members: conversation.members.map((m: any) => ({
                  id: m.user.id,
                  name: m.user.name,
                  username: m.user.username,
                  avatarUrl: m.user.avatarUrl,
                  role: m.role,
                  joinedAt: m.joinedAt,
                })),
              },
            }
          : { other: this.other(conversation, userId) }),
      },
      messages: messages.reverse(),
      meta: buildMeta(total, page, limit),
    };
  }

  async send(conversationId: string, userId: string, dto: SendMessageDto) {
    const conversation = await this.loadConversation(conversationId);
    this.assertParticipant(conversation, userId);

    const type: MessageType = dto.type ?? 'text';
    const body = dto.body ?? '';
    if (type === 'text' && !body.trim()) {
      throw new BadRequestException(
        this.i18n()?.t('errors.invalidMessage') ?? 'Message body required',
      );
    }
    if (type !== 'text' && !dto.attachmentUrl) {
      throw new BadRequestException(
        this.i18n()?.t('errors.attachmentRequired') ?? 'Attachment required',
      );
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        type,
        body,
        attachmentUrl: dto.attachmentUrl,
        attachmentMime: dto.attachmentMime,
        attachmentName: dto.attachmentName,
        attachmentSize: dto.attachmentSize,
        durationSec: dto.durationSec,
      },
      include: { sender: { select: userSelect() } },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    const payload = {
      conversationId,
      message,
      sender: message.sender,
      conversation: { id: conversation.id, kind: conversation.kind },
    };

    const recipientIds =
      conversation.kind === 'group'
        ? conversation.members
            .filter((m: any) => m.userId !== userId)
            .map((m: any) => m.userId)
        : [
            conversation.userAId === userId
              ? conversation.userBId
              : conversation.userAId,
          ];

    await Promise.all(
      recipientIds.map((id: any) =>
        this.realtime.triggerToUser(id, 'message:new', payload),
      ),
    );
    await this.realtime.triggerToUser(userId, 'message:sent', {
      conversationId,
      message,
    });

    const auditCtx = requestAuditStore.getStore() ?? {};
    void this.authEvents.record({
      userId,
      eventType: 'message_sent',
      method: type,
      ctx: auditCtx,
      metadata: {
        conversationId,
        type,
        hasAttachment: Boolean(dto.attachmentUrl),
        attachmentUrl: dto.attachmentUrl ?? undefined,
        durationSec: dto.durationSec ?? undefined,
      },
    });

    return message;
  }

  async markRead(conversationId: string, userId: string) {
    const conversation = await this.loadConversation(conversationId);
    this.assertParticipant(conversation, userId);
    const { count } = await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, marked: count };
  }

  /** Broadcasts a "typing" signal to the other participants (no DB row). */
  async typing(conversationId: string, userId: string) {
    const conversation = await this.loadConversation(conversationId);
    this.assertParticipant(conversation, userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true },
    });
    if (!user) return { success: false };

    const payload = {
      conversationId,
      userId: user.id,
      name: user.name || user.username,
      at: new Date().toISOString(),
    };

    if (conversation.kind === 'direct') {
      const otherId =
        conversation.userAId === userId ? conversation.userBId : conversation.userAId;
      await this.realtime.triggerToUser(otherId, 'typing', payload);
    } else {
      const others = conversation.members
        .map((m: any) => m.userId)
        .filter((id: any) => id !== userId);
      await Promise.all(
        others.map((id: any) => this.realtime.triggerToUser(id, 'typing', payload)),
      );
    }
    return { success: true };
  }

  // ------------------------------------------------------------
  // Groups
  // ------------------------------------------------------------

  async createGroup(userId: string, dto: CreateGroupDto) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException(
        this.i18n()?.t('errors.invalidGroupName') ?? 'Group name required',
      );
    }
    const memberIds = Array.from(new Set([...dto.memberIds]))
      .filter((id) => id !== userId)
      .slice(0, 200);

    const members = await this.prisma.user.findMany({
      where: { id: { in: memberIds }, status: { not: 'banned' } },
      select: { id: true },
    });

    const conversation = await this.prisma.conversation.create({
      data: {
        kind: 'group',
        userAId: userId,
        userBId: userId,
        name,
        avatarUrl: dto.avatarUrl ?? null,
        createdById: userId,
        members: {
          create: [
            { userId, role: 'admin' as const },
            ...members.map((m: any) => ({ userId: m.id, role: 'member' as const })),
          ],
        },
      },
    });
    this.track(userId, 'group_created', {
      conversationId: conversation.id,
      name,
      memberCount: members.length + 1,
    });

    return this.detail(conversation.id, userId, 1, 50);
  }

  async updateGroup(
    conversationId: string,
    userId: string,
    dto: UpdateGroupDto,
  ) {
    const conversation = await this.loadConversation(conversationId);
    this.assertGroupAdmin(conversation, userId);
    const data: Prisma.ConversationUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim() || null;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.bannerUrl !== undefined) data.bannerUrl = dto.bannerUrl;
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data,
    });
    return updated;
  }

  async addMembers(
    conversationId: string,
    userId: string,
    dto: GroupMembersDto,
  ) {
    const conversation = await this.loadConversation(conversationId);
    this.assertGroupAdmin(conversation, userId);

    const existing = new Set(conversation.members.map((m: any) => m.userId));
    const toAdd = Array.from(new Set(dto.userIds)).filter(
      (id) => !existing.has(id) && id !== userId,
    );
    if (toAdd.length === 0) return { added: 0, members: [] };

    const users = await this.prisma.user.findMany({
      where: { id: { in: toAdd }, status: { not: 'banned' } },
      select: { id: true },
    });
    const ids = users.map((u: any) => u.id);
    if (ids.length > 0) {
      await this.prisma.groupMember.createMany({
        data: ids.map((id: any) => ({
          conversationId,
          userId: id,
          role: 'member',
        })),
        skipDuplicates: true,
      });
    }

    const fresh = await this.loadConversation(conversationId);
    await Promise.all(
      ids.map((id: any) =>
        this.realtime.triggerToUser(id, 'group:invite', {
          conversationId,
          group: {
            id: conversation.id,
            name: conversation.name,
            avatarUrl: conversation.avatarUrl,
          },
        }),
      ),
    );
    this.track(userId, 'group_member_added', {
      conversationId,
      addedCount: ids.length,
    });

    return {
      added: ids.length,
      members: fresh.members.map((m: any) => ({
        id: m.user.id,
        name: m.user.name,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    };
  }

  async removeMember(
    conversationId: string,
    userId: string,
    targetUserId: string,
  ) {
    const conversation = await this.loadConversation(conversationId);
    this.assertParticipant(conversation, userId);
    if (conversation.kind !== 'group') {
      throw new BadRequestException(
        this.i18n()?.t('errors.notAGroup') ?? 'Not a group',
      );
    }

    const isSelf = userId === targetUserId;
    if (!isSelf) {
      this.assertGroupAdmin(conversation, userId);
    }

    const target = conversation.members.find((m: any) => m.userId === targetUserId);
    if (!target) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (
      !isSelf &&
      target.role === 'admin' &&
      conversation.createdById !== userId
    ) {
      throw new ForbiddenException(
        this.i18n()?.t('errors.forbidden') ?? 'Forbidden',
      );
    }

    await this.prisma.groupMember.delete({
      where: {
        conversationId_userId: { conversationId, userId: targetUserId },
      },
    });

    if (!isSelf) {
      await this.realtime.triggerToUser(targetUserId, 'group:removed', {
        conversationId,
      });
    }
    this.track(userId, isSelf ? 'group_left' : 'group_member_removed', {
      conversationId,
      targetUserId,
    });
    return { removed: true };
  }

  async listMembers(conversationId: string, userId: string) {
    const conversation = await this.loadConversation(conversationId);
    this.assertParticipant(conversation, userId);
    if (conversation.kind !== 'group') {
      throw new BadRequestException(
        this.i18n()?.t('errors.notAGroup') ?? 'Not a group',
      );
    }
    return conversation.members.map((m: any) => ({
      id: m.user.id,
      name: m.user.name,
      username: m.user.username,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }
}
