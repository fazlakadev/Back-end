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
import {
  AddItemDto,
  CreatePlaylistDto,
  UpdatePlaylistDto,
} from './dto/playlist.dto';

@Injectable()
export class PlaylistsService {
  constructor(private readonly prisma: PrismaService) {}

  private i18n() {
    return I18nContext.current();
  }

  async create(ownerId: string, dto: CreatePlaylistDto) {
    const slug = slugify(dto.slug);
    await this.assertSlugFree(slug);
    return this.prisma.playlist.create({
      data: {
        slug,
        kind: 'user',
        ownerId,
        platform: dto.platform ?? 'WEB',
        coverImage: dto.coverImage,
        isPublic: dto.isPublic ?? true,
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

  async createPlatform(adminId: string, dto: CreatePlaylistDto) {
    const slug = slugify(dto.slug);
    await this.assertSlugFree(slug);
    return this.prisma.playlist.create({
      data: {
        slug,
        kind: 'platform',
        createdByAdminId: adminId,
        platform: dto.platform ?? 'WEB',
        coverImage: dto.coverImage,
        isPublic: dto.isPublic ?? true,
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

  async listPlatform(
    locale: Locale,
    page: number,
    limit: number,
    platform?: Platform,
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.PlaylistWhereInput = {
      kind: 'platform' as const,
      ...(platform ? { platform } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.playlist.findMany({
        where,
        include: {
          translations: { where: { locale } },
          createdByAdmin: {
            select: { id: true, username: true, displayName: true },
          },
          _count: { select: { items: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.playlist.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async findAll(
    locale: Locale,
    page: number,
    limit: number,
    userId?: string,
    platform?: Platform,
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.PlaylistWhereInput = userId
      ? { OR: [{ isPublic: true }, { ownerId: userId }] }
      : { isPublic: true };
    if (platform) {
      where.platform = platform;
    }
    const [rows, total] = await Promise.all([
      this.prisma.playlist.findMany({
        where,
        include: {
          translations: { where: { locale } },
          owner: {
            select: { id: true, name: true, username: true, avatarUrl: true },
          },
          _count: { select: { items: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.playlist.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async findOne(idOrSlug: string, locale: Locale) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        translations: { where: { locale } },
        owner: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            episode: { include: { translations: { where: { locale } } } },
          },
        },
      },
    });
    if (!playlist) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    return playlist;
  }

  async update(
    id: string,
    dto: UpdatePlaylistDto,
    userId: string,
    caller: CallerContext,
  ) {
    const existing = await this.prisma.playlist.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (existing.ownerId !== userId && !adminCan(caller, 'content:manage')) {
      throw new NotFoundException(
        this.i18n()?.t('errors.notOwner') ?? 'Not owner',
      );
    }
    if (dto.slug && dto.slug !== existing.slug) {
      await this.assertSlugFree(slugify(dto.slug), id);
    }

    return this.prisma.playlist.update({
      where: { id },
      data: {
        slug: dto.slug ? slugify(dto.slug) : undefined,
        platform: dto.platform,
        coverImage: dto.coverImage,
        isPublic: dto.isPublic,
        ...(dto.translations
          ? {
              translations: {
                upsert: dto.translations.map((t) => ({
                  where: {
                    playlistId_locale: { playlistId: id, locale: t.locale },
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
    const existing = await this.prisma.playlist.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (existing.ownerId !== userId && !adminCan(caller, 'content:manage')) {
      throw new NotFoundException(
        this.i18n()?.t('errors.notOwner') ?? 'Not owner',
      );
    }
    await this.prisma.playlist.delete({ where: { id } });
    return { success: true };
  }

  async addItem(
    playlistId: string,
    dto: AddItemDto,
    userId: string,
    caller?: CallerContext,
  ) {
    await this.assertOwnership(playlistId, userId, caller);
    const episode = await this.prisma.episode.findUnique({
      where: { id: dto.episodeId },
    });
    if (!episode) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Episode not found',
      );
    }
    try {
      return await this.prisma.playlistItem.create({
        data: {
          playlistId,
          episodeId: dto.episodeId,
          sortOrder: await this.nextSortOrder(playlistId),
        },
      });
    } catch {
      throw new ConflictException('errors.duplicateRecord');
    }
  }

  async removeItem(
    playlistId: string,
    episodeId: string,
    userId: string,
    caller?: CallerContext,
  ) {
    await this.assertOwnership(playlistId, userId, caller);
    await this.prisma.playlistItem.deleteMany({
      where: { playlistId, episodeId },
    });
    return { success: true };
  }

  async reorderItems(
    playlistId: string,
    episodeIds: string[],
    userId: string,
    caller?: CallerContext,
  ) {
    await this.assertOwnership(playlistId, userId, caller);
    const tx = episodeIds.map((episodeId, index) =>
      this.prisma.playlistItem.updateMany({
        where: { playlistId, episodeId },
        data: { sortOrder: index },
      }),
    );
    await this.prisma.$transaction(tx);
    return { success: true };
  }

  private async nextSortOrder(playlistId: string): Promise<number> {
    const last = await this.prisma.playlistItem.findFirst({
      where: { playlistId },
      orderBy: { sortOrder: 'desc' },
    });
    return last ? last.sortOrder + 1 : 0;
  }

  private async assertOwnership(
    playlistId: string,
    userId?: string,
    caller?: CallerContext,
  ) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
    });
    if (!playlist) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const allowed =
      (playlist.ownerId != null && playlist.ownerId === userId) ||
      (playlist.kind === 'platform' && caller?.isAdmin) ||
      adminCan(caller, 'content:manage');
    if (!allowed) {
      throw new NotFoundException(
        this.i18n()?.t('errors.notOwner') ?? 'Not owner',
      );
    }
  }

  private async assertSlugFree(slug: string, ignoreId?: string) {
    const exists = await this.prisma.playlist.findUnique({ where: { slug } });
    if (exists && exists.id !== ignoreId) {
      throw new ConflictException(
        this.i18n()?.t('errors.duplicateSlug') ?? 'Slug in use',
      );
    }
  }
}
