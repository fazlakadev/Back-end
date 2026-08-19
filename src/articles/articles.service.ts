import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Locale, Platform, Prisma } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePagination, buildMeta } from '../common/utils/pagination';
import { adminCan, slugify } from '../common/utils/helpers';
import { CallerContext } from '../common/types/request-context';
import { AuditService } from '../audit/audit.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { CreateArticleDto, UpdateArticleDto } from './dto/article.dto';

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  async create(authorId: string | null, dto: CreateArticleDto) {
    const slug = slugify(dto.slug);
    await this.assertSlugFree(slug);

    const article = await this.prisma.article.create({
      data: {
        slug,
        authorId,
        seasonId: dto.seasonId,
        platform: dto.platform ?? 'WEB',
        coverImage: dto.coverImage,
        category: dto.category,
        tags: dto.tags ?? [],
        bodyFormat: dto.bodyFormat ?? 'text',
        published: dto.published ?? false,
        publishedAt: dto.published ? new Date() : null,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            excerpt: t.excerpt,
            body: t.body,
            seoTitle: t.seoTitle,
            seoDescription: t.seoDescription,
          })),
        },
      },
      include: {
        translations: true,
        author: this.authorSelect(),
        season: { include: { translations: { where: { locale: 'ar' } } } },
      },
    });
    if (article.published) {
      await this.webhooks.send('article.published', {
        id: article.id,
        slug: article.slug,
      });
    }
    return article;
  }

  async findAll(
    locale: Locale,
    page: number,
    limit: number,
    filters: { category?: string; search?: string; published?: boolean } = {},
    publishedOnly = true,
    platform?: Platform,
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.ArticleWhereInput = {
      ...(filters.published !== undefined
        ? { published: filters.published }
        : publishedOnly
          ? { published: true }
          : {}),
      ...(filters.category ? { category: filters.category } : {}),
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
      this.prisma.article.findMany({
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
      this.prisma.article.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async findOne(idOrSlug: string, locale: Locale) {
    const article = await this.prisma.article.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        author: this.authorSelect(),
        translations: true,
        season: { include: { translations: { where: { locale } } } },
      },
    });
    if (!article) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const localeVersion = article.translations.find((t: any) => t.locale === locale);
    return {
      ...article,
      translations: localeVersion ? [localeVersion] : [],
    };
  }

  async findBySlug(slug: string, locale: Locale) {
    return this.findOne(slug, locale);
  }

  async update(
    id: string,
    dto: UpdateArticleDto,
    userId: string,
    caller: CallerContext,
  ) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
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

    const data: Prisma.ArticleUpdateInput = {
      slug: dto.slug ? slugify(dto.slug) : undefined,
      ...(dto.seasonId !== undefined
        ? { season: { connect: { id: dto.seasonId } } }
        : {}),
      platform: dto.platform,
      coverImage: dto.coverImage,
      category: dto.category,
      tags: dto.tags,
      bodyFormat: dto.bodyFormat,
      published: dto.published,
      publishedAt:
        dto.published && !existing.published ? new Date() : undefined,
      ...(dto.translations
        ? {
            translations: {
              upsert: dto.translations.map((t) => ({
                where: {
                  articleId_locale: { articleId: id, locale: t.locale },
                },
                update: {
                  title: t.title,
                  excerpt: t.excerpt,
                  body: t.body,
                  seoTitle: t.seoTitle,
                  seoDescription: t.seoDescription,
                },
                create: {
                  locale: t.locale,
                  title: t.title,
                  excerpt: t.excerpt,
                  body: t.body,
                  seoTitle: t.seoTitle,
                  seoDescription: t.seoDescription,
                },
              })),
            },
          }
        : {}),
    };

    const article = await this.prisma.article.update({
      where: { id },
      data,
      include: {
        translations: true,
        author: this.authorSelect(),
        season: { include: { translations: { where: { locale: 'ar' } } } },
      },
    });
    return article;
  }

  async remove(id: string, userId: string, caller: CallerContext) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
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
    await this.prisma.article.delete({ where: { id } });
    return { success: true };
  }

  async adminCreate(adminId: string, dto: CreateArticleDto) {
    const article = await this.create(null, dto);
    await this.audit.record(adminId, 'content.create', 'article', article.id, {
      slug: article.slug,
      published: article.published,
    });
    return article;
  }

  async adminFindOne(id: string) {
    const article = await this.prisma.article.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        translations: true,
        author: this.authorSelect(),
        season: { include: { translations: true } },
      },
    });
    if (!article) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return article;
  }

  async adminUpdate(adminId: string, id: string, dto: UpdateArticleDto) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (dto.slug && dto.slug !== existing.slug) {
      await this.assertSlugFree(slugify(dto.slug), id);
    }

    const data: Prisma.ArticleUpdateInput = {
      slug: dto.slug ? slugify(dto.slug) : undefined,
      ...(dto.seasonId !== undefined
        ? { season: { connect: { id: dto.seasonId } } }
        : {}),
      platform: dto.platform,
      coverImage: dto.coverImage,
      category: dto.category,
      tags: dto.tags,
      bodyFormat: dto.bodyFormat,
      published: dto.published,
      publishedAt:
        dto.published && !existing.published ? new Date() : undefined,
      ...(dto.translations
        ? {
            translations: {
              upsert: dto.translations.map((t) => ({
                where: {
                  articleId_locale: { articleId: id, locale: t.locale },
                },
                update: {
                  title: t.title,
                  excerpt: t.excerpt,
                  body: t.body,
                  seoTitle: t.seoTitle,
                  seoDescription: t.seoDescription,
                },
                create: {
                  locale: t.locale,
                  title: t.title,
                  excerpt: t.excerpt,
                  body: t.body,
                  seoTitle: t.seoTitle,
                  seoDescription: t.seoDescription,
                },
              })),
            },
          }
        : {}),
    };

    const article = await this.prisma.article.update({
      where: { id },
      data,
      include: {
        translations: true,
        author: this.authorSelect(),
        season: { include: { translations: { where: { locale: 'ar' } } } },
      },
    });
    if (dto.published && !existing.published) {
      await this.webhooks.send('article.published', {
        id: article.id,
        slug: article.slug,
      });
    }
    await this.audit.record(adminId, 'content.update', 'article', id, {
      published: dto.published,
    });
    return article;
  }

  async adminSetPublished(adminId: string, id: string, published: boolean) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const article = await this.prisma.article.update({
      where: { id },
      data: {
        published,
        publishedAt: published && !existing.published ? new Date() : undefined,
      },
      include: { translations: true },
    });
    if (published && !existing.published) {
      await this.webhooks.send('article.published', {
        id: article.id,
        slug: article.slug,
      });
    }
    await this.audit.record(adminId, 'content.publish', 'article', id, {
      published,
    });
    return article;
  }

  async adminBulkPublish(adminId: string, ids: string[], published: boolean) {
    const result = await this.prisma.article.updateMany({
      where: { id: { in: ids } },
      data: {
        published,
        ...(published ? { publishedAt: new Date() } : {}),
      },
    });
    await this.audit.record(adminId, 'content.bulk_publish', 'article', undefined, {
      ids,
      published,
      count: result.count,
    });
    return { success: true, updated: result.count };
  }

  async adminRemove(adminId: string, id: string) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    await this.prisma.article.delete({ where: { id } });
    await this.audit.record(adminId, 'content.remove', 'article', id, {
      slug: existing.slug,
    });
    return { success: true };
  }

  private async assertSlugFree(slug: string, ignoreId?: string) {
    const exists = await this.prisma.article.findUnique({ where: { slug } });
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
