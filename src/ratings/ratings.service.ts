import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ContentType,
  Platform,
  Prisma,
  RatingStatus,
} from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ModerateRatingDto,
  UpdateRatingDto,
  UpsertRatingDto,
} from './dto/rating.dto';

const RATEABLE: Record<string, string> = {
  article: 'article',
  episode: 'episode',
  season: 'season',
  playlist: 'playlist',
};

@Injectable()
export class RatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  private async assertContentExists(
    contentType: ContentType,
    contentId: string,
  ) {
    const model = RATEABLE[contentType];
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

  async upsert(userId: string, dto: UpsertRatingDto, platform?: string) {
    await this.assertContentExists(dto.contentType, dto.contentId);
    return this.prisma.rating.upsert({
      where: {
        userId_contentType_contentId: {
          userId,
          contentType: dto.contentType,
          contentId: dto.contentId,
        },
      },
      create: {
        userId,
        contentType: dto.contentType,
        contentId: dto.contentId,
        value: dto.value,
        comment: dto.comment,
        platform: (platform as Platform) || undefined,
      },
      update: {
        value: dto.value,
        comment: dto.comment,
      },
    });
  }

  async summary(contentType: ContentType, contentId: string) {
    const where = {
      contentType,
      contentId,
      status: 'approved' as RatingStatus,
    };
    const [agg, byValue] = await Promise.all([
      this.prisma.rating.aggregate({
        where,
        _avg: { value: true },
        _count: true,
      }),
      this.prisma.rating.groupBy({
        by: ['value'],
        where,
        _count: true,
      }),
    ]);
    const distribution = [5, 4, 3, 2, 1].map((value) => {
      const row = byValue.find((b: any) => b.value === value);
      return { value, count: row?._count ?? 0 };
    });
    return {
      average: agg._avg.value ? Number(agg._avg.value.toFixed(2)) : null,
      count: agg._count,
      distribution,
    };
  }

  async summaries(contentType: ContentType, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    const out: Record<string, { average: number | null; count: number }> = {};
    for (const id of unique) {
      out[id] = { average: null, count: 0 };
    }
    if (unique.length === 0) {
      return out;
    }
    const rows = await this.prisma.rating.groupBy({
      by: ['contentId', 'value'],
      where: {
        contentType,
        contentId: { in: unique },
        status: 'approved',
      },
      _count: true,
    });
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const row of rows) {
      sums[row.contentId] = (sums[row.contentId] ?? 0) + row.value * row._count;
      counts[row.contentId] = (counts[row.contentId] ?? 0) + row._count;
    }
    for (const id of unique) {
      const c = counts[id] ?? 0;
      out[id] = {
        average: c ? Number((sums[id] / c).toFixed(2)) : null,
        count: c,
      };
    }
    return out;
  }

  async listForContent(
    contentType: ContentType,
    contentId: string,
    page: number,
    limit: number,
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where = {
      contentType,
      contentId,
      status: 'approved' as RatingStatus,
    };
    const [rows, total] = await Promise.all([
      this.prisma.rating.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, username: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.rating.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async mine(userId: string, page: number, limit: number) {
    const { skip } = resolvePagination({ page, limit });
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.rating.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.rating.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async update(userId: string, id: string, dto: UpdateRatingDto) {
    const rating = await this.prisma.rating.findFirst({
      where: { id, userId },
    });
    if (!rating) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return this.prisma.rating.update({
      where: { id },
      data: { value: dto.value, comment: dto.comment },
    });
  }

  async remove(userId: string, id: string) {
    const rating = await this.prisma.rating.findFirst({
      where: { id, userId },
    });
    if (!rating) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    await this.prisma.rating.delete({ where: { id } });
    return { success: true, removed: id };
  }

  async queue(
    page: number,
    limit: number,
    status?: RatingStatus,
    filters: { contentType?: string; userId?: string; platform?: string } = {},
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.RatingWhereInput = {
      status: status ?? 'pending',
      ...(filters.contentType
        ? { contentType: filters.contentType as ContentType }
        : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.platform ? { platform: filters.platform as Platform } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rating.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              avatarUrl: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.rating.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async adminFindOne(id: string) {
    const rating = await this.prisma.rating.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
            email: true,
          },
        },
        moderatedBy: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });
    if (!rating) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return rating;
  }

  async moderate(adminId: string, id: string, dto: ModerateRatingDto) {
    const rating = await this.prisma.rating.findUnique({ where: { id } });
    if (!rating) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const updated = await this.prisma.rating.update({
      where: { id },
      data: {
        status: dto.status,
        moderationNote: dto.moderationNote,
        moderatedById: adminId,
      },
    });
    await this.audit.record(adminId, 'rating.moderate', 'rating', id, {
      status: dto.status,
      moderationNote: dto.moderationNote,
      userId: rating.userId,
    });
    if (dto.status !== 'pending' && rating.userId) {
      await this.notifications.notify(
        rating.userId,
        'system',
        'Rating reviewed',
        `Your rating was ${dto.status}${
          dto.moderationNote ? ` — ${dto.moderationNote}` : ''
        }.`,
        { ratingId: id, contentType: rating.contentType },
      );
    }
    return updated;
  }
}
