import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Admin,
  ContentType,
  Platform,
  Prisma,
  ReportStatus,
} from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import {
  CreateReportDto,
  CreateReportMessageDto,
  UpdateReportStatusDto,
} from './dto/report.dto';

const ESCALATION_HOURS = 72;

const REPORTABLE: Record<string, string> = {
  article: 'article',
  episode: 'episode',
  season: 'season',
  playlist: 'playlist',
  comment: 'comment',
  user: 'user',
};

const MESSAGE_INCLUDE = {
  senderAdmin: {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  },
  senderUser: {
    select: { id: true, name: true, username: true, avatarUrl: true },
  },
} satisfies Prisma.ReportMessageInclude;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  async submit(userId: string, dto: CreateReportDto, platform?: string) {
    await this.assertReportableExists(dto.contentType, dto.contentId);

    const report = await this.prisma.report.create({
      data: {
        reporterId: userId,
        contentType: dto.contentType,
        contentId: dto.contentId,
        reason: dto.reason,
        note: dto.note,
        platform: (platform as Platform) || undefined,
      },
    });
    await this.audit.record(null, 'report.submitted', 'report', report.id, {
      reporterId: userId,
      contentType: dto.contentType,
      contentId: dto.contentId,
      reason: dto.reason,
    });
    await this.webhooks.send('report.submitted', {
      reportId: report.id,
      reporterId: userId,
      contentType: dto.contentType,
      contentId: dto.contentId,
      reason: dto.reason,
    });
    return report;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async escalateStaleReports(): Promise<void> {
    const cutoff = new Date(Date.now() - ESCALATION_HOURS * 60 * 60 * 1000);
    try {
      const stale = await this.prisma.report.findMany({
        where: {
          status: { in: ['pending', 'reviewing'] },
          createdAt: { lt: cutoff },
        },
        select: {
          id: true,
          contentType: true,
          contentId: true,
          reason: true,
          createdAt: true,
        },
      });
      let escalated = 0;
      for (const report of stale) {
        const existing = await this.prisma.auditLog.findFirst({
          where: { action: 'report.escalated', entityId: report.id },
        });
        if (existing) {
          continue;
        }
        await this.audit.record(null, 'report.escalated', 'report', report.id, {
          contentType: report.contentType,
          contentId: report.contentId,
          reason: report.reason,
          ageHours: Math.round(
            (Date.now() - report.createdAt.getTime()) / 3_600_000,
          ),
        });
        escalated += 1;
      }
      if (escalated > 0) {
        this.logger.log(
          `Escalated ${escalated} report(s) older than ${ESCALATION_HOURS}h`,
        );
      }
    } catch (e) {
      this.logger.error('Report escalation failed', (e as Error).stack);
    }
  }

  async queue(
    page: number,
    limit: number,
    status?: ReportStatus,
    filters: { platform?: string; escalated?: boolean } = {},
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.ReportWhereInput = {
      ...(status ? { status } : {}),
      ...(filters.platform ? { platform: filters.platform as Platform } : {}),
      ...(filters.escalated === true
        ? {
            status: { in: ['pending', 'reviewing'] },
            createdAt: {
              lt: new Date(Date.now() - ESCALATION_HOURS * 60 * 60 * 1000),
            },
          }
        : {}),
      ...(filters.escalated === false
        ? {
            NOT: {
              status: { in: ['pending', 'reviewing'] },
              createdAt: {
                lt: new Date(Date.now() - ESCALATION_HOURS * 60 * 60 * 1000),
              },
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: {
            select: { id: true, name: true, username: true, avatarUrl: true },
          },
          handledBy: {
            select: { id: true, username: true, displayName: true },
          },
        },
      }),
      this.prisma.report.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
            email: true,
          },
        },
        handledBy: {
          select: { id: true, username: true, displayName: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: MESSAGE_INCLUDE,
        },
      },
    });
    if (!report) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return report;
  }

  async mine(userId: string, page: number, limit: number) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.ReportWhereInput = { reporterId: userId };
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          handledBy: {
            select: { id: true, username: true, displayName: true },
          },
          _count: { select: { messages: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: MESSAGE_INCLUDE,
          },
        },
      }),
      this.prisma.report.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async mineOne(userId: string, id: string) {
    const report = await this.prisma.report.findFirst({
      where: { id, reporterId: userId },
      include: {
        handledBy: {
          select: { id: true, username: true, displayName: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: MESSAGE_INCLUDE,
        },
      },
    });
    if (!report) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return report;
  }

  async userMessage(userId: string, id: string, dto: CreateReportMessageDto) {
    const report = await this.prisma.report.findFirst({
      where: { id, reporterId: userId },
    });
    if (!report) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const message = await this.prisma.reportMessage.create({
      data: {
        reportId: id,
        senderType: 'user',
        senderUserId: userId,
        body: dto.body,
      },
      include: MESSAGE_INCLUDE,
    });
    if (report.status !== 'pending') {
      await this.prisma.report.update({
        where: { id },
        data: { status: 'pending', resolvedAt: null },
      });
    }
    return message;
  }

  async adminMessage(admin: Admin, id: string, dto: CreateReportMessageDto) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const message = await this.prisma.reportMessage.create({
      data: {
        reportId: id,
        senderType: 'admin',
        senderAdminId: admin.id,
        body: dto.body,
      },
      include: MESSAGE_INCLUDE,
    });
    await this.prisma.report.update({
      where: { id },
      data: { handledByAdminId: admin.id },
    });
    await this.audit.record(admin.id, 'report.message', 'report', id, {
      reporterId: report.reporterId,
      contentType: report.contentType,
    });
    await this.notifications.notify(
      report.reporterId,
      'system',
      'New message on your report',
      dto.body,
      { reportId: id, contentType: report.contentType },
    );
    return message;
  }

  async counts() {
    const rows = await this.prisma.report.groupBy({
      by: ['status'],
      _count: true,
    });
    return rows.reduce<Record<string, number>>((acc: Record<string, number>, r: any) => {
      acc[r.status] = r._count;
      return acc;
    }, {});
  }

  async updateStatus(adminId: string, id: string, dto: UpdateReportStatusDto) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: dto.status,
        handledByAdminId: adminId,
        resolvedAt:
          dto.status === 'resolved' || dto.status === 'dismissed'
            ? new Date()
            : report.resolvedAt,
      },
    });

    await this.audit.record(adminId, 'report.update_status', 'report', id, {
      status: dto.status,
      reporterId: report.reporterId,
      contentType: report.contentType,
    });

    if (dto.status === 'resolved' || dto.status === 'dismissed') {
      await this.notifications.notify(
        report.reporterId,
        'system',
        'Report status updated',
        `Your report was ${dto.status}.`,
        { reportId: id, contentType: report.contentType },
      );
    }
    return updated;
  }
  private async assertReportableExists(
    contentType: ContentType,
    contentId: string,
  ) {
    const model = REPORTABLE[contentType];
    if (!model) {
      throw new NotFoundException(
        this.i18n()?.t('errors.unsupportedContentType') ?? 'Unsupported',
      );
    }
    const count = await (this.prisma as any)[model].count({
      where: { id: contentId },
    });
    if (count === 0) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
  }
}
