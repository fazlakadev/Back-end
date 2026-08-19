import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentType, LikeType, Locale } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';

const LIKEABLE: Record<string, string> = {
  article: 'article',
  episode: 'episode',
  playlist: 'playlist',
  season: 'season',
  comment: 'comment',
};

@Injectable()
export class LikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  private async assertContentExists(
    contentType: ContentType,
    contentId: string,
  ) {
    const model = LIKEABLE[contentType];
    if (!model) return;
    const count = await (this.prisma as any)[model].count({
      where: { id: contentId },
    });
    if (count === 0) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
  }

  async toggleLike(
    userId: string,
    contentType: ContentType,
    contentId: string,
    type: LikeType = 'like',
  ) {
    await this.assertContentExists(contentType, contentId);

    const existing = await this.prisma.like.findUnique({
      where: {
        userId_contentType_contentId: { userId, contentType, contentId },
      },
    });

    if (existing) {
      await this.prisma.like.delete({ where: { id: existing.id } });
      await this.adjustCount(contentType, contentId, -1);
      return { liked: false, type: null };
    }

    await this.prisma.like.create({
      data: { userId, contentType, contentId, type },
    });
    await this.adjustCount(contentType, contentId, 1);
    await this.notifyCommentOwner(userId, contentType, contentId);
    return { liked: true, type };
  }

  private async notifyCommentOwner(
    userId: string,
    contentType: ContentType,
    contentId: string,
  ) {
    if (contentType !== 'comment') return;
    try {
      const comment = await this.prisma.comment.findUnique({
        where: { id: contentId },
        select: { userId: true, body: true },
      });
      if (comment && comment.userId !== userId) {
        await this.notifications.notify(
          comment.userId,
          'like',
          'New like',
          'Someone liked your comment.',
          {
            commentId: contentId,
            preview: comment.body.slice(0, 80),
          },
        );
      }
    } catch {
      // ignore
    }
  }

  async isLiked(userId: string, contentType: ContentType, contentId: string) {
    const like = await this.prisma.like.findUnique({
      where: {
        userId_contentType_contentId: { userId, contentType, contentId },
      },
    });
    return { liked: !!like, type: like?.type ?? null };
  }

  async getCount(contentType: ContentType, contentId: string) {
    const [count, likes] = await Promise.all([
      this.prisma.like.count({ where: { contentType, contentId } }),
      this.prisma.like.findMany({
        where: { contentType, contentId },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
      }),
    ]);
    return { count, likes };
  }

  async getLikeHistory(
    userId: string,
    page: number,
    limit: number,
    locale: Locale,
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.like.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.like.count({ where }),
    ]);

    const grouped: Record<string, string[]> = {};
    for (const row of rows) {
      const model = LIKEABLE[row.contentType];
      if (!model) continue;
      (grouped[model] ??= []).push(row.contentId);
    }

    const metaById = new Map<
      string,
      {
        title?: string | null;
        coverImage?: string | null;
        episode?: unknown;
      }
    >();
    for (const [model, ids] of Object.entries(grouped)) {
      try {
        if (model === 'comment') {
          const recs = await this.prisma.comment.findMany({
            where: { id: { in: ids } },
            select: { id: true, body: true },
          });
          for (const r of recs) {
            metaById.set(r.id, { title: r.body.slice(0, 80) });
          }
        } else if (model === 'episode') {
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
              episode: r,
            });
          }
        } else {
          const recs = (await (this.prisma as any)[model].findMany({
            where: { id: { in: ids } },
            select: {
              id: true,
              coverImage: true,
              translations: {
                where: { locale },
                select: { title: true },
                take: 1,
              },
            },
          })) as Array<{
            id: string;
            coverImage?: string | null;
            translations?: Array<{ title?: string | null }>;
          }>;
          for (const r of recs) {
            metaById.set(r.id, {
              title: r.translations?.[0]?.title,
              coverImage: r.coverImage,
            });
          }
        }
      } catch {
        // ignore
      }
    }

    const data = rows.map((row: any) => {
      const meta = metaById.get(row.contentId);
      return {
        id: row.id,
        contentType: row.contentType,
        contentId: row.contentId,
        type: row.type,
        title: meta?.title,
        coverImage: meta?.coverImage,
        episode: meta?.episode,
        likedAt: row.createdAt,
      };
    });

    return { data, meta: buildMeta(total, page, limit) };
  }

  private async adjustCount(
    contentType: ContentType,
    contentId: string,
    delta: number,
  ) {
    const model = LIKEABLE[contentType];
    if (!model) return;
    if (model === 'comment') {
      try {
        await this.prisma.comment.update({
          where: { id: contentId },
          data: { likesCount: { increment: delta } },
        });
      } catch {
        // ignore
      }
      return;
    }
    try {
      await (this.prisma as any)[model].update({
        where: { id: contentId },
        data: { likesCount: { increment: delta } },
      });
    } catch {
      // ignore
    }
  }
}
