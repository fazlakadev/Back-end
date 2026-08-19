import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AppVersionResponse } from './dto/app-version-response.dto';

interface GitHubRelease {
  tag_name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    content_type: string;
  }>;
}

@Injectable()
export class AppVersionService {
  private readonly logger = new Logger(AppVersionService.name);
  private readonly GITHUB_API_URL = 'https://api.github.com/repos/fazlakadev/Android/releases/latest';
  private readonly CACHE_KEY = 'app:version:latest';
  private readonly CACHE_TTL = 300;

  constructor(
    private readonly cache: RedisCacheService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly webhooks: WebhooksService,
  ) {}

  async getLatestVersion(): Promise<AppVersionResponse> {
    return this.cache.getOrSet(
      this.CACHE_KEY,
      () => this.fetchAndStore(),
      this.CACHE_TTL,
    );
  }

  async getVersionForClient(clientVersion?: string): Promise<AppVersionResponse & { needsUpdate: boolean; forceUpdate: boolean }> {
    const version = await this.getLatestVersion();

    const mobileConfig = await this.prisma.platformConfig.findUnique({
      where: { platform: 'MOBILE' as never },
    });

    const minVersion = version.minVersion ?? mobileConfig?.minVersion ?? null;
    const forceUpdate = version.forceUpdate ?? mobileConfig?.forceUpdate ?? false;
    const needsUpdate = clientVersion
      ? this.isNewerVersion(version.version, clientVersion)
      : false;

    return {
      ...version,
      needsUpdate,
      forceUpdate: forceUpdate && needsUpdate,
    };
  }

  async handleGitHubWebhook(payload: {
    action?: string;
    release?: GitHubRelease;
    zen?: string;
  }): Promise<{ received: boolean; version?: string }> {
    if (payload.zen) {
      this.logger.log('GitHub webhook ping received');
      return { received: true };
    }

    if (payload.action !== 'published' || !payload.release) {
      return { received: false };
    }

    const release = payload.release;
    const apkAsset = release.assets.find(
      (a) =>
        a.name.endsWith('.apk') ||
        a.content_type === 'application/vnd.android.package-archive',
    );

    if (!apkAsset) {
      this.logger.warn(`Release ${release.tag_name} has no APK asset`);
      return { received: false };
    }

    const versionData: AppVersionResponse = {
      version: release.tag_name.replace(/^v/, ''),
      tagName: release.tag_name,
      releaseNotes: release.body || '',
      downloadUrl: apkAsset.browser_download_url,
      publishedAt: release.published_at,
      htmlUrl: release.html_url,
    };

    await this.cache.del(this.CACHE_KEY);

    await this.prisma.platformConfig.upsert({
      where: { platform: 'MOBILE' as never },
      update: {
        latestVersion: versionData.version,
        downloadUrl: versionData.downloadUrl,
      },
      create: {
        platform: 'MOBILE' as never,
        displayName: 'Android',
        latestVersion: versionData.version,
        downloadUrl: versionData.downloadUrl,
      },
    });

    try {
      await this.webhooks.send('app.version.updated', {
        version: versionData.version,
        tagName: versionData.tagName,
        publishedAt: versionData.publishedAt,
        downloadUrl: versionData.downloadUrl,
        htmlUrl: versionData.htmlUrl,
        releaseNotes: versionData.releaseNotes.slice(0, 500),
      });
    } catch (err) {
      this.logger.error('Failed to fire app.version.updated webhook', err as Error);
    }

    this.logger.log(`New release processed: ${release.tag_name}`);
    return { received: true, version: versionData.version };
  }

  private async fetchAndStore(): Promise<AppVersionResponse> {
    const version = await this.fetchFromGitHub();

    await this.prisma.platformConfig.upsert({
      where: { platform: 'MOBILE' as never },
      update: {
        latestVersion: version.version,
        downloadUrl: version.downloadUrl,
      },
      create: {
        platform: 'MOBILE' as never,
        displayName: 'Android',
        latestVersion: version.version,
        downloadUrl: version.downloadUrl,
      },
    });

    const mobileConfig = await this.prisma.platformConfig.findUnique({
      where: { platform: 'MOBILE' as never },
    });

    return {
      ...version,
      minVersion: mobileConfig?.minVersion ?? null,
      forceUpdate: mobileConfig?.forceUpdate ?? false,
      forceUpdateMessage: mobileConfig?.forceUpdateMessage ?? null,
    };
  }

  private async fetchFromGitHub(): Promise<AppVersionResponse> {
    const githubToken = this.config.get<string>('GITHUB_TOKEN');
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'fazlaka-api',
    };
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }
    const response = await fetch(this.GITHUB_API_URL, { headers });

    if (!response.ok) {
      this.logger.error(`GitHub API error: ${response.status} ${response.statusText}`);
      throw new NotFoundException('Failed to fetch latest app version');
    }

    const release: GitHubRelease = await response.json() as GitHubRelease;

    const apkAsset = release.assets.find(
      (asset) =>
        asset.name.endsWith('.apk') ||
        asset.content_type === 'application/vnd.android.package-archive',
    );

    const downloadUrl = apkAsset
      ? apkAsset.browser_download_url
      : release.html_url;

    return {
      version: release.tag_name.replace(/^v/, ''),
      tagName: release.tag_name,
      releaseNotes: release.body || '',
      downloadUrl,
      publishedAt: release.published_at,
      htmlUrl: release.html_url,
    };
  }

  async forceRefresh(): Promise<AppVersionResponse> {
    await this.cache.del(this.CACHE_KEY);
    const version = await this.fetchAndStore();
    await this.cache.set(this.CACHE_KEY, version, this.CACHE_TTL);
    return version;
  }

  async updatePlatformSettings(data: {
    minVersion?: string;
    forceUpdate?: boolean;
    forceUpdateMessage?: string;
    downloadUrl?: string;
  }): Promise<void> {
    await this.prisma.platformConfig.upsert({
      where: { platform: 'MOBILE' as never },
      update: data,
      create: {
        platform: 'MOBILE' as never,
        displayName: 'Android',
        ...data,
      },
    });
    await this.cache.del(this.CACHE_KEY);
  }

  async getPlatformSettings() {
    return this.prisma.platformConfig.findUnique({
      where: { platform: 'MOBILE' as never },
    });
  }

  private isNewerVersion(remote: string, local: string): boolean {
    const remoteParts = remote.split('.').map(Number);
    const localParts = local.split('.').map(Number);
    const maxSize = Math.max(remoteParts.length, localParts.length);
    for (let i = 0; i < maxSize; i++) {
      const r = remoteParts[i] ?? 0;
      const l = localParts[i] ?? 0;
      if (r > l) return true;
      if (r < l) return false;
    }
    return false;
  }
}
