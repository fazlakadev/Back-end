import { Injectable } from '@nestjs/common';
import { ContentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface RangeQuery {
  from?: Date;
  to?: Date;
  platform?: string;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private dateRange(input?: { from?: string; to?: string }) {
    const now = new Date();
    const from = input?.from
      ? new Date(input.from)
      : new Date(now.getTime() - 30 * 86400_000);
    const to = input?.to ? new Date(input.to) : now;
    return { from, to };
  }

  private viewWhere(q: RangeQuery): Prisma.ViewWhereInput {
    return {
      createdAt: { gte: q.from, lte: q.to },
      ...(q.platform
        ? { platform: q.platform.toUpperCase() as 'WEB' | 'MOBILE' | 'DESKTOP' }
        : {}),
    };
  }

  async dashboard(query?: { platform?: string }) {
    const platform = query?.platform
      ? (query.platform.toUpperCase() as 'WEB' | 'MOBILE' | 'DESKTOP')
      : undefined;
    const platformWhere = platform ? { platform } : {};
    const contentWhere = platform ? { platform } : {};

    const [
      users,
      activeUsers,
      articles,
      episodes,
      seasons,
      playlists,
      views,
      likes,
      comments,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { lastActiveAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      }),
      this.prisma.article.count({ where: contentWhere }),
      this.prisma.episode.count({ where: contentWhere }),
      this.prisma.season.count({ where: contentWhere }),
      this.prisma.playlist.count({ where: contentWhere }),
      this.prisma.view.count({ where: platformWhere }),
      this.prisma.like.count(),
      this.prisma.comment.count(),
    ]);

    const [viewsToday, views7d, views30d] = await Promise.all([
      this.prisma.view.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 86400_000) },
          ...platformWhere,
        },
      }),
      this.prisma.view.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
          ...platformWhere,
        },
      }),
      this.prisma.view.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 30 * 86400_000) },
          ...platformWhere,
        },
      }),
    ]);

    const [
      pendingRatings,
      hiddenComments,
      usersByStatus,
      reportsByStatus,
      escalatedReports,
      contentByStatus,
    ] = await Promise.all([
      this.prisma.rating.count({ where: { status: 'pending' } }),
      this.prisma.comment.count({ where: { status: 'hidden' } }),
      this.prisma.user.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.report.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.report.count({
        where: {
          status: { in: ['pending', 'reviewing'] },
          createdAt: {
            lt: new Date(Date.now() - 72 * 60 * 60 * 1000),
          },
        },
      }),
      Promise.all([
        this.contentStatusCounts('article', platform),
        this.contentStatusCounts('episode', platform),
        this.contentStatusCounts('season', platform),
        this.prisma.playlist.count({
          where: { isPublic: true, ...contentWhere },
        }),
        this.prisma.playlist.count({
          where: { isPublic: false, ...contentWhere },
        }),
      ]),
    ]);

    return {
      users,
      activeUsers,
      usersByStatus: usersByStatus.reduce<Record<string, number>>((acc: Record<string, number>, r: any) => {
        acc[r.status] = r._count;
        return acc;
      }, {}),
      content: { articles, episodes, seasons, playlists },
      contentByStatus: {
        article: contentByStatus[0],
        episode: contentByStatus[1],
        season: contentByStatus[2],
        playlist: {
          published: contentByStatus[3],
          unpublished: contentByStatus[4],
        },
      },
      social: { views, likes, comments },
      moderation: {
        pendingRatings,
        hiddenComments,
        escalatedReports,
        reports: reportsByStatus.reduce<Record<string, number>>((acc: Record<string, number>, r: any) => {
          acc[r.status] = r._count;
          return acc;
        }, {}),
      },
      trends: { viewsToday, views7d, views30d },
    };
  }

  private async contentStatusCounts(
    model: 'article' | 'episode' | 'season',
    platform?: 'WEB' | 'MOBILE' | 'DESKTOP',
  ) {
    const where = platform ? { platform } : {};
    const [published, draft] = await Promise.all([
      (this.prisma[model] as any).count({
        where: { published: true, ...where },
      }),
      (this.prisma[model] as any).count({
        where: { published: false, ...where },
      }),
    ]);
    return { published, draft };
  }

  async viewsOverTime(query: {
    from?: string;
    to?: string;
    platform?: string;
  }) {
    const { from, to } = this.dateRange(query);
    const rows = await this.prisma.view.findMany({
      where: this.viewWhere({ from, to, platform: query.platform }),
      select: { createdAt: true, platform: true },
    });

    const byDay: Record<string, number> = {};
    const byPlatform: Record<string, Record<string, number>> = {};

    for (const row of rows) {
      const day = row.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
      const p = row.platform;
      byPlatform[p] = byPlatform[p] || {};
      byPlatform[p][day] = (byPlatform[p][day] || 0) + 1;
    }

    return {
      total: rows.length,
      byDay,
      byPlatform,
    };
  }

  async platformBreakdown(query: { from?: string; to?: string }) {
    const { from, to } = this.dateRange(query);
    const groups = await this.prisma.view.groupBy({
      by: ['platform'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { durationSec: true },
    });
    const total = groups.reduce((acc: number, g: any) => acc + g._count._all, 0);
    return {
      total,
      breakdown: groups.map((g: any) => ({
        platform: g.platform,
        views: g._count._all,
        share: total ? Math.round((g._count._all / total) * 1000) / 10 : 0,
        totalSeconds: g._sum.durationSec ?? 0,
      })),
    };
  }

  async topContent(query: {
    from?: string;
    to?: string;
    contentType?: ContentType;
    limit?: number;
    platform?: string;
  }) {
    const { from, to } = this.dateRange(query);
    const limit = Math.min(query.limit || 10, 50);
    const where: Prisma.ViewWhereInput = this.viewWhere({
      from,
      to,
      platform: query.platform,
    });
    if (query.contentType) {
      where.contentType = query.contentType;
    }
    const groups = await this.prisma.view.groupBy({
      by: ['contentType', 'contentId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { contentId: 'desc' } },
      take: limit,
    });
    return groups;
  }

  async geoBreakdown(query: { from?: string; to?: string; platform?: string }) {
    const { from, to } = this.dateRange(query);
    return this.prisma.view.groupBy({
      by: ['countryCode', 'country'],
      where: {
        createdAt: { gte: from, lte: to },
        countryCode: { not: null },
        ...(query.platform
          ? {
              platform: query.platform.toUpperCase() as
                'WEB' | 'MOBILE' | 'DESKTOP',
            }
          : {}),
      },
      _count: { _all: true },
      orderBy: { _count: { countryCode: 'desc' } },
      take: 20,
    });
  }

  async deviceBreakdown(query: {
    from?: string;
    to?: string;
    platform?: string;
  }) {
    const { from, to } = this.dateRange(query);
    return this.prisma.view.groupBy({
      by: ['deviceType', 'os'],
      where: {
        createdAt: { gte: from, lte: to },
        ...(query.platform
          ? {
              platform: query.platform.toUpperCase() as
                'WEB' | 'MOBILE' | 'DESKTOP',
            }
          : {}),
      },
      _count: { _all: true },
    });
  }

  async userGrowth(query: { from?: string; to?: string }) {
    const { from, to } = this.dateRange(query);
    const users = await this.prisma.user.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    });
    const byDay: Record<string, number> = {};
    for (const u of users) {
      const day = u.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    }
    return { total: users.length, byDay };
  }

  async contentEngagement(query: { from?: string; to?: string }) {
    const { from, to } = this.dateRange(query);
    const [likes, comments, shares] = await Promise.all([
      this.prisma.like.count({ where: { createdAt: { gte: from, lte: to } } }),
      this.prisma.comment.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.friend.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
    ]);
    return { likes, comments, newFriendRelationships: shares };
  }

  async allAnalytics(query: {
    from?: string;
    to?: string;
    platform?: string;
    limit?: number;
  }) {
    const [
      dashboard,
      views,
      platforms,
      topContent,
      geo,
      devices,
      users,
      engagement,
    ] = await Promise.all([
      this.dashboard({ platform: query.platform }),
      this.viewsOverTime(query),
      this.platformBreakdown(query),
      this.topContent(query),
      this.geoBreakdown(query),
      this.deviceBreakdown(query),
      this.userGrowth(query),
      this.contentEngagement(query),
    ]);
    return {
      dashboard,
      views,
      platforms,
      topContent,
      geo,
      devices,
      users,
      engagement,
    };
  }

  async authStats(input?: { from?: string; to?: string }) {
    const { from, to } = this.dateRange(input);
    const where: Prisma.AuthEventWhereInput = {
      createdAt: { gte: from, lte: to },
    };
    const successWhere: Prisma.AuthEventWhereInput = {
      ...where,
      status: 'success',
    };
    const failedWhere: Prisma.AuthEventWhereInput = {
      ...where,
      status: 'failed',
    };

    const [
      registrations,
      totalLogins,
      successfulLogins,
      failedLogins,
      byEventType,
      byPlatform,
      byStatus,
      recent,
      totalUsers,
      activeUsers,
      lockedAccounts,
    ] = await Promise.all([
      this.prisma.authEvent.count({
        where: { ...where, eventType: 'register' },
      }),
      this.prisma.authEvent.count({
        where: { ...where, eventType: { in: ['login', 'register', 'google'] } },
      }),
      this.prisma.authEvent.count({
        where: {
          ...successWhere,
          eventType: { in: ['login', 'register', 'google'] },
        },
      }),
      this.prisma.authEvent.count({
        where: { ...failedWhere, eventType: { in: ['failed_login'] } },
      }),
      this.prisma.authEvent.groupBy({
        by: ['eventType'],
        where,
        _count: { _all: true },
      }),
      this.prisma.authEvent.groupBy({
        by: ['platform'],
        where: { ...where, platform: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.authEvent.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.authEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true,
          eventType: true,
          method: true,
          platform: true,
          status: true,
          ip: true,
          userAgent: true,
          createdAt: true,
          user: { select: { id: true, username: true, email: true } },
        },
      }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { lastActiveAt: { gte: from } } }),
      this.prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
    ]);

    const totalEvents = totalLogins + failedLogins;
    const successRate =
      totalEvents > 0
        ? Math.round((successfulLogins / Math.max(totalLogins, 1)) * 1000) / 10
        : 0;

    return {
      from,
      to,
      totalUsers,
      activeUsers,
      lockedAccounts,
      registrations,
      logins: totalLogins,
      successfulLogins,
      failedLogins,
      successRate,
      byEventType,
      byPlatform,
      byStatus,
      recent,
    };
  }
}
