import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommentStatus, ContentType, Platform, Prisma } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import { adminCan } from '../common/utils/helpers';
import { CallerContext } from '../common/types/request-context';
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';

const COMMENTABLE: Record<string, string> = {
  ARTICLE: 'article',
  EPISODE: 'episode',
  PLAYLIST: 'playlist',
  SEASON: 'season',
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  private async assertContentExists(
    contentType: ContentType,
    contentId: string,
  ) {
    const model = COMMENTABLE[contentType];
    if (!model) return true;
    const count = await (this.prisma as any)[model].count({
      where: { id: contentId },
    });
    if (count === 0) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
  }

  async create(userId: string, dto: CreateCommentDto, platform?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true, phoneVerifiedAt: true },
    });
    if (user && !user.emailVerified && !user.phoneVerifiedAt) {
      throw new ForbiddenException(
        this.i18n()?.t('errors.verifyToComment') ??
          'Verify your email or phone to comment',
      );
    }
    const contentType = dto.contentType;
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
      });
      if (
        !parent ||
        parent.contentType !== contentType ||
        parent.contentId !== dto.contentId
      ) {
        throw new NotFoundException(
          this.i18n()?.t('errors.recordNotFound') ?? 'Parent not found',
        );
      }
    }
    await this.assertContentExists(contentType, dto.contentId);

    const comment = await this.prisma.comment.create({
      data: {
        userId,
        contentType,
        contentId: dto.contentId,
        parentId: dto.parentId,
        body: dto.body,
        platform: (platform as Platform) || undefined,
      },
      include: { user: this.userSelect() },
    });
    (comment as any).likedByMe = false;

    await this.incrementCount(contentType, dto.contentId, 1);

    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
        select: { userId: true },
      });
      if (parent && parent.userId !== userId) {
        await this.notifications.notify(
          parent.userId,
          'comment',
          'New reply',
          'Someone replied to your comment.',
          {
            commentId: comment.id,
            parentId: dto.parentId,
            contentType,
            contentId: dto.contentId,
          },
        );
      }
    }

    return comment;
  }

  async findAll(
    contentType: ContentType,
    contentId: string,
    page: number,
    limit: number,
    userId?: string,
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.CommentWhereInput = {
      contentType,
      contentId,
      parentId: null,
      status: 'active',
    };
    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        include: {
          user: this.userSelect(),
          _count: { select: { replies: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.comment.count({ where }),
    ]);
    return {
      data: await this.markLiked(rows, userId),
      meta: buildMeta(total, page, limit),
    };
  }

  async getReplies(
    commentId: string,
    page: number,
    limit: number,
    userId?: string,
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.CommentWhereInput = {
      parentId: commentId,
      status: 'active',
    };
    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        include: { user: this.userSelect() },
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.comment.count({ where }),
    ]);
    return {
      data: await this.markLiked(rows, userId),
      meta: buildMeta(total, page, limit),
    };
  }

  private async markLiked<T extends { id: string; likesCount?: number }>(
    rows: T[],
    userId?: string,
  ): Promise<Array<T & { likedByMe: boolean }>> {
    const ids = rows.map((r) => r.id);
    const liked = new Set<string>();
    const countById = new Map<string, number>();
    if (ids.length === 0) return [];
    const [likes, counts] = await Promise.all([
      userId
        ? this.prisma.like.findMany({
            where: {
              userId,
              contentType: 'comment',
              contentId: { in: ids },
            },
            select: { contentId: true },
          })
        : Promise.resolve([]),
      this.prisma.like.groupBy({
        by: ['contentId'],
        where: {
          contentType: 'comment',
          contentId: { in: ids },
        },
        _count: { _all: true },
      }),
    ]);
    for (const l of likes) liked.add(l.contentId);
    for (const c of counts) countById.set(c.contentId, c._count._all);
    return rows.map((r) => ({
      ...r,
      likesCount: countById.get(r.id) ?? r.likesCount ?? 0,
      likedByMe: liked.has(r.id),
    }));
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateCommentDto,
    caller: CallerContext,
  ) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (comment.userId !== userId && !adminCan(caller, 'content:moderate')) {
      throw new NotFoundException(
        this.i18n()?.t('errors.notOwner') ?? 'Not owner',
      );
    }
    if (comment.userId === userId && !adminCan(caller, 'content:moderate')) {
      const ageMs = Date.now() - new Date(comment.createdAt).getTime();
      if (ageMs > 60 * 60 * 1000) {
        throw new ForbiddenException(
          this.i18n()?.t('errors.editWindowExpired') ?? 'Edit window expired',
        );
      }
    }
    return this.prisma.comment.update({
      where: { id },
      data: { body: dto.body, edited: true },
      include: { user: this.userSelect() },
    });
  }

  async remove(id: string, userId: string, caller: CallerContext) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (comment.userId !== userId && !adminCan(caller, 'content:moderate')) {
      throw new NotFoundException(
        this.i18n()?.t('errors.notOwner') ?? 'Not owner',
      );
    }
    await this.prisma.comment.delete({ where: { id } });
    await this.incrementCount(comment.contentType, comment.contentId, -1);
    return { success: true };
  }

  async hide(id: string, caller: CallerContext) {
    if (!adminCan(caller, 'content:moderate')) {
      throw new NotFoundException(
        this.i18n()?.t('errors.unauthorized') ?? 'Unauthorized',
      );
    }
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: { userId: true, contentType: true, contentId: true },
    });
    await this.prisma.comment.update({
      where: { id },
      data: { status: 'hidden' },
    });
    if (comment?.userId) {
      await this.notifications.notify(
        comment.userId,
        'system',
        'Comment moderated',
        'Your comment was hidden by a moderator.',
        {
          commentId: id,
          contentType: comment.contentType,
          contentId: comment.contentId,
        },
      );
    }
    return { success: true };
  }

  async adminQueue(
    page: number,
    limit: number,
    filters: {
      status?: CommentStatus;
      contentType?: string;
      q?: string;
      platform?: string;
    } = {},
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.CommentWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.contentType
        ? { contentType: filters.contentType as ContentType }
        : {}),
      ...(filters.platform ? { platform: filters.platform as Platform } : {}),
      ...(filters.q
        ? { body: { contains: filters.q, mode: 'insensitive' } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        include: {
          user: this.userSelect(),
          parent: { select: { id: true, body: true, userId: true } },
          _count: { select: { replies: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.comment.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async setStatus(adminId: string, id: string, status: CommentStatus) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    const updated = await this.prisma.comment.update({
      where: { id },
      data: { status },
      include: { user: this.userSelect() },
    });
    await this.audit.record(adminId, 'comment.status_change', 'comment', id, {
      status,
      userId: comment.userId,
    });
    return updated;
  }

  async adminEdit(adminId: string, id: string, body: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    if (!body?.trim()) {
      throw new BadRequestException(
        this.i18n()?.t('errors.bodyRequired') ?? 'Body is required',
      );
    }
    const updated = await this.prisma.comment.update({
      where: { id },
      data: { body: body.trim(), edited: true },
      include: { user: this.userSelect() },
    });
    await this.audit.record(adminId, 'comment.edit', 'comment', id, {
      userId: comment.userId,
    });
    return updated;
  }

  async adminRemove(adminId: string, id: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      throw new NotFoundException(
        this.i18n()?.t('errors.recordNotFound') ?? 'Not found',
      );
    }
    await this.prisma.comment.delete({ where: { id } });
    await this.incrementCount(comment.contentType, comment.contentId, -1);
    await this.audit.record(adminId, 'comment.delete', 'comment', id, {
      userId: comment.userId,
    });
    return { success: true };
  }

  private async incrementCount(
    contentType: ContentType,
    contentId: string,
    delta: number,
  ) {
    const model = COMMENTABLE[contentType];
    if (!model) return;
    try {
      await (this.prisma as any)[model].update({
        where: { id: contentId },
        data: { commentsCount: { increment: delta } },
      });
    } catch {
      // content may not have a counter (e.g. season) — ignore
    }
  }

  private userSelect() {
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
