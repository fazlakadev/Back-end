import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AppVersionService } from './app-version.service';
import { RedisCacheService } from '../common/cache/redis-cache.service';

describe('AppVersionService', () => {
  let service: AppVersionService;
  let cache: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    getOrSet: jest.Mock;
  };

  const mockVersionResponse = {
    version: '1.2.0',
    tagName: 'v1.2.0',
    releaseNotes: 'Bug fixes',
    downloadUrl: 'https://github.com/fazlakadev/Android/releases/download/v1.2.0/app.apk',
    publishedAt: '2026-01-15T10:00:00Z',
    htmlUrl: 'https://github.com/fazlakadev/Android/releases/tag/v1.2.0',
  };

  const mockGitHubRelease = {
    tag_name: 'v1.2.0',
    body: 'Bug fixes',
    published_at: '2026-01-15T10:00:00Z',
    html_url: 'https://github.com/fazlakadev/Android/releases/tag/v1.2.0',
    assets: [
      {
        name: 'app-release.apk',
        browser_download_url: 'https://github.com/fazlakadev/Android/releases/download/v1.2.0/app.apk',
        content_type: 'application/vnd.android.package-archive',
      },
    ],
  };

  beforeEach(async () => {
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      getOrSet: jest.fn().mockImplementation((_key, factory, _ttl) => factory()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppVersionService,
        { provide: RedisCacheService, useValue: cache },
      ],
    }).compile();

    service = module.get(AppVersionService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLatestVersion', () => {
    it('should return cached data on subsequent calls', async () => {
      cache.getOrSet.mockResolvedValue(mockVersionResponse);

      const result = await service.getLatestVersion();

      expect(result).toEqual(mockVersionResponse);
      expect(cache.getOrSet).toHaveBeenCalledWith(
        'app:version:latest',
        expect.any(Function),
        7200,
      );
    });

    it('should strip v prefix from tag_name', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockGitHubRelease,
      });

      cache.getOrSet.mockImplementation(async (_key, factory) => factory());

      const result = await service.getLatestVersion();

      expect(result.version).toBe('1.2.0');
      expect(result.tagName).toBe('v1.2.0');
    });

    it('should extract APK download URL from assets', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockGitHubRelease,
      });

      cache.getOrSet.mockImplementation(async (_key, factory) => factory());

      const result = await service.getLatestVersion();

      expect(result.downloadUrl).toBe(
        'https://github.com/fazlakadev/Android/releases/download/v1.2.0/app.apk',
      );
    });

    it('should fall back to html_url if no APK asset found', async () => {
      const releaseWithoutApk = {
        ...mockGitHubRelease,
        assets: [
          {
            name: 'source.zip',
            browser_download_url: 'https://example.com/source.zip',
            content_type: 'application/zip',
          },
        ],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => releaseWithoutApk,
      });

      cache.getOrSet.mockImplementation(async (_key, factory) => factory());

      const result = await service.getLatestVersion();

      expect(result.downloadUrl).toBe(mockGitHubRelease.html_url);
    });

    it('should handle GitHub API errors gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'rate limit exceeded',
      });

      cache.getOrSet.mockImplementation(async (_key, factory) => factory());

      await expect(service.getLatestVersion()).rejects.toThrow(NotFoundException);
    });

    it('should handle empty release body', async () => {
      const releaseWithEmptyBody = { ...mockGitHubRelease, body: '' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => releaseWithEmptyBody,
      });

      cache.getOrSet.mockImplementation(async (_key, factory) => factory());

      const result = await service.getLatestVersion();

      expect(result.releaseNotes).toBe('');
    });
  });

  describe('forceRefresh', () => {
    it('should clear cache and fetch fresh data', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockGitHubRelease,
      });

      cache.getOrSet.mockImplementation(async (_key, factory) => factory());

      await service.forceRefresh();

      expect(cache.del).toHaveBeenCalledWith('app:version:latest');
    });
  });
});
