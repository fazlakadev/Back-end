import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import { adminCan } from '../common/utils/helpers';
import { CallerContext, RequestContext } from '../common/types/request-context';
import {
  AddTicketMessageDto,
  AdminReplyDto,
  CreateTicketDto,
  UpdateTicketStatusDto,
} from './dto/support.dto';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PushService } from '../push/push.service';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  async createTicket(
    userId: string,
    dto: CreateTicketDto,
    ctx: RequestContext,
  ) {
    const ticket = await this.prisma.$transaction(async (tx: any) => {
      const t = await tx.supportTicket.create({
        data: {
          userId,
          subject: dto.subject,
          priority: dto.priority ?? 'medium',
          platform: ctx.platform as 'WEB' | 'MOBILE' | 'DESKTOP',
          deviceInfo: dto.deviceInfo,
        },
      });
      await (tx as any).supportMessage.create({
        data: {
          ticketId: t.id,
          senderId: userId,
          body: dto.message,
        },
      });
      return t;
    });
    const full = await this.prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      include: { messages: true },
    });
    await this.webhooks.send('support.ticket.created', {
      ticketId: ticket.id,
      subject: ticket.subject,
      priority: ticket.priority,
      userId,
    });
    await this.realtime.broadcast('support:new-ticket', {
      ticketId: ticket.id,
      subject: ticket.subject,
      priority: ticket.priority,
      platform: ticket.platform,
    });
    return full;
  }

  async myTickets(userId: string, page: number, limit: number) {
    const { skip } = resolvePagination({ page, limit });
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { messages: true } },
          calls: { where: { status: 'active' }, select: { id: true } },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    const data = rows.map(({ calls, ...ticket }: any) => ({
      ...ticket,
      activeCall: calls.length > 0,
    }));
    return { data, meta: buildMeta(total, page, limit) };
  }

  async getTicket(id: string, userId: string, caller: CallerContext) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        calls: { orderBy: { startedAt: 'desc' } },
      },
    });
    if (!ticket) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (ticket.userId !== userId && !adminCan(caller, 'support:manage')) {
      throw new ForbiddenException(
        this.i18n()?.t('errors.unauthorized') ?? 'Unauthorized',
      );
    }
    return ticket;
  }

  async addMessage(
    ticketId: string,
    userId: string,
    caller: CallerContext,
    dto: AddTicketMessageDto,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const isStaff = adminCan(caller, 'support:manage');
    if (ticket.userId !== userId && !isStaff) {
      throw new ForbiddenException(
        this.i18n()?.t('errors.unauthorized') ?? 'Unauthorized',
      );
    }
    if (ticket.status === 'closed') {
      throw new ForbiddenException(
        this.i18n()?.t('errors.unauthorized') ?? 'Ticket closed',
      );
    }

    const message = await this.prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: userId,
        body: dto.message,
        attachments: dto.attachments ?? [],
      },
    });

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'pending' },
    });

    if (isStaff) {
      const user = await this.prisma.user.findUnique({
        where: { id: ticket.userId },
      });
      if (user?.email) {
        await this.mail.sendSupportReply(user.email, ticket.id, dto.message);
      }
    }

    await this.realtime.broadcast('support:update', { ticketId });
    await this.realtime.triggerToUser(ticket.userId, 'support:update', {
      ticketId,
    });
    await this.webhooks.send('support.message.created', {
      ticketId,
      senderType: isStaff ? 'staff' : 'user',
      message: dto.message,
    });

    return message;
  }

  async updateStatus(
    ticketId: string,
    userId: string,
    caller: CallerContext,
    dto: UpdateTicketStatusDto,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const isOwner = ticket.userId === userId;
    const isStaff = adminCan(caller, 'support:manage');
    const closedOnly = dto.status === 'closed';

    if (!isStaff && !(isOwner && closedOnly)) {
      throw new ForbiddenException(
        this.i18n()?.t('errors.unauthorized') ?? 'Unauthorized',
      );
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: dto.status as never,
        priority: dto.priority,
        resolvedAt: dto.status === 'resolved' ? new Date() : null,
      },
    });
  }

  async adminList(page: number, limit: number, status?: string) {
    const { skip } = resolvePagination({ page, limit });
    const where = status ? { status: status as never } : {};
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, username: true, avatarUrl: true },
          },
          _count: { select: { messages: true } },
          calls: { where: { status: 'active' }, select: { id: true } },
        },
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    const data = rows.map(({ calls, ...ticket }: any) => ({
      ...ticket,
      activeCall: calls.length > 0,
    }));
    return { data, meta: buildMeta(total, page, limit) };
  }

  async adminGetTicket(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: { id: true, name: true, username: true, avatarUrl: true },
            },
            senderAdmin: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
        calls: { orderBy: { startedAt: 'desc' } },
      },
    });
    if (!ticket) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return ticket;
  }

  async adminReply(id: string, adminId: string, dto: AdminReplyDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
    });
    if (!ticket) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (ticket.status === 'closed') {
      throw new ForbiddenException(
        this.i18n()?.t('errors.unauthorized') ?? 'Ticket closed',
      );
    }

    const message = await this.prisma.supportMessage.create({
      data: {
        ticketId: id,
        senderAdminId: adminId,
        isAdminReply: true,
        body: dto.message,
        attachments: dto.attachments ?? [],
      },
    });

    await this.prisma.supportTicket.update({
      where: { id },
      data: { status: 'pending' },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: ticket.userId },
    });
    if (user?.email) {
      await this.mail.sendSupportReply(user.email, ticket.id, dto.message);
    }

    await this.notifications.notify(
      ticket.userId,
      'support',
      'common.supportReplyTitle',
      'common.supportReplyBody',
      { ticketId: id },
    );
    await this.push.sendToUser(ticket.userId, {
      title: 'common.supportReplyTitle',
      body: 'common.supportReplyBody',
      url: `ticket/${id}`,
    });
    await this.realtime.broadcast('support:update', { ticketId: id });
    await this.realtime.triggerToUser(ticket.userId, 'support:update', {
      ticketId: id,
    });
    await this.webhooks.send('support.message.created', {
      ticketId: id,
      senderType: 'staff',
      message: dto.message,
    });

    return message;
  }

  async adminUpdate(
    id: string,
    dto: { status?: string; priority?: 'low' | 'medium' | 'high' | 'urgent' },
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
    });
    if (!ticket) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: dto.status as never,
        priority: dto.priority,
        resolvedAt: dto.status === 'resolved' ? new Date() : null,
      },
    });
  }
}
