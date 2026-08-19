import { Injectable } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePlatformConfigDto } from './dto/platform.dto';

const DEFAULT_PLATFORMS: Array<{ platform: Platform; displayName: string }> = [
  { platform: 'WEB', displayName: 'Website' },
  { platform: 'MOBILE', displayName: 'Mobile App' },
  { platform: 'DESKTOP', displayName: 'Desktop App' },
];

@Injectable()
export class PlatformsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ensures a config row exists for every known platform. */
  async ensureDefaults() {
    for (const def of DEFAULT_PLATFORMS) {
      await this.prisma.platformConfig.upsert({
        where: { platform: def.platform },
        update: {},
        create: def,
      });
    }
    return this.prisma.platformConfig.findMany({
      orderBy: { platform: 'asc' },
    });
  }

  async listAdmin() {
    return this.ensureDefaults();
  }

  /** Public health of each platform (for the public API consumers). */
  async listPublic() {
    await this.ensureDefaults();
    const rows = await this.prisma.platformConfig.findMany({
      orderBy: { platform: 'asc' },
    });
    return rows.map((r: any) => ({
      platform: r.platform,
      displayName: r.displayName,
      enabled: r.enabled,
      maintenanceMode: r.maintenanceMode,
      maintenanceMessage: r.maintenanceMessage,
      minVersion: r.minVersion,
      latestVersion: r.latestVersion,
      downloadUrl: r.downloadUrl,
    }));
  }

  async update(platform: Platform, dto: UpdatePlatformConfigDto) {
    await this.ensureDefaults();
    return this.prisma.platformConfig.update({
      where: { platform },
      data: dto,
    });
  }
}
