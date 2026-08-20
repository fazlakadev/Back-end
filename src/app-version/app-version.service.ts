import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { FirebaseService } from '../push/firebase.service';
import { DevicesService } from '../push/devices.service';
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
  private readonly GITHUB_REPOS: Record<string, { repo: string; platform: string; displayName: string }> = {
    'fazlakadev/Android': { repo: 'fazlakadev/Android', platform: 'MOBILE', displayName: 'Android' },
    'fazlakadev/Windows': { repo: 'fazlakadev/Windows', platform: 'WINDOWS', displayName: 'Windows' },
  };
  private readonly CACHE_TTL = 300;

  constructor(
    private readonly cache: RedisCacheService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly webhooks: WebhooksService,
    private readonly firebase: FirebaseService,
    private readonly devices: DevicesService,
  ) {}

  async getLatestVersion(platform: string = 'MOBILE'): Promise<AppVersionResponse> {
    const cacheKey = `app:version:latest:${platform}`;
    return this.cache.getOrSet(
      cacheKey,
      () => this.fetchAndStore(platform),
      this.CACHE_TTL,
    );
  }

  async getVersionForClient(
    clientVersion?: string,
    platform: string = 'MOBILE',
  ): Promise<AppVersionResponse & { needsUpdate: boolean; forceUpdate: boolean }> {
    const version = await this.getLatestVersion(platform);

    const platformConfig = await this.prisma.platformConfig.findUnique({
      where: { platform: platform as never },
    });

    const minVersion = version.minVersion ?? platformConfig?.minVersion ?? null;
    const forceUpdate = version.forceUpdate ?? platformConfig?.forceUpdate ?? false;
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
    repository?: { full_name?: string };
  }): Promise<{ received: boolean; version?: string }> {
    if (payload.zen) {
      this.logger.log('GitHub webhook ping received');
      return { received: true };
    }

    if (payload.action !== 'published' || !payload.release) {
      return { received: false };
    }

    const repoName = payload.repository?.full_name ?? 'fazlakadev/Android';
    const repoInfo = this.GITHUB_REPOS[repoName] ?? { repo: repoName, platform: 'MOBILE', displayName: 'Android' };
    const platform = repoInfo.platform;

    const release = payload.release;
    const isWindows = platform === 'WINDOWS';
    const asset = release.assets.find(
      (a) =>
        isWindows
          ? a.name.endsWith('.zip') || a.name.endsWith('.msix') || a.name.endsWith('.msi')
          : a.name.endsWith('.apk') ||
            a.content_type === 'application/vnd.android.package-archive',
    );

    if (!asset) {
      this.logger.warn(`Release ${release.tag_name} has no matching asset for platform ${platform}`);
      return { received: false };
    }

    const versionData: AppVersionResponse = {
      version: release.tag_name.replace(/^v/, ''),
      tagName: release.tag_name,
      releaseNotes: release.body || '',
      downloadUrl: asset.browser_download_url,
      publishedAt: release.published_at,
      htmlUrl: release.html_url,
    };

    const cacheKey = `app:version:latest:${platform}`;
    await this.cache.del(cacheKey);

    await this.prisma.platformConfig.upsert({
      where: { platform: platform as never },
      update: {
        latestVersion: versionData.version,
        downloadUrl: versionData.downloadUrl,
      },
      create: {
        platform: platform as never,
        displayName: repoInfo.displayName,
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

    if (platform === 'MOBILE') {
      this.sendUpdateNotification(versionData).catch((err) => {
        this.logger.error('Failed to send update push notifications', err as Error);
      });
    }

    this.logger.log(`New release processed: ${release.tag_name}`);
    return { received: true, version: versionData.version };
  }

  private async fetchAndStore(platform: string = 'MOBILE'): Promise<AppVersionResponse> {
    const repoInfo = Object.values(this.GITHUB_REPOS).find(r => r.platform === platform)
      ?? { repo: 'fazlakadev/Android', platform: 'MOBILE', displayName: 'Android' };
    const version = await this.fetchFromGitHub(repoInfo.repo);

    await this.prisma.platformConfig.upsert({
      where: { platform: platform as never },
      update: {
        latestVersion: version.version,
        downloadUrl: version.downloadUrl,
      },
      create: {
        platform: platform as never,
        displayName: repoInfo.displayName,
        latestVersion: version.version,
        downloadUrl: version.downloadUrl,
      },
    });

    const platformConfig = await this.prisma.platformConfig.findUnique({
      where: { platform: platform as never },
    });

    return {
      ...version,
      minVersion: platformConfig?.minVersion ?? null,
      forceUpdate: platformConfig?.forceUpdate ?? false,
      forceUpdateMessage: platformConfig?.forceUpdateMessage ?? null,
    };
  }

  private async fetchFromGitHub(repo: string = 'fazlakadev/Android'): Promise<AppVersionResponse> {
    const githubToken = this.config.get<string>('GITHUB_TOKEN');
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'fazlaka-api',
    };
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }
    const githubApiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    const response = await fetch(githubApiUrl, { headers });

    if (!response.ok) {
      this.logger.error(`GitHub API error: ${response.status} ${response.statusText}`);
      throw new NotFoundException('Failed to fetch latest app version');
    }

    const release: GitHubRelease = await response.json() as GitHubRelease;

    const isWindows = repo.includes('Windows');
    const downloadAsset = release.assets.find(
      (a) =>
        isWindows
          ? a.name.endsWith('.zip') || a.name.endsWith('.msix') || a.name.endsWith('.msi')
          : a.name.endsWith('.apk') ||
            a.content_type === 'application/vnd.android.package-archive',
    );

    const downloadUrl = downloadAsset
      ? downloadAsset.browser_download_url
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

  async forceRefresh(platform: string = 'MOBILE'): Promise<AppVersionResponse> {
    const cacheKey = `app:version:latest:${platform}`;
    await this.cache.del(cacheKey);
    const version = await this.fetchAndStore(platform);
    await this.cache.set(cacheKey, version, this.CACHE_TTL);
    return version;
  }

  async updatePlatformSettings(data: {
    minVersion?: string;
    forceUpdate?: boolean;
    forceUpdateMessage?: string;
    downloadUrl?: string;
  }, platform: string = 'MOBILE'): Promise<void> {
    await this.prisma.platformConfig.upsert({
      where: { platform: platform as never },
      update: data,
      create: {
        platform: platform as never,
        displayName: platform === 'WINDOWS' ? 'Windows' : 'Android',
        ...data,
      },
    });
    const cacheKey = `app:version:latest:${platform}`;
    await this.cache.del(cacheKey);
  }

  async getPlatformSettings(platform: string = 'MOBILE') {
    return this.prisma.platformConfig.findUnique({
      where: { platform: platform as never },
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

  private async sendUpdateNotification(versionData: AppVersionResponse) {
    if (!this.firebase.isInitialized) {
      this.logger.warn('Firebase not initialized — skipping update notification');
      return;
    }

    const allTokens = await this.devices.getAllTokens();
    if (allTokens.length === 0) {
      this.logger.log('No registered devices — skipping update notification');
      return;
    }

    const shortNotes = versionData.releaseNotes
      .replace(/#+\s*/g, '')
      .replace(/[*`_~>|-]/g, '')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 200);

    const { sent, failed } = await this.firebase.sendToUser(allTokens, {
      title: `فذلكة ${versionData.tagName} متاح!`,
      body: shortNotes || `تحديث جديد للتطبيق الإصدار ${versionData.version}`,
      imageUrl: undefined,
      clickAction: 'OPEN_UPDATE',
      data: {
        type: 'app_update',
        version: versionData.version,
        downloadUrl: versionData.downloadUrl,
        channelId: 'update_download',
      },
    });

    this.logger.log(`Update notification sent: ${sent}/${allTokens.length} devices`);

    if (failed.length > 0) {
      await this.devices.cleanupTokens(failed);
    }
  }
}
