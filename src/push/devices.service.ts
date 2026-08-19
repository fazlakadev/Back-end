import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(
    userId: string,
    token: string,
    meta: {
      platform: string;
      userAgent?: string;
      deviceName?: string;
      os?: string;
      appVersion?: string;
    },
  ) {
    const existing = await this.prisma.deviceToken.findUnique({
      where: { token },
    });

    if (existing) {
      if (existing.userId === userId) {
        return this.prisma.deviceToken.update({
          where: { id: existing.id },
          data: {
            platform: meta.platform,
            userAgent: meta.userAgent ?? existing.userAgent,
            deviceName: meta.deviceName ?? existing.deviceName,
            os: meta.os ?? existing.os,
            appVersion: meta.appVersion ?? existing.appVersion,
            updatedAt: new Date(),
          },
        });
      }
      // Token belongs to another user — reassign
      await this.prisma.deviceToken.delete({ where: { id: existing.id } });
    }

    return this.prisma.deviceToken.create({
      data: {
        userId,
        token,
        platform: meta.platform,
        userAgent: meta.userAgent,
        deviceName: meta.deviceName,
        os: meta.os,
        appVersion: meta.appVersion,
      },
    });
  }

  async unregister(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({
      where: { token, userId },
    });
    return { success: true };
  }

  async unregisterAll(userId: string) {
    const { count } = await this.prisma.deviceToken.deleteMany({
      where: { userId },
    });
    return { success: true, removed: count };
  }

  async list(userId: string) {
    return this.prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        platform: true,
        deviceName: true,
        os: true,
        appVersion: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getTokensForUser(userId: string): Promise<string[]> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    return tokens.map((t: { token: string }) => t.token);
  }

  async removeStaleTokens(tokens: string[]) {
    if (tokens.length === 0) return;
    await this.prisma.deviceToken.deleteMany({
      where: { token: { in: tokens } },
    });
    this.logger.log(`Removed ${tokens.length} stale FCM tokens`);
  }

  async getStats() {
    const [total, byPlatform, uniqueUsers] = await Promise.all([
      this.prisma.deviceToken.count(),
      this.prisma.deviceToken.groupBy({
        by: ['platform'],
        _count: { id: true },
      }),
      this.prisma.deviceToken.findMany({
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    const platformMap: Record<string, number> = {};
    for (const row of byPlatform) {
      platformMap[row.platform] = row._count.id;
    }

    return {
      total,
      uniqueUsers: uniqueUsers.length,
      byPlatform: platformMap,
    };
  }
}
