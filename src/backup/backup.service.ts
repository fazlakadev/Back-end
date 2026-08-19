import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { buildMeta, resolvePagination } from '../common/utils/pagination';

type ModelName =
  | 'user'
  | 'userPreference'
  | 'banner'
  | 'bannerTranslation'
  | 'article'
  | 'articleTranslation'
  | 'season'
  | 'seasonTranslation'
  | 'episode'
  | 'episodeTranslation'
  | 'playlist'
  | 'playlistTranslation'
  | 'playlistItem'
  | 'comment'
  | 'like'
  | 'view'
  | 'friend'
  | 'supportTicket'
  | 'supportMessage'
  | 'notification'
  | 'mediaAsset'
  | 'geolocation'
  | 'refreshToken';

// Insertion order respects foreign keys; reverse is deletion order.
const EXPORT_ORDER: ModelName[] = [
  'user',
  'userPreference',
  'geolocation',
  'mediaAsset',
  'refreshToken',
  'banner',
  'bannerTranslation',
  'article',
  'articleTranslation',
  'season',
  'seasonTranslation',
  'episode',
  'episodeTranslation',
  'playlist',
  'playlistTranslation',
  'playlistItem',
  'comment',
  'like',
  'view',
  'friend',
  'supportTicket',
  'supportMessage',
  'notification',
];

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleScheduledBackup() {
    try {
      this.logger.log('Starting scheduled daily backup...');
      const result = await this.exportData();
      const json = JSON.stringify(result);
      const fileName = `fazlaka-backup-daily-${new Date().toISOString().slice(0, 10)}.json`;

      // Keep only last 7 daily backups
      const oldDaily = await this.prisma.backup.findMany({
        where: { type: 'daily' },
        orderBy: { createdAt: 'desc' },
        skip: 7,
      });
      if (oldDaily.length > 0) {
        await this.prisma.backup.deleteMany({
          where: { id: { in: oldDaily.map((b: any) => b.id) } },
        });
      }

      await this.prisma.backup.create({
        data: {
          fileName,
          sizeBytes: Buffer.byteLength(json),
          status: 'completed',
          type: 'daily',
          data: result as never,
        },
      });
      this.logger.log(`Scheduled backup completed: ${fileName}`);
    } catch (err) {
      this.logger.error('Scheduled backup failed', (err as Error).stack);
    }
  }

  async exportData(): Promise<{
    manifest: object;
    data: Record<string, unknown[]>;
  }> {
    const data: Record<string, unknown[]> = {};
    for (const model of EXPORT_ORDER) {
      const table = (this.prisma as any)[model];
      if (!table) continue;
      data[model] = await table.findMany();
    }
    return {
      manifest: {
        app: 'fazlaka',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        counts: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, v.length]),
        ),
      },
      data,
    };
  }

  async importData(payload: {
    manifest?: { app?: string; version?: string };
    data: Record<string, unknown[]>;
  }): Promise<{ imported: Record<string, number> }> {
    if (!payload || typeof payload !== 'object' || !payload.data) {
      throw new BadRequestException('Invalid backup payload');
    }
    if (payload.manifest && payload.manifest.app !== 'fazlaka') {
      throw new BadRequestException('Not a Fazlaka backup');
    }

    await this.clearAll();

    const imported: Record<string, number> = {};
    for (const model of EXPORT_ORDER) {
      const rows = payload.data[model];
      const table = (this.prisma as any)[model];
      if (!table || !Array.isArray(rows) || rows.length === 0) continue;

      // Ignore rows that miss required id (safety)
      const valid = rows.filter(
        (r) => r && typeof (r as { id?: string }).id === 'string',
      );
      try {
        await table.createMany({ data: valid });
        imported[model] = valid.length;
      } catch {
        // Fall back to per-row create to skip individual conflicts
        let ok = 0;
        for (const row of valid) {
          try {
            await table.create({ data: row });
            ok++;
          } catch {
            // skip conflicting row
          }
        }
        imported[model] = ok;
        this.logger.warn(`Partial import for ${model}: ${ok}/${valid.length}`);
      }
    }

    return { imported };
  }

  private async clearAll() {
    for (let i = EXPORT_ORDER.length - 1; i >= 0; i--) {
      const model = EXPORT_ORDER[i];
      const table = (this.prisma as any)[model];
      if (!table) continue;
      try {
        await table.deleteMany({});
      } catch {
        // ignore FK order issues
      }
    }
  }

  async list(page: number, limit: number) {
    const { skip } = resolvePagination({ page, limit });
    const [rows, total] = await Promise.all([
      this.prisma.backup.findMany({
        include: {
          createdBy: {
            select: { id: true, username: true, displayName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.backup.count(),
    ]);
    return { data: rows, meta: buildMeta(total, page, limit) };
  }

  async create(adminId: string) {
    const result = await this.exportData();
    const json = JSON.stringify(result);
    const fileName = `fazlaka-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    return this.prisma.backup.create({
      data: {
        fileName,
        sizeBytes: Buffer.byteLength(json),
        status: 'completed',
        type: 'manual',
        data: result as never,
        createdById: adminId,
      },
    });
  }

  async restore(id: string, adminId: string) {
    const backup = await this.prisma.backup.findUnique({ where: { id } });
    if (!backup) {
      throw new NotFoundException('Backup not found');
    }
    if (!backup.data) {
      throw new BadRequestException('Backup payload is empty');
    }
    await this.importData(
      backup.data as unknown as {
        manifest?: { app?: string; version?: string };
        data: Record<string, unknown[]>;
      },
    );
    return this.prisma.backup.update({
      where: { id },
      data: { status: 'completed', createdById: adminId },
    });
  }

  async getOne(id: string) {
    const backup = await this.prisma.backup.findUnique({ where: { id } });
    if (!backup) {
      throw new NotFoundException('Backup not found');
    }
    return backup;
  }

  async remove(id: string) {
    const backup = await this.prisma.backup.findUnique({ where: { id } });
    if (!backup) {
      throw new NotFoundException('Backup not found');
    }
    await this.prisma.backup.delete({ where: { id } });
    return { deleted: true };
  }
}
