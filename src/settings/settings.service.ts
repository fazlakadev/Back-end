import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingDto } from './dto/setting.dto';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async publicSettings() {
    const rows = await this.prisma.siteSetting.findMany({
      where: { isPublic: true },
    });
    const map = this.toFlatMap(rows);
    // Expose realtime (Pusher) connectivity settings so mobile clients can
    // establish a live connection without shipping credentials in the APK.
    const pusherKey = this.config.get<string>('pusher.appKey');
    const pusherCluster = this.config.get<string>('pusher.cluster') || 'eu';
    const useTls = this.config.get<boolean>('pusher.useTLS') ?? true;
    if (pusherKey) {
      map['pusherKey'] = pusherKey;
      map['pusherCluster'] = pusherCluster;
      map['pusherUseTLS'] = useTls;
    }
    return map;
  }

  async adminSettings() {
    const rows = await this.prisma.siteSetting.findMany({
      orderBy: { key: 'asc' },
    });
    return rows;
  }

  private toFlatMap(
    rows: Array<{ key: string; value: string | null; valueJson: unknown }>,
  ) {
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      out[r.key] = r.valueJson ?? r.value ?? '';
    }
    return out;
  }

  async update(key: string, dto: UpdateSettingDto, adminId?: string) {
    const existing = await this.prisma.siteSetting.findUnique({
      where: { key },
    });
    if (!existing) {
      throw new NotFoundException(`Setting '${key}' not found`);
    }
    const data: Prisma.SiteSettingUpdateInput = {
      value: dto.value !== undefined ? dto.value : existing.value,
      isPublic: dto.isPublic !== undefined ? dto.isPublic : existing.isPublic,
      description:
        dto.description !== undefined ? dto.description : existing.description,
      updatedBy: adminId ?? existing.updatedBy,
    };
    if (dto.valueJson !== undefined) {
      data.valueJson = dto.valueJson as Prisma.InputJsonValue;
    }
    return this.prisma.siteSetting.update({ where: { key }, data });
  }

  async bulkUpdate(values: Record<string, UpdateSettingDto>, adminId?: string) {
    const updated: string[] = [];
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      this.logger.warn('bulkUpdate called without a values object');
      return { updated };
    }
    for (const [key, dto] of Object.entries(values)) {
      try {
        await this.update(key, dto, adminId);
        updated.push(key);
      } catch (e) {
        this.logger.warn(
          `bulkUpdate skipped '${key}': ${(e as Error).message}`,
        );
      }
    }
    return { updated };
  }
}
