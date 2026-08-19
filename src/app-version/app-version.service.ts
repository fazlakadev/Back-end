import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RedisCacheService } from '../common/cache/redis-cache.service';
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
  private readonly CACHE_TTL = 7200;

  constructor(private readonly cache: RedisCacheService) {}

  async getLatestVersion(): Promise<AppVersionResponse> {
    return this.cache.getOrSet(
      this.CACHE_KEY,
      () => this.fetchFromGitHub(),
      this.CACHE_TTL,
    );
  }

  private async fetchFromGitHub(): Promise<AppVersionResponse> {
    const response = await fetch(this.GITHUB_API_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'fazlaka-api',
      },
    });

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
    return this.getLatestVersion();
  }
}
