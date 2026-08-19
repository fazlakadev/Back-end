import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Locale, Platform, Prisma } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import { adminCan, slugify } from '../common/utils/helpers';
import { CallerContext } from '../common/types/request-context';
import { AuditService } from '../audit/audit.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { CreateEpisodeDto, UpdateEpisodeDto } from './dto/episode.dto';

@Injectable()
export class EpisodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  async create(authorId: string | null, dto: CreateEpisodeDto) {
    const slug = slugify(dto.slug);
    await this.assertSlugFree(slug);
    return this.prisma.episode
      .create({
        data: {
          slug,
          authorId,
          seasonId: dto.seasonId,
          platform: dto.platform ?? 'WEB',
          coverImage: dto.coverImage,
          videoUrl: dto.videoUrl,
          audioUrl: dto.audioUrl,
          duration: dto.duration,
          episodeNumber: dto.episodeNumber,
          category: dto.category,
          releaseYear: dto.releaseYear,
          tags: dto.tags ?? [],
          published: dto.published ?? false,
          publishedAt: dto.published ? new Date() : null,
          translations: {
            create: dto.translations.map((t) => ({
              locale: t.locale,
              title: t.title,
              description: t.description,
              content: t.content,
            })),
          },
        },
        include: {
          translations: true,
          author: this.authorSelect(),
          season: { include: { translations: { where: { locale: 'ar' } } } },
        },
      })
      .then(async (episode) => {
        if (episode.published) {
          await this.webhooks.send('episode.created', {
            id: episode.id,
            slug: episode.slug,
          });
        }
        return episode;
      });
  }

  async findAll(
    locale: Locale,
    page: number,
    limit: number,
    filters: { seasonId?: string; search?: string; published?: boolean } = {},
    publishedOnly = true,
    platform?: Platform,
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.EpisodeWhereInput = {
      ...(filters.published !== undefined
        ? { published: filters.published }
        : publishedOnly
          ? { published: true }
          : {}),
      ...(platform ? { platform } : {}),
      ...(filters.seasonId ? { seasonId: filters.seasonId } : {}),
      ...(filters.search
        ? {
            translations: {
              some: {
                title: { contains: filters.search, mode: 'insensitive' },
              },
            },
          }
        : { translations: { some: { locale } } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.episode.findMany({
        where,
        include: {
          author: this.authorSelect(),
          translations: { where: { locale } },
          season: { include: { translations: { where: { locale } } } },
        },
        skip,
        take: limit,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.episode.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async findOne(idOrSlug: string, locale: Locale) {
    const episode = await this.prisma.episode.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        translations: true,
        author: this.authorSelect(),
        season: { include: { translations: { where: { locale } } } },
      },
    });
    if (!episode) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const localeVersion = episode.translations.find((t: any) => t.locale === locale);
    return {
      ...episode,
      translations: localeVersion ? [localeVersion] : [],
    };
  }

  async update(
    id: string,
    dto: UpdateEpisodeDto,
    userId: string,
    caller: CallerContext,
  ) {
    const existing = await this.prisma.episode.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (existing.authorId !== userId && !adminCan(caller, 'content:manage')) {
      throw new NotFoundException(
        this.i18n()?.t('errors.notOwner') ?? 'Not owner',
      );
    }
    if (dto.slug && dto.slug !== existing.slug) {
      await this.assertSlugFree(slugify(dto.slug), id);
    }

    return this.prisma.episode.update({
      where: { id },
      data: {
        slug: dto.slug ? slugify(dto.slug) : undefined,
        seasonId: dto.seasonId,
        platform: dto.platform,
        coverImage: dto.coverImage,
        videoUrl: dto.videoUrl,
        audioUrl: dto.audioUrl,
        duration: dto.duration,
        episodeNumber: dto.episodeNumber,
        category: dto.category,
        releaseYear: dto.releaseYear,
        tags: dto.tags,
        published: dto.published,
        publishedAt:
          dto.published && !existing.published ? new Date() : undefined,
        ...(dto.translations
          ? {
              translations: {
                upsert: dto.translations.map((t) => ({
                  where: {
                    episodeId_locale: { episodeId: id, locale: t.locale },
                  },
                  update: {
                    title: t.title,
                    description: t.description,
                    content: t.content,
                  },
                  create: {
                    locale: t.locale,
                    title: t.title,
                    description: t.description,
                    content: t.content,
                  },
                })),
              },
            }
          : {}),
      },
      include: { translations: true, author: this.authorSelect() },
    });
  }

  async remove(id: string, userId: string, caller: CallerContext) {
    const existing = await this.prisma.episode.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (existing.authorId !== userId && !adminCan(caller, 'content:manage')) {
      throw new NotFoundException(
        this.i18n()?.t('errors.notOwner') ?? 'Not owner',
      );
    }
    await this.prisma.episode.delete({ where: { id } });
    return { success: true };
  }

  async adminCreate(adminId: string, dto: CreateEpisodeDto) {
    const episode = await this.create(null, dto);
    await this.audit.record(adminId, 'content.create', 'episode', episode.id, {
      slug: episode.slug,
      published: episode.published,
    });
    return episode;
  }

  async adminFindOne(id: string) {
    const episode = await this.prisma.episode.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        translations: true,
        author: this.authorSelect(),
        season: { include: { translations: true } },
      },
    });
    if (!episode) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return episode;
  }

  async related(idOrSlug: string, locale: Locale, limit = 10) {
    const episode = await this.prisma.episode.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: {
        id: true,
        seasonId: true,
        category: true,
        tags: true,
        viewsCount: true,
      },
    });
    if (!episode) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }

    const seasonEpisodes = episode.seasonId
      ? await this.prisma.episode.findMany({
          where: {
            published: true,
            seasonId: episode.seasonId,
            id: { not: episode.id },
          },
          orderBy: [{ episodeNumber: 'asc' }, { publishedAt: 'desc' }],
          take: limit,
          include: { translations: { where: { locale } } },
        })
      : [];

    let result = seasonEpisodes;
    if (result.length < limit) {
      const selected = new Set(result.map((e: any) => e.id));
      const similar = await this.prisma.episode.findMany({
        where: {
          published: true,
          id: { notIn: [...selected, episode.id] },
          OR: [
            ...(episode.category ? [{ category: episode.category }] : []),
            ...(episode.tags.length > 0
              ? [{ tags: { hasSome: episode.tags.slice(0, 5) } }]
              : []),
          ],
        },
        orderBy: { viewsCount: 'desc' },
        take: limit - result.length,
        include: { translations: { where: { locale } } },
      });
      result = [...result, ...similar];
      selected.clear();
      similar.forEach((e: any) => selected.add(e.id));
    }

    if (result.length < limit) {
      const selected = new Set(result.map((e: any) => e.id));
      const latest = await this.prisma.episode.findMany({
        where: { published: true, id: { notIn: [...selected, episode.id] } },
        orderBy: { publishedAt: 'desc' },
        take: limit - result.length,
        include: { translations: { where: { locale } } },
      });
      result = [...result, ...latest];
    }

    return {
      data: result.slice(0, limit).map((e: any) => ({
        ...e,
        translations: e.translations.filter((t: any) => t.locale === locale),
      })),
    };
  }

  async adminDuplicate(adminId: string, id: string) {
    const existing = await this.prisma.episode.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const base = existing.slug.replace(/-\d+$/, '');
    const newSlug = await this.nextSlug(base);
    const copy = await this.prisma.episode.create({
      data: {
        slug: newSlug,
        seasonId: existing.seasonId,
        platform: existing.platform,
        coverImage: existing.coverImage,
        videoUrl: existing.videoUrl,
        audioUrl: existing.audioUrl,
        duration: existing.duration,
        episodeNumber: existing.episodeNumber,
        category: existing.category,
        releaseYear: existing.releaseYear,
        tags: existing.tags,
        published: false,
        translations: {
          create: existing.translations.map((t: any) => ({
            locale: t.locale,
            title: `${t.title} (copy)`,
            description: t.description,
            content: t.content,
          })),
        },
      },
      include: { translations: true },
    });
    await this.audit.record(adminId, 'content.duplicate', 'episode', copy.id, {
      sourceId: id,
      slug: copy.slug,
    });
    return copy;
  }

  private async nextSlug(base: string): Promise<string> {
    let candidate = `${base}-copy`;
    let n = 1;
    while (
      await this.prisma.episode.findUnique({ where: { slug: candidate } })
    ) {
      n += 1;
      candidate = `${base}-copy-${n}`;
    }
    return candidate;
  }

  async adminUpdate(adminId: string, id: string, dto: UpdateEpisodeDto) {
    const existing = await this.prisma.episode.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (dto.slug && dto.slug !== existing.slug) {
      await this.assertSlugFree(slugify(dto.slug), id);
    }
    const episode = await this.prisma.episode.update({
      where: { id },
      data: {
        slug: dto.slug ? slugify(dto.slug) : undefined,
        seasonId: dto.seasonId,
        platform: dto.platform,
        coverImage: dto.coverImage,
        videoUrl: dto.videoUrl,
        audioUrl: dto.audioUrl,
        duration: dto.duration,
        episodeNumber: dto.episodeNumber,
        category: dto.category,
        releaseYear: dto.releaseYear,
        tags: dto.tags ?? [],
        published: dto.published,
        publishedAt:
          dto.published && !existing.published ? new Date() : undefined,
        ...(dto.translations
          ? {
              translations: {
                upsert: dto.translations.map((t) => ({
                  where: {
                    episodeId_locale: { episodeId: id, locale: t.locale },
                  },
                  update: {
                    title: t.title,
                    description: t.description,
                    content: t.content,
                  },
                  create: {
                    locale: t.locale,
                    title: t.title,
                    description: t.description,
                    content: t.content,
                  },
                })),
              },
            }
          : {}),
      },
      include: { translations: true, author: this.authorSelect() },
    });
    if (dto.published && !existing.published) {
      await this.webhooks.send('episode.published', {
        id: episode.id,
        slug: episode.slug,
      });
    }
    await this.audit.record(adminId, 'content.update', 'episode', id, {
      published: dto.published,
    });
    return episode;
  }

  async adminSetPublished(adminId: string, id: string, published: boolean) {
    const existing = await this.prisma.episode.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const episode = await this.prisma.episode.update({
      where: { id },
      data: {
        published,
        publishedAt: published && !existing.published ? new Date() : undefined,
      },
      include: { translations: true },
    });
    if (published && !existing.published) {
      await this.webhooks.send('episode.published', {
        id: episode.id,
        slug: episode.slug,
      });
    }
    await this.audit.record(adminId, 'content.publish', 'episode', id, {
      published,
    });
    return episode;
  }

  async adminBulkPublish(adminId: string, ids: string[], published: boolean) {
    const result = await this.prisma.episode.updateMany({
      where: { id: { in: ids } },
      data: {
        published,
        ...(published ? { publishedAt: new Date() } : {}),
      },
    });
    await this.audit.record(adminId, 'content.bulk_publish', 'episode', undefined, {
      ids,
      published,
      count: result.count,
    });
    return { success: true, updated: result.count };
  }

  async adminRemove(adminId: string, id: string) {
    const existing = await this.prisma.episode.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    await this.prisma.episode.delete({ where: { id } });
    await this.audit.record(adminId, 'content.remove', 'episode', id, {
      slug: existing.slug,
    });
    return { success: true };
  }

  async countAll(): Promise<number> {
    return this.prisma.episode.count();
  }

  private async assertSlugFree(slug: string, ignoreId?: string) {
    const exists = await this.prisma.episode.findUnique({ where: { slug } });
    if (exists && exists.id !== ignoreId) {
      throw new ConflictException(
        this.i18n()?.t('errors.duplicateSlug') ?? 'Slug in use',
      );
    }
  }

  private authorSelect() {
    return {
      select: {
        id: true,
        name: true,
        username: true,
        avatarUrl: true,
      },
    };
  }
}
