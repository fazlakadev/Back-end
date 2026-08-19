import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import type { RequestContext } from '../common/types/request-context';

export interface AuthEventInput {
  userId: string;
  eventType: string;
  method?: string;
  status?: 'success' | 'failed';
  ctx?: RequestContext;
  metadata?: Record<string, unknown>;
}

interface AuthEventFilters {
  eventType?: string;
  platform?: string;
  status?: string;
  userId?: string;
  q?: string;
  from?: string;
  to?: string;
}

const USER_AGENT_RE =
  /(Macintosh|Windows NT|Android|iPhone|iPad|Linux|CrOS|X11|Ubuntu|FreeBSD|PlayStation|Xbox)/;

@Injectable()
export class AuthEventsService {
  private readonly logger = new Logger(AuthEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private parseUserAgent(ua?: string): {
    device?: string;
    browser?: string;
    os?: string;
  } {
    if (!ua) return {};
    let device: string | undefined;
    let browser: string | undefined;
    let os: string | undefined;

    if (/Mobile|iPhone|Android.*Mobile/i.test(ua)) device = 'mobile';
    else if (/iPad|Tablet/i.test(ua)) device = 'tablet';
    else device = 'desktop';

    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/Chrome/i.test(ua)) browser = 'Chrome';
    else if (/Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Safari/i.test(ua)) browser = 'Safari';
    else if (/Opera|OPR\//i.test(ua)) browser = 'Opera';

    const match = USER_AGENT_RE.exec(ua);
    if (match) {
      const v = match[1];
      if (v === 'Macintosh') os = 'macOS';
      else if (v === 'Windows NT') os = 'Windows';
      else if (v === 'Android') os = 'Android';
      else if (v === 'iPhone' || v === 'iPad') os = 'iOS';
      else if (v === 'Linux' || v === 'Ubuntu') os = 'Linux';
      else if (v === 'CrOS') os = 'ChromeOS';
      else os = v;
    }

    return { device, browser, os };
  }

  async record(input: AuthEventInput): Promise<void> {
    try {
      const parsed = this.parseUserAgent(input.ctx?.userAgent);
      await this.prisma.authEvent.create({
        data: {
          userId: input.userId,
          eventType: input.eventType,
          method: input.method,
          status: input.status ?? 'success',
          platform: input.ctx?.platform ?? 'WEB',
          ip: input.ctx?.ip,
          ipHash: input.ctx?.ipHash,
          userAgent: input.ctx?.userAgent,
          device: input.ctx?.deviceType ?? parsed.device,
          browser: input.ctx?.browser ?? parsed.browser,
          os: input.ctx?.os ?? parsed.os,
          country: input.ctx?.country,
          city: input.ctx?.city,
          metadata: (input.metadata ?? undefined) as
            Prisma.InputJsonValue | undefined,
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to record auth event: ${(e as Error).message}`);
    }
  }

  async list(page: number, limit: number, filters: AuthEventFilters = {}) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.AuthEventWhereInput = {
      eventType: filters.eventType,
      platform: filters.platform,
      status: filters.status,
      userId: filters.userId,
      createdAt: {
        gte: filters.from ? new Date(filters.from) : undefined,
        lte: filters.to ? new Date(filters.to) : undefined,
      },
      ...(filters.q
        ? {
            OR: [
              {
                user: {
                  username: {
                    contains: filters.q,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                user: {
                  email: { contains: filters.q, mode: 'insensitive' as const },
                },
              },
              { ip: { contains: filters.q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.authEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.authEvent.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }
}
