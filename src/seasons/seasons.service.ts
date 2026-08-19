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
import { CreateSeasonDto, UpdateSeasonDto } from './dto/season.dto';

@Injectable()
export class SeasonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  async create(createdById: string | null, dto: CreateSeasonDto) {
    const slug = slugify(dto.slug);
    await this.assertSlugFree(slug);
    return this.prisma.season.create({
      data: {
        slug,
        createdById,
        platform: dto.platform ?? 'WEB',
        coverImage: dto.coverImage,
        published: dto.published ?? false,
        publishedAt: dto.published ? new Date() : null,
        sortOrder: dto.sortOrder ?? 0,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            description: t.description,
          })),
        },
      },
      include: { translations: true },
    });
  }

  async findAll(
    locale: Locale,
    page: number,
    limit: number,
    filters: { search?: string; published?: boolean } = {},
    publishedOnly = true,
    platform?: Platform,
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.SeasonWhereInput = {
      ...(filters.published !== undefined
        ? { published: filters.published }
        : publishedOnly
          ? { published: true }
          : {}),
      ...(platform ? { platform } : {}),
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
      this.prisma.season.findMany({
        where,
        include: {
          translations: { where: { locale } },
          _count: { select: { episodes: true } },
        },
        skip,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.season.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async findOne(idOrSlug: string, locale: Locale) {
    const season = await this.prisma.season.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        translations: { where: { locale } },
        episodes: {
          where: { published: true },
          orderBy: { episodeNumber: 'asc' },
          include: { translations: { where: { locale } } },
        },
        articles: {
          where: { published: true },
          orderBy: { publishedAt: 'desc' },
          include: { translations: { where: { locale } } },
        },
      },
    });
    if (!season) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return season;
  }

  async update(
    id: string,
    dto: UpdateSeasonDto,
    userId: string,
    caller: CallerContext,
  ) {
    const existing = await this.prisma.season.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (
      existing.createdById !== userId &&
      !adminCan(caller, 'content:manage')
    ) {
      throw new NotFoundException(
        this.i18n()?.t('errors.notOwner') ?? 'Not owner',
      );
    }
    if (dto.slug && dto.slug !== existing.slug) {
      await this.assertSlugFree(slugify(dto.slug), id);
    }

    return this.prisma.season.update({
      where: { id },
      data: {
        slug: dto.slug ? slugify(dto.slug) : undefined,
        coverImage: dto.coverImage,
        platform: dto.platform,
        published: dto.published,
        publishedAt:
          dto.published && !existing.published ? new Date() : undefined,
        sortOrder: dto.sortOrder,
        ...(dto.translations
          ? {
              translations: {
                upsert: dto.translations.map((t) => ({
                  where: {
                    seasonId_locale: { seasonId: id, locale: t.locale },
                  },
                  update: { title: t.title, description: t.description },
                  create: {
                    locale: t.locale,
                    title: t.title,
                    description: t.description,
                  },
                })),
              },
            }
          : {}),
      },
      include: { translations: true },
    });
  }

  async remove(id: string, userId: string, caller: CallerContext) {
    const existing = await this.prisma.season.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (
      existing.createdById !== userId &&
      !adminCan(caller, 'content:manage')
    ) {
      throw new NotFoundException(
        this.i18n()?.t('errors.notOwner') ?? 'Not owner',
      );
    }
    await this.prisma.season.delete({ where: { id } });
    return { success: true };
  }

  async adminCreate(adminId: string, dto: CreateSeasonDto) {
    const season = await this.create(null, dto);
    await this.audit.record(adminId, 'content.create', 'season', season.id, {
      slug: season.slug,
      published: season.published,
    });
    return season;
  }

  async adminFindOne(id: string) {
    const season = await this.prisma.season.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        translations: true,
        episodes: {
          orderBy: { episodeNumber: 'asc' },
          include: { translations: true },
        },
        articles: {
          orderBy: { publishedAt: 'desc' },
          include: { translations: true },
        },
      },
    });
    if (!season) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return season;
  }

  async adminUpdate(adminId: string, id: string, dto: UpdateSeasonDto) {
    const existing = await this.prisma.season.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (dto.slug && dto.slug !== existing.slug) {
      await this.assertSlugFree(slugify(dto.slug), id);
    }
    const season = await this.prisma.season.update({
      where: { id },
      data: {
        slug: dto.slug ? slugify(dto.slug) : undefined,
        coverImage: dto.coverImage,
        platform: dto.platform,
        published: dto.published,
        publishedAt:
          dto.published && !existing.published ? new Date() : undefined,
        sortOrder: dto.sortOrder,
        ...(dto.translations
          ? {
              translations: {
                upsert: dto.translations.map((t) => ({
                  where: {
                    seasonId_locale: { seasonId: id, locale: t.locale },
                  },
                  update: { title: t.title, description: t.description },
                  create: {
                    locale: t.locale,
                    title: t.title,
                    description: t.description,
                  },
                })),
              },
            }
          : {}),
      },
      include: { translations: true },
    });
    await this.audit.record(adminId, 'content.update', 'season', id, {
      published: dto.published,
    });
    return season;
  }

  async adminSetPublished(adminId: string, id: string, published: boolean) {
    const existing = await this.prisma.season.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const season = await this.prisma.season.update({
      where: { id },
      data: {
        published,
        publishedAt: published && !existing.published ? new Date() : undefined,
      },
      include: { translations: true },
    });
    await this.audit.record(adminId, 'content.publish', 'season', id, {
      published,
    });
    return season;
  }

  async adminRemove(adminId: string, id: string) {
    const existing = await this.prisma.season.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    await this.prisma.season.delete({ where: { id } });
    await this.audit.record(adminId, 'content.remove', 'season', id, {
      slug: existing.slug,
    });
    return { success: true };
  }

  private async assertSlugFree(slug: string, ignoreId?: string) {
    const exists = await this.prisma.season.findUnique({ where: { slug } });
    if (exists && exists.id !== ignoreId) {
      throw new ConflictException(
        this.i18n()?.t('errors.duplicateSlug') ?? 'Slug in use',
      );
    }
  }
}
