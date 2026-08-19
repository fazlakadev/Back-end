import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';
import { requestAuditStore } from '../common/middleware/request-audit.middleware';
import { RequestContext } from '../common/types/request-context';

interface AuditFilters {
  adminId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    adminId: string | null,
    action: string,
    entityType: string,
    entityId?: string,
    details?: Record<string, unknown>,
    req?: Partial<RequestContext>,
  ) {
    const store = requestAuditStore.getStore() ?? {};
    const ctx: Partial<RequestContext> = { ...store, ...(req ?? {}) };
    return this.prisma.auditLog.create({
      data: {
        adminId,
        action,
        entityType,
        entityId,
        entityLabel:
          typeof details?.label === 'string' ? details.label : undefined,
        details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: ctx.ip,
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
        platform: ctx.platform,
        device: ctx.deviceType,
        os: ctx.os,
        browser: ctx.browser,
        country: ctx.country,
        countryCode: ctx.countryCode,
        city: ctx.city,
        lat: ctx.lat,
        lng: ctx.lng,
      },
    });
  }

  private buildWhere(filters: AuditFilters): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.adminId) where.adminId = filters.adminId;
    if (filters.action) where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to + 'T23:59:59.999Z') } : {}),
      };
    }
    return where;
  }

  async list(page: number, limit: number, filters: AuditFilters = {}) {
    const { skip } = resolvePagination({ page, limit });
    const where = this.buildWhere(filters);
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          admin: {
            select: { id: true, username: true, displayName: true, rank: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async exportCsv(filters: AuditFilters): Promise<string> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
      include: {
        admin: {
          select: { username: true, displayName: true, rank: true },
        },
      },
    });

    const header = 'ID,Action,Entity Type,Entity ID,Admin,Platform,IP,Country,City,User Agent,Created At,Details\n';
    const csvRows = rows.map((r: (typeof rows)[number]) => {
      const admin = r.admin?.displayName || r.admin?.username || 'system';
      const details = r.details ? JSON.stringify(r.details).replace(/"/g, '""') : '';
      const ua = (r.userAgent || '').replace(/"/g, '""');
      return [
        r.id,
        r.action,
        r.entityType,
        r.entityId || '',
        admin,
        r.platform || '',
        r.ip || '',
        r.country || '',
        r.city || '',
        ua,
        r.createdAt.toISOString(),
        details,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    return header + csvRows.join('\n');
  }
}
