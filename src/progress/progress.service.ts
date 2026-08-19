import { Injectable, NotFoundException } from '@nestjs/common';
import type { Locale } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertProgressDto } from './dto/progress.dto';

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  private i18n() {
    return I18nContext.current();
  }

  async upsert(userId: string, episodeId: string, dto: UpsertProgressDto) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
    });
    if (!episode) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }

    const percent =
      dto.durationSeconds && dto.durationSeconds > 0
        ? Math.min(
            100,
            Math.round((dto.positionSeconds / dto.durationSeconds) * 100),
          )
        : 0;

    return this.prisma.playbackProgress.upsert({
      where: { userId_episodeId: { userId, episodeId } },
      create: {
        userId,
        episodeId,
        positionSeconds: dto.positionSeconds,
        durationSeconds: dto.durationSeconds,
        percent,
      },
      update: {
        positionSeconds: dto.positionSeconds,
        durationSeconds: dto.durationSeconds,
        percent,
      },
    });
  }

  async get(userId: string, episodeId: string) {
    const row = await this.prisma.playbackProgress.findUnique({
      where: { userId_episodeId: { userId, episodeId } },
    });
    if (!row) {
      return null;
    }
    return row;
  }

  async list(userId: string, locale: Locale) {
    const rows = await this.prisma.playbackProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        episode: {
          include: {
            translations: { where: { locale } },
            season: { include: { translations: { where: { locale } } } },
          },
        },
      },
    });
    return rows.map((r: any) => ({
      id: r.id,
      userId: r.userId,
      episodeId: r.episodeId,
      positionSeconds: r.positionSeconds,
      durationSeconds: r.durationSeconds,
      percent: r.percent,
      updatedAt: r.updatedAt,
      title: r.episode.translations[0]?.title ?? null,
      coverImage: r.episode.coverImage,
      seasonId: r.episode.seasonId,
      seasonTitle: r.episode.season?.translations[0]?.title ?? null,
      episode: r.episode,
    }));
  }

  async remove(userId: string, episodeId: string) {
    await this.prisma.playbackProgress.deleteMany({
      where: { userId, episodeId },
    });
    return { success: true, removed: episodeId };
  }
}
