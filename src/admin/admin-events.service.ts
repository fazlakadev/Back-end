import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import type { RequestContext } from '../common/types/request-context';

export interface AdminAuthEventInput {
  adminId: string;
  eventType: string;
  method?: string;
  status?: 'success' | 'failed';
  ctx?: RequestContext;
  metadata?: Record<string, unknown>;
}

interface AdminAuthEventFilters {
  eventType?: string;
  status?: string;
  adminId?: string;
  q?: string;
  from?: string;
  to?: string;
}

const USER_AGENT_RE =
  /(Macintosh|Windows NT|Android|iPhone|iPad|Linux|CrOS|X11|Ubuntu|FreeBSD|PlayStation|Xbox)/;

@Injectable()
export class AdminAuthEventsService {
  private readonly logger = new Logger(AdminAuthEventsService.name);

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

  async record(input: AdminAuthEventInput): Promise<void> {
    try {
      const parsed = this.parseUserAgent(input.ctx?.userAgent);
      await this.prisma.adminAuthEvent.create({
        data: {
          adminId: input.adminId,
          eventType: input.eventType,
          method: input.method,
          status: input.status ?? 'success',
          ip: input.ctx?.ip,
          ipHash: input.ctx?.ipHash,
          userAgent: input.ctx?.userAgent,
          device: input.ctx?.deviceType ?? parsed.device,
          browser: input.ctx?.browser ?? parsed.browser,
          os: input.ctx?.os ?? parsed.os,
          country: input.ctx?.country,
          countryCode: input.ctx?.countryCode,
          city: input.ctx?.city,
          lat: input.ctx?.lat,
          lng: input.ctx?.lng,
          metadata: (input.metadata ?? undefined) as
            Prisma.InputJsonValue | undefined,
        },
      });
    } catch (e) {
      this.logger.warn(
        `Failed to record admin auth event: ${(e as Error).message}`,
      );
    }
  }

  async list(page: number, limit: number, filters: AdminAuthEventFilters = {}) {
    const { skip } = resolvePagination({ page, limit });
    const where: Prisma.AdminAuthEventWhereInput = {
      eventType: filters.eventType,
      status: filters.status,
      adminId: filters.adminId,
      createdAt: {
        gte: filters.from ? new Date(filters.from) : undefined,
        lte: filters.to ? new Date(filters.to) : undefined,
      },
      ...(filters.q
        ? {
            OR: [
              {
                admin: {
                  username: {
                    contains: filters.q,
                    mode: 'insensitive' as const,
                  },
                },
              },
              { ip: { contains: filters.q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.adminAuthEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          admin: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.adminAuthEvent.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }
}
