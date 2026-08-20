import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { I18nContext } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from '../common/types/request-context';
import { slugify } from '../common/utils/helpers';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { VerificationService } from '../verification/verification.service';
import { AuthEventsService } from '../auth-events/auth-events.service';
import { requestAuditStore } from '../common/middleware/request-audit.middleware';
import {
  AdminUserUpdateDto,
  SaveGeolocationDto,
  UpdatePreferencesDto,
  UpdateProfileDto,
} from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly verification: VerificationService,
    private readonly authEvents: AuthEventsService,
    private readonly config: ConfigService,
  ) {}

  private i18n() {
    return I18nContext.current();
  }

  private track(
    userId: string,
    eventType: string,
    metadata?: Record<string, unknown>,
  ) {
    const auditCtx = requestAuditStore.getStore() ?? {};
    void this.authEvents.record({
      userId,
      eventType,
      method: 'account',
      ctx: auditCtx,
      metadata,
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preference: true },
    });
    if (!user) {
      throw new NotFoundException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const { passwordHash, twoFactorSecret, ...safe } = user;
    void passwordHash;
    void twoFactorSecret;
    return {
      ...safe,
      hasPassword: !!user.passwordHash,
      phoneLinked: !!user.phone,
      googleLinked: !!user.googleId,
      githubLinked: !!user.githubId,
      facebookLinked: !!user.facebookId,
    };
  }

  async getPublicProfile(identifier: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { publicId: identifier },
          { username: identifier },
          { id: identifier },
        ],
        status: { not: 'banned' },
      },
      select: {
        id: true,
        publicId: true,
        name: true,
        username: true,
        avatarUrl: true,
        bannerUrl: true,
        bio: true,
        locale: true,
        createdAt: true,
        emailVerified: true,
      },
    });
    if (!user) {
      throw new NotFoundException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const [friendsCount, ratingsCount, articlesCount, playlistsCount] =
      await Promise.all([
        this.prisma.friend.count({
          where: {
            status: 'accepted',
            OR: [{ senderId: user.id }, { receiverId: user.id }],
          },
        }),
        this.prisma.rating.count({ where: { userId: user.id } }),
        this.prisma.article.count({
          where: { authorId: user.id, published: true },
        }),
        this.prisma.playlist.count({
          where: { ownerId: user.id, isPublic: true },
        }),
      ]);
    return {
      id: user.id,
      publicId: user.publicId,
      name: user.name,
      username: user.username,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      bio: user.bio,
      locale: user.locale,
      createdAt: user.createdAt,
      verified: user.emailVerified !== null,
      stats: { friendsCount, ratingsCount, articlesCount, playlistsCount },
    };
  }

  async setBanner(userId: string, url: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { bannerUrl: url },
      include: { preference: true },
    });
    this.track(userId, 'banner_uploaded');
    return user;
  }

  async markOnboarded(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { onboardedAt: user.onboardedAt ?? new Date() },
      include: { preference: true },
    });
  }

  /** Presence heartbeat — stamps lastActiveAt (used for online dots). */
  async heartbeat(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });
    return { success: true };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.bannerUrl !== undefined) data.bannerUrl = dto.bannerUrl;
    if (dto.username !== undefined) {
      const exists = await this.prisma.user.findFirst({
        where: { username: dto.username, id: { not: userId } },
      });
      if (exists) {
        throw new ConflictException(
          this.i18n()?.t('errors.usernameInUse') ?? 'Username taken',
        );
      }
      data.username = dto.username;
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: { preference: true },
    });
    this.track(userId, 'profile_updated', {
      fields: Object.keys(dto),
    });
    return user;
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const existing = await this.prisma.userPreference.upsert({
      where: { userId },
      update: { ...dto },
      create: { userId, ...dto },
    });
    if (dto.locale !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { locale: dto.locale },
      });
    }
    this.track(userId, 'preferences_updated', {
      fields: Object.keys(dto),
    });
    return existing;
  }

  async saveGeolocation(
    userId: string,
    dto: SaveGeolocationDto,
    ctx: RequestContext,
  ) {
    const { lat, lng, ...rest } = dto.location;
    const platform =
      ctx.platform === 'MOBILE'
        ? 'MOBILE'
        : ctx.platform === 'DESKTOP'
          ? 'DESKTOP'
          : 'WEB';
    const saved = await this.prisma.geolocation.create({
      data: {
        userId,
        lat,
        lng,
        ...rest,
        platform,
      },
    });
    this.track(userId, 'geolocation_updated', { lat, lng, platform });
    return saved;
  }

  async getGeolocations(userId: string, limit = 20) {
    return this.prisma.geolocation.findMany({
      where: { userId },
      orderBy: { capturedAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  async setAvatar(userId: string, url: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
      include: { preference: true },
    });
    this.track(userId, 'avatar_uploaded');
    return user;
  }

  async deactivate(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'deleted' },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async searchUsers(
    query: string,
    currentUserId: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = {
      status: { not: 'banned' },
      id: { not: currentUserId },
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { username: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ],
    };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
          bio: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, meta: buildMeta(total, page, limit) };
  }

  async createDefaultUsername(email: string): Promise<string> {
    const base = slugify(email.split('@')[0] || 'user').slice(0, 20) || 'user';
    let candidate = base;
    let n = 1;
    while (
      await this.prisma.user.findUnique({ where: { username: candidate } })
    ) {
      candidate = `${base}${n++}`;
    }
    return candidate;
  }

  async getNotifications(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const where = { userId };
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, meta: buildMeta(total, page, limit) };
  }

  async getMyReferrals(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    const where = { referredById: userId };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
          status: true,
          createdAt: true,
          lastActiveAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      referralCode: me?.referralCode ?? null,
      referrals: data,
      meta: buildMeta(total, page, limit),
    };
  }

  async markAllNotificationsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async clearNotifications(userId: string) {
    await this.prisma.notification.deleteMany({ where: { userId } });
    return { success: true };
  }

  async createNotification(input: {
    userId: string;
    type:
      | 'comment'
      | 'like'
      | 'friend_request'
      | 'friend_accepted'
      | 'system'
      | 'support'
      | 'announcement';
    title: string;
    body: string;
    data?: unknown;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data as Prisma.InputJsonValue,
      },
    });
    await this.realtime
      .sendNotification(input.userId, notification)
      .catch(() => undefined);
    return notification;
  }

  async adminList(
    page: number,
    limit: number,
    filters: {
      q?: string;
      status?: UserStatus;
      from?: string;
      to?: string;
      platform?: string;
    } = {},
  ) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.UserWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.platform ? { lastPlatform: filters.platform as never } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: 'insensitive' } },
              { username: { contains: filters.q, mode: 'insensitive' } },
              { email: { contains: filters.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          publicId: true,
          email: true,
          name: true,
          username: true,
          status: true,
          banReason: true,
          banExpiresAt: true,
          locale: true,
          emailVerified: true,
          createdAt: true,
          lastActiveAt: true,
          lastLoginIp: true,
          lastPlatform: true,
          _count: {
            select: { playlists: true, comments: true, ratings: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, meta: buildMeta(total, page, limit) };
  }

  async adminGet(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        preference: true,
        _count: {
          select: {
            playlists: true,
            seasons: true,
            episodes: true,
            articles: true,
            comments: true,
            likes: true,
            ratings: true,
            reportsMade: true,
            progress: true,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const [ratingAvg, reports] = await Promise.all([
      this.prisma.rating.aggregate({
        where: { userId: id, status: 'approved' },
        _avg: { value: true },
        _count: true,
      }),
      this.prisma.report.findMany({
        where: { reporterId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    const { passwordHash, ...rest } = user;
    void passwordHash;
    return {
      ...rest,
      stats: {
        ratingAverage: ratingAvg._avg.value
          ? Number(ratingAvg._avg.value.toFixed(2))
          : null,
        ratingCount: ratingAvg._count,
        recentReports: reports,
      },
    };
  }

  async setStatus(
    adminId: string,
    id: string,
    dto: { status: UserStatus; banReason?: string; banExpiresAt?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const banned = dto.status === 'banned';
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        status: dto.status,
        banReason: dto.banReason ?? (banned ? user.banReason : null),
        banExpiresAt: dto.banExpiresAt
          ? new Date(dto.banExpiresAt)
          : banned
            ? user.banExpiresAt
            : null,
        bannedAt: banned ? (user.bannedAt ?? new Date()) : null,
      },
    });
    const wasBanned = user.status === 'banned';
    if (dto.status !== 'active') {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.record(adminId, 'user.status_change', 'user', id, {
      from: user.status,
      to: dto.status,
      banReason: dto.banReason,
    });
    if (user.email) {
      const mailOpts = {
        reason: dto.banReason ?? user.banReason,
        expiresAt: dto.banExpiresAt ?? (banned ? user.banExpiresAt : undefined),
        locale: user.locale,
      };
      if (banned) {
        await this.mail
          .sendAccountNotice(
            user.email,
            user.name || user.username || 'user',
            'banned',
            {
              reason: mailOpts.reason,
              expiresAt: mailOpts.expiresAt
                ? new Date(mailOpts.expiresAt)
                : null,
              locale: user.locale,
            },
          )
          .catch(() => undefined);
      } else if (wasBanned && dto.status === 'active') {
        await this.mail
          .sendAccountNotice(
            user.email,
            user.name || user.username || 'user',
            'unbanned',
            { locale: user.locale },
          )
          .catch(() => undefined);
      }
    }
    return { success: true, status: updated.status };
  }

  async adminResendVerifications(adminId: string) {
    const users = await this.prisma.user.findMany({
      where: { emailVerified: null },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        locale: true,
      },
      take: 500,
    });
    const baseUrl =
      this.config.get<string>('websiteUrl') || 'http://localhost:3000';
    let sent = 0;
    let skipped = 0;
    for (const u of users) {
      try {
        const recent = await this.prisma.verificationToken.findFirst({
          where: { userId: u.id, type: 'EMAIL_VERIFY', usedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        if (recent && Date.now() - recent.createdAt.getTime() < 60_000) {
          skipped += 1;
          continue;
        }
        const issued = await this.verification.issue(u.id, 'EMAIL_VERIFY', {
          ttlMs: 24 * 60 * 60 * 1000,
        });
        await this.mail.sendVerificationEmail(u.email, u.name || u.username, {
          link: `${baseUrl}/verify-email?token=${issued.token}`,
          otp: issued.otp,
          locale: u.locale,
        });
        sent += 1;
      } catch {
        skipped += 1;
      }
    }
    await this.audit.record(
      adminId,
      'users.resend_verifications',
      'user',
      undefined,
      { requested: users.length, sent, skipped },
    );
    return { requested: users.length, sent, skipped };
  }

  async adminUpdate(adminId: string, id: string, dto: AdminUserUpdateDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.locale !== undefined) data.locale = dto.locale;
    if (dto.emailVerified !== undefined) {
      data.emailVerified = dto.emailVerified ? new Date() : null;
    }
    if (dto.username !== undefined) {
      const exists = await this.prisma.user.findFirst({
        where: { username: dto.username, id: { not: id } },
      });
      if (exists) {
        throw new ConflictException(
          this.i18n()?.t('errors.usernameInUse') ?? 'Username taken',
        );
      }
      data.username = dto.username;
    }
    if (dto.email !== undefined) {
      const exists = await this.prisma.user.findFirst({
        where: { email: dto.email.toLowerCase().trim(), id: { not: id } },
      });
      if (exists) {
        throw new ConflictException(
          this.i18n()?.t('errors.emailInUse') ?? 'Email already in use',
        );
      }
      data.email = dto.email.toLowerCase().trim();
    }
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data,
      include: { preference: true },
    });
    await this.audit.record(adminId, 'user.update', 'user', id, {
      changed: Object.keys(dto).filter(
        (k) =>
          k !== 'password' && dto[k as keyof AdminUserUpdateDto] !== undefined,
      ),
    });
    const { passwordHash, ...rest } = updated;
    void passwordHash;
    return rest;
  }

  async adminActivity(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(
        this.i18n()?.t('errors.userNotFound') ?? 'User not found',
      );
    }
    const [
      authEvents,
      views,
      comments,
      ratings,
      reportsMade,
      likes,
      geolocations,
      sessions,
      counts,
    ] = await Promise.all([
      this.prisma.authEvent.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.view.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          contentType: true,
          contentId: true,
          platform: true,
          deviceType: true,
          deviceName: true,
          os: true,
          browser: true,
          country: true,
          countryCode: true,
          city: true,
          referrer: true,
          durationSec: true,
          completed: true,
          createdAt: true,
        },
      }),
      this.prisma.comment.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.rating.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.report.findMany({
        where: { reporterId: id },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.like.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.geolocation.findMany({
        where: { userId: id },
        orderBy: { capturedAt: 'desc' },
        take: 25,
      }),
      this.prisma.refreshToken.findMany({
        where: { userId: id, revokedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          createdAt: true,
          lastUsedAt: true,
          userAgent: true,
          platform: true,
          deviceType: true,
          deviceName: true,
          os: true,
          browser: true,
          country: true,
          city: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id },
        select: {
          _count: {
            select: {
              comments: true,
              ratings: true,
              likes: true,
              playlists: true,
              episodes: true,
              articles: true,
              reportsMade: true,
              views: true,
              progress: true,
            },
          },
        },
      }),
    ]);
    return {
      authEvents,
      views,
      comments,
      ratings,
      reportsMade,
      likes,
      geolocations,
      sessions,
      counts,
    };
  }
}
