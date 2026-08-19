import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentType, Locale, Prisma, View } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import { RequestContext } from '../common/types/request-context';
import { TrackViewDto } from './dto/view.dto';

const TRACKABLE: Record<string, string> = {
  article: 'article',
  episode: 'episode',
  season: 'season',
  playlist: 'playlist',
};

@Injectable()
export class ViewsService {
  constructor(private readonly prisma: PrismaService) {}

  private i18n() {
    return I18nContext.current();
  }

  async track(
    userId: string | undefined,
    dto: TrackViewDto,
    ctx: RequestContext,
  ) {
    const platform = ctx.platform as 'WEB' | 'MOBILE' | 'DESKTOP' | undefined;
    const deviceType = this.normalizeDevice(
      ctx.deviceType || ctx.deviceName || ctx.os,
    );

    const view = await this.prisma.view.create({
      data: {
        userId: userId || null,
        contentType: dto.contentType,
        contentId: dto.contentId,
        platform: platform || 'WEB',
        deviceType,
        deviceName: ctx.deviceName,
        os: ctx.os,
        browser: ctx.browser,
        appVersion: ctx.appVersion,
        userAgent: ctx.userAgent,
        ipHash: ctx.ipHash,
        country: ctx.country,
        countryCode: ctx.countryCode,
        city: ctx.city,
        referrer: ctx.referrer,
        locale: this.toLocale(ctx.locale),
        durationSec: dto.durationSec,
        completed: dto.completed ?? false,
      },
    });

    // Only increment the content counter for a "fresh" view
    // (not a duplicate event within the last minute from same user/ip).
    const isFresh = await this.isFreshView(dto, userId, ctx.ipHash);
    if (isFresh) {
      await this.incrementCount(dto.contentType, dto.contentId);
    }

    return view;
  }

  private async isFreshView(
    dto: TrackViewDto,
    userId?: string,
    ipHash?: string,
  ): Promise<boolean> {
    const since = new Date(Date.now() - 60_000);
    const recent = await this.prisma.view.findFirst({
      where: {
        contentType: dto.contentType,
        contentId: dto.contentId,
        createdAt: { gte: since },
        ...(userId ? { userId } : {}),
        ...(!userId && ipHash ? { ipHash } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return !recent;
  }

  async getStats(contentType: ContentType, contentId: string) {
    const where = { contentType, contentId };
    const uniqueViewersWhere: Prisma.ViewWhereInput = {
      contentType,
      contentId,
      userId: { not: null },
    };
    const [total, platforms, byDevice, byCountry, recent, uniqueUsers] =
      await Promise.all([
        this.prisma.view.count({ where }),
        this.prisma.view.groupBy({
          by: ['platform'],
          where,
          _count: { _all: true },
        }),
        this.prisma.view.groupBy({
          by: ['deviceType'],
          where,
          _count: { _all: true },
        }),
        this.prisma.view.groupBy({
          by: ['countryCode'],
          where,
          _count: { _all: true },
          orderBy: { _count: { countryCode: 'desc' } },
          take: 10,
        }),
        this.prisma.view.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            platform: true,
            deviceType: true,
            os: true,
            browser: true,
            appVersion: true,
            countryCode: true,
            city: true,
            referrer: true,
            durationSec: true,
            completed: true,
            createdAt: true,
          },
        }),
        this.prisma.view.findMany({
          where: uniqueViewersWhere,
          distinct: ['userId'],
          select: { userId: true },
        }),
      ]);

    return {
      total,
      uniqueViewers: uniqueUsers.length,
      platforms,
      byDevice,
      byCountry,
      recent,
    };
  }

  async getContentStats(contentType: ContentType, contentId: string) {
    const model = TRACKABLE[contentType];
    if (!model) {
      throw new NotFoundException(
        this.i18n()?.t('errors.unsupportedContentType') ?? 'Unsupported',
      );
    }
    const content = await (this.prisma as any)[model].findUnique({
      where: { id: contentId },
      select: {
        id: true,
        viewsCount: true,
        likesCount: true,
        commentsCount: true,
      },
    });
    if (!content) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return { ...content, ...(await this.getStats(contentType, contentId)) };
  }

  /**
   * YouTube-style watch history: one entry per content, the latest watch
   * moves it to the top. Deleted content is evicted from the history.
   */
  async getHistory(
    userId: string,
    page: number,
    limit: number,
    locale: Locale,
  ) {
    // Get distinct contentIds with their latest view (most recent first) using raw query
    const rawRows = await this.prisma.$queryRaw<
      Array<{ contentId: string; id: string }>
    >`
      SELECT DISTINCT ON ("contentId") "contentId", "id"
      FROM "View"
      WHERE "userId" = ${userId}
      ORDER BY "contentId", "createdAt" DESC
    `;

    const total = rawRows.length;

    // Paginate the distinct content IDs
    const start = (page - 1) * limit;
    const pageContentIds = rawRows.slice(start, start + limit);

    if (pageContentIds.length === 0) {
      return { data: [], meta: buildMeta(total, page, limit) };
    }

    // Fetch the full view rows for the paginated content IDs
    const pageItems = await this.prisma.view.findMany({
      where: {
        id: { in: pageContentIds.map((r: { id: string }) => r.id) },
      },
    });

    const kept = await this.filterExisting(pageItems);
    const keptIds = new Set(kept.map((k) => k.contentId));
    const orphanIds = pageItems
      .filter((i: { contentId: string }) => !keptIds.has(i.contentId))
      .map((i: { id: string }) => i.id);
    if (orphanIds.length > 0) {
      await this.prisma.view.deleteMany({ where: { id: { in: orphanIds } } });
    }

    const data = await this.attachContentMeta(kept, locale);
    return { data, meta: buildMeta(total, page, limit) };
  }

  async clearHistory(userId: string) {
    const { count } = await this.prisma.view.deleteMany({ where: { userId } });
    return { success: true, removed: count };
  }

  async adminList(query: {
    page?: number;
    limit?: number;
    platform?: string;
    contentType?: string;
    q?: string;
    from?: string;
    to?: string;
  }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const where: Prisma.ViewWhereInput = {
      ...(query.platform
        ? { platform: query.platform as Prisma.EnumPlatformFilter }
        : {}),
      ...(query.contentType
        ? { contentType: query.contentType as Prisma.EnumContentTypeFilter }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    if (query.q) {
      where.user = {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
          { username: { contains: query.q, mode: 'insensitive' } },
        ],
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.view.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.view.count({ where }),
    ]);

    const summaries = await this.attachContentMeta(rows, 'en');

    return {
      data: summaries.map((item) => {
        const row = rows.find((r: any) => r.contentId === item.contentId);
        return {
          ...item,
          id: row!.id,
          userId: row!.userId,
          user: row!.user,
          platform: row!.platform,
          deviceType: row!.deviceType,
          os: row!.os,
          browser: row!.browser,
          countryCode: row!.countryCode,
          city: row!.city,
          referrer: row!.referrer,
          durationSec: row!.durationSec,
          completed: row!.completed,
          watchedAt: row!.createdAt,
        };
      }),
      meta: buildMeta(total, page, limit),
    };
  }

  private async filterExisting(items: View[]): Promise<View[]> {
    const grouped: Record<string, string[]> = {};
    for (const item of items) {
      const model = TRACKABLE[item.contentType];
      if (!model) {
        grouped[item.contentType] ??= [];
        grouped[item.contentType].push(item.contentId);
        continue;
      }
      (grouped[model] ??= []).push(item.contentId);
    }

    const existingIds = new Set<string>();
    for (const [model, ids] of Object.entries(grouped)) {
      try {
        const found = (await (this.prisma as any)[model].findMany({
          where: { id: { in: ids } },
          select: { id: true },
        })) as Array<{ id: string }>;
        for (const f of found) existingIds.add(f.id);
      } catch {
        // unknown/non-trackable type — keep the entries
      }
    }
    return items.filter((i) => existingIds.has(i.contentId));
  }

  private async attachContentMeta(items: View[], locale: Locale) {
    const grouped: Record<string, string[]> = {};
    for (const item of items) {
      const model = TRACKABLE[item.contentType];
      if (!model) continue;
      (grouped[model] ??= []).push(item.contentId);
    }

    const metaById = new Map<
      string,
      {
        title?: string | null;
        coverImage?: string | null;
        slug?: string | null;
        episode?: unknown;
      }
    >();
    for (const [model, ids] of Object.entries(grouped)) {
      try {
        if (model === 'episode') {
          const recs = await this.prisma.episode.findMany({
            where: { id: { in: ids } },
            include: {
              translations: { where: { locale } },
              season: { include: { translations: { where: { locale } } } },
              author: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  avatarUrl: true,
                },
              },
            },
          });
          for (const r of recs) {
            metaById.set(r.id, {
              title: r.translations[0]?.title,
              coverImage: r.coverImage,
              slug: r.slug,
              episode: r,
            });
          }
        } else {
          const recs = (await (this.prisma as any)[model].findMany({
            where: { id: { in: ids } },
            select: {
              id: true,
              slug: true,
              coverImage: true,
              translations: {
                where: { locale },
                select: { title: true },
                take: 1,
              },
            },
          })) as Array<{
            id: string;
            slug?: string | null;
            coverImage?: string | null;
            translations?: Array<{ title?: string | null }>;
          }>;
          for (const r of recs) {
            metaById.set(r.id, {
              title: r.translations?.[0]?.title,
              coverImage: r.coverImage,
              slug: r.slug,
            });
          }
        }
      } catch {
        // ignore
      }
    }

    return items.map((item) => {
      const meta = metaById.get(item.contentId);
      return {
        id: item.id,
        contentType: item.contentType,
        contentId: item.contentId,
        title: meta?.title,
        coverImage: meta?.coverImage,
        slug: meta?.slug,
        episode: meta?.episode,
        platform: item.platform,
        locale: item.locale,
        durationSec: item.durationSec,
        completed: item.completed,
        watchedAt: item.createdAt,
      };
    });
  }

  private async incrementCount(contentType: ContentType, contentId: string) {
    const model = TRACKABLE[contentType];
    if (!model) return;
    try {
      await (this.prisma as any)[model].update({
        where: { id: contentId },
        data: { viewsCount: { increment: 1 } },
      });
    } catch {
      // ignore
    }
  }

  private normalizeDevice(value?: string) {
    const v = (value || '').toLowerCase();
    if (!v) return 'unknown';
    if (v.includes('iphone') || v.includes('android') || v.includes('mobile'))
      return 'mobile';
    if (v.includes('ipad') || v.includes('tablet')) return 'tablet';
    if (v.includes('tv')) return 'tv';
    return 'desktop';
  }

  private toLocale(locale?: string) {
    if (locale === 'ar') return 'ar' as const;
    if (locale === 'fr') return 'fr' as const;
    return 'en' as const;
  }
}
