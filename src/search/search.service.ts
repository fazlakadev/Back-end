import { Injectable } from '@nestjs/common';
import type { Locale, Platform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueryVariants, normalizeArabic } from '../common/utils/arabic';

export interface SearchRow {
  type: 'episode' | 'article' | 'season' | 'playlist';
  id: string;
  slug: string;
  title: string;
  description?: string;
  coverImage?: string;
  publishedAt?: Date | null;
  viewsCount?: number;
}

export interface GlobalSearchOptions {
  types?: Array<'episode' | 'article' | 'season' | 'playlist'>;
  category?: string;
  platform?: Platform;
  sort?: 'latest' | 'popular';
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async globalSearch(
    q: string,
    locale: Locale,
    page: number,
    limit: number,
    options: GlobalSearchOptions = {},
  ) {
    const query = q?.trim();
    if (!query) {
      return { query, results: [], total: 0, page, limit };
    }

    const types = options.types?.length
      ? options.types
      : ['episode', 'article', 'season', 'playlist'];
    const sort = options.sort === 'popular' ? 'popular' : 'latest';
    const variants = buildQueryVariants(query);

    const matchTranslation = (fields: string[]) => ({
      some: {
        locale,
        OR: fields.flatMap((field) =>
          variants.map((variant) => ({
            [field]: { contains: variant, mode: 'insensitive' as const },
          })),
        ),
      },
    });

    const baseOrder =
      sort === 'popular'
        ? ({ viewsCount: 'desc' } as const)
        : ({ publishedAt: 'desc' } as const);

    const perType = Math.max(1, Math.ceil(limit / types.length));
    const pageSkip = (page - 1) * limit;

    const tasks: Array<Promise<{ rows: SearchRow[]; total: number }>> = [];

    if (types.includes('episode')) {
      const where = {
        published: true,
        platform: options.platform,
        category: options.category,
        translations: matchTranslation(['title', 'description', 'content']),
      };
      tasks.push(
        Promise.all([
          this.prisma.episode.findMany({
            where,
            orderBy: baseOrder,
            take: perType,
            skip: pageSkip,
            include: { translations: { where: { locale } } },
          }),
          this.prisma.episode.count({ where }),
        ]).then(([items, total]) => ({
          rows: items.map((e: any) => ({
            type: 'episode' as const,
            id: e.id,
            slug: e.slug,
            title: e.translations[0]?.title ?? '',
            description: e.translations[0]?.description ?? undefined,
            coverImage: e.coverImage ?? undefined,
            publishedAt: e.publishedAt,
            viewsCount: e.viewsCount,
          })),
          total,
        })),
      );
    }

    if (types.includes('article')) {
      const where = {
        published: true,
        platform: options.platform,
        category: options.category,
        translations: matchTranslation(['title', 'excerpt', 'body']),
      };
      tasks.push(
        Promise.all([
          this.prisma.article.findMany({
            where,
            orderBy: baseOrder,
            take: perType,
            skip: pageSkip,
            include: { translations: { where: { locale } } },
          }),
          this.prisma.article.count({ where }),
        ]).then(([items, total]) => ({
          rows: items.map((a: any) => ({
            type: 'article' as const,
            id: a.id,
            slug: a.slug,
            title: a.translations[0]?.title ?? '',
            description:
              a.translations[0]?.excerpt ??
              a.translations[0]?.body ??
              undefined,
            coverImage: a.coverImage ?? undefined,
            publishedAt: a.publishedAt,
            viewsCount: a.viewsCount,
          })),
          total,
        })),
      );
    }

    if (types.includes('season')) {
      const where = {
        published: true,
        platform: options.platform,
        translations: matchTranslation(['title', 'description']),
      };
      tasks.push(
        Promise.all([
          this.prisma.season.findMany({
            where,
            orderBy: { publishedAt: 'desc' },
            take: perType,
            skip: pageSkip,
            include: { translations: { where: { locale } } },
          }),
          this.prisma.season.count({ where }),
        ]).then(([items, total]) => ({
          rows: items.map((s: any) => ({
            type: 'season' as const,
            id: s.id,
            slug: s.slug,
            title: s.translations[0]?.title ?? '',
            description: s.translations[0]?.description ?? undefined,
            coverImage: s.coverImage ?? undefined,
            publishedAt: s.publishedAt,
          })),
          total,
        })),
      );
    }

    if (types.includes('playlist')) {
      const where = {
        isPublic: true,
        translations: matchTranslation(['title', 'description']),
      };
      tasks.push(
        Promise.all([
          this.prisma.playlist.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: perType,
            skip: pageSkip,
            include: { translations: { where: { locale } } },
          }),
          this.prisma.playlist.count({ where }),
        ]).then(([items, total]) => ({
          rows: items.map((p: any) => ({
            type: 'playlist' as const,
            id: p.id,
            slug: p.slug,
            title: p.translations[0]?.title ?? '',
            description: p.translations[0]?.description ?? undefined,
            coverImage: p.coverImage ?? undefined,
            publishedAt: null,
          })),
          total,
        })),
      );
    }

    const settled = await Promise.all(tasks);
    const results = settled
      .flatMap((s) => s.rows)
      .sort((a, b) => {
        if (sort === 'popular') {
          return (b.viewsCount ?? 0) - (a.viewsCount ?? 0);
        }
        return (
          new Date(b.publishedAt ?? 0).getTime() -
          new Date(a.publishedAt ?? 0).getTime()
        );
      })
      .slice(0, limit);
    const total = settled.reduce((sum, s) => sum + s.total, 0);

    return {
      query,
      normalized: normalizeArabic(query),
      results,
      total,
      page,
      limit,
    };
  }

  async suggestions(q: string, locale: Locale, limit = 6) {
    const query = q?.trim();
    if (!query) {
      return { query, results: [] };
    }
    const variants = buildQueryVariants(query);
    const match = (fields: string[]) => ({
      some: {
        locale,
        OR: fields.flatMap((field) =>
          variants.map((variant) => ({
            [field]: { contains: variant, mode: 'insensitive' as const },
          })),
        ),
      },
    });

    const [episodes, articles, seasons, playlists] = await Promise.all([
      this.prisma.episode.findMany({
        where: { published: true, translations: match(['title']) },
        orderBy: { viewsCount: 'desc' },
        take: limit,
        select: {
          slug: true,
          coverImage: true,
          translations: { where: { locale }, select: { title: true } },
        },
      }),
      this.prisma.article.findMany({
        where: { published: true, translations: match(['title']) },
        orderBy: { viewsCount: 'desc' },
        take: limit,
        select: {
          slug: true,
          coverImage: true,
          translations: { where: { locale }, select: { title: true } },
        },
      }),
      this.prisma.season.findMany({
        where: { published: true, translations: match(['title']) },
        orderBy: { publishedAt: 'desc' },
        take: limit,
        select: {
          slug: true,
          coverImage: true,
          translations: { where: { locale }, select: { title: true } },
        },
      }),
      this.prisma.playlist.findMany({
        where: { isPublic: true, translations: match(['title']) },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          slug: true,
          coverImage: true,
          translations: { where: { locale }, select: { title: true } },
        },
      }),
    ]);

    const results = [
      ...episodes.map((e: any) => ({
        type: 'episode' as const,
        slug: e.slug,
        title: e.translations[0]?.title ?? '',
        coverImage: e.coverImage ?? undefined,
      })),
      ...seasons.map((s: any) => ({
        type: 'season' as const,
        slug: s.slug,
        title: s.translations[0]?.title ?? '',
        coverImage: s.coverImage ?? undefined,
      })),
      ...playlists.map((p: any) => ({
        type: 'playlist' as const,
        slug: p.slug,
        title: p.translations[0]?.title ?? '',
        coverImage: p.coverImage ?? undefined,
      })),
      ...articles.map((a: any) => ({
        type: 'article' as const,
        slug: a.slug,
        title: a.translations[0]?.title ?? '',
        coverImage: a.coverImage ?? undefined,
      })),
    ].slice(0, limit);

    return { query, results };
  }
}
