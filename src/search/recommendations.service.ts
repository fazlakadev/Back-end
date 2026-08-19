import { Injectable } from '@nestjs/common';
import type { Locale } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  async recommend(userId: string | undefined, locale: Locale, limit: number) {
    const seenSeasons: string[] = [];
    const seenCategories: string[] = [];

    if (userId) {
      const views = await this.prisma.view.findMany({
        where: { userId, contentType: { in: ['episode', 'article'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { contentType: true, contentId: true },
      });
      const episodeIds = views
        .filter((v: any) => v.contentType === 'episode')
        .map((v: any) => v.contentId);
      const articleIds = views
        .filter((v: any) => v.contentType === 'article')
        .map((v: any) => v.contentId);

      if (episodeIds.length) {
        const episodes = await this.prisma.episode.findMany({
          where: { id: { in: episodeIds }, seasonId: { not: null } },
          select: { seasonId: true },
        });
        seenSeasons.push(...episodes.map((e: any) => e.seasonId as string));
      }
      if (articleIds.length) {
        const articles = await this.prisma.article.findMany({
          where: { id: { in: articleIds }, category: { not: null } },
          select: { category: true },
        });
        seenCategories.push(...(articles.map((a: any) => a.category) as string[]));
      }
    }

    const episodeWhere = seenSeasons.length
      ? { published: true, seasonId: { in: seenSeasons } }
      : { published: true };
    const articleWhere = seenCategories.length
      ? { published: true, category: { in: seenCategories } }
      : { published: true };

    const [episodes, articles, seasons] = await Promise.all([
      this.prisma.episode.findMany({
        where: episodeWhere,
        orderBy: { publishedAt: 'desc' },
        take: limit,
        include: {
          translations: { where: { locale } },
          season: { include: { translations: { where: { locale } } } },
        },
      }),
      this.prisma.article.findMany({
        where: articleWhere,
        orderBy: { publishedAt: 'desc' },
        take: limit,
        include: {
          translations: { where: { locale } },
          season: { include: { translations: { where: { locale } } } },
        },
      }),
      this.prisma.season.findMany({
        where: { published: true },
        orderBy: { publishedAt: 'desc' },
        take: Math.min(6, limit),
        include: { translations: { where: { locale } } },
      }),
    ]);

    return {
      episodes: episodes.map((e: any) => ({
        id: e.id,
        slug: e.slug,
        title: e.translations[0]?.title ?? null,
        description: e.translations[0]?.description ?? null,
        coverImage: e.coverImage,
        duration: e.duration,
        seasonId: e.seasonId,
        seasonTitle: e.season?.translations[0]?.title ?? null,
        publishedAt: e.publishedAt,
      })),
      articles: articles.map((a: any) => ({
        id: a.id,
        slug: a.slug,
        title: a.translations[0]?.title ?? null,
        excerpt: a.translations[0]?.excerpt ?? null,
        coverImage: a.coverImage,
        category: a.category,
        publishedAt: a.publishedAt,
      })),
      seasons: seasons.map((s: any) => ({
        id: s.id,
        slug: s.slug,
        title: s.translations[0]?.title ?? null,
        description: s.translations[0]?.description ?? null,
        coverImage: s.coverImage,
        publishedAt: s.publishedAt,
      })),
    };
  }
}
