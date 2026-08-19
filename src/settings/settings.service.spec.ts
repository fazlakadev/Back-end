import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  siteSetting: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockConfig = {
  get: jest.fn(),
};

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  describe('publicSettings', () => {
    it('should return public settings as a flat map', async () => {
      mockPrisma.siteSetting.findMany.mockResolvedValue([
        { key: 'siteName', value: 'Fazlaka', valueJson: null },
        { key: 'theme', value: null, valueJson: { primary: '#000' } },
      ]);
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'pusher.appKey') return 'my-key';
        if (key === 'pusher.cluster') return 'us2';
        if (key === 'pusher.useTLS') return true;
        return undefined;
      });

      const result = await service.publicSettings();

      expect(result.siteName).toBe('Fazlaka');
      expect(result.theme).toEqual({ primary: '#000' });
      expect(result.pusherKey).toBe('my-key');
      expect(result.pusherCluster).toBe('us2');
      expect(result.pusherUseTLS).toBe(true);
    });

    it('should not include pusher keys when pusher.appKey is not set', async () => {
      mockPrisma.siteSetting.findMany.mockResolvedValue([]);
      mockConfig.get.mockReturnValue(undefined);

      const result = await service.publicSettings();

      expect(result.pusherKey).toBeUndefined();
    });

    it('should default pusher cluster to eu', async () => {
      mockPrisma.siteSetting.findMany.mockResolvedValue([]);
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'pusher.appKey') return 'key';
        if (key === 'pusher.cluster') return undefined;
        return undefined;
      });

      const result = await service.publicSettings();
      expect(result.pusherCluster).toBe('eu');
    });

    it('should prefer valueJson over value', async () => {
      mockPrisma.siteSetting.findMany.mockResolvedValue([
        { key: 'logo', value: 'old', valueJson: { url: 'new.png' } },
      ]);
      mockConfig.get.mockReturnValue(undefined);

      const result = await service.publicSettings();
      expect(result.logo).toEqual({ url: 'new.png' });
    });

    it('should default to empty string when both value and valueJson are null', async () => {
      mockPrisma.siteSetting.findMany.mockResolvedValue([
        { key: 'footer', value: null, valueJson: null },
      ]);
      mockConfig.get.mockReturnValue(undefined);

      const result = await service.publicSettings();
      expect(result.footer).toBe('');
    });
  });

  describe('adminSettings', () => {
    it('should return all settings ordered by key', async () => {
      const rows = [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ];
      mockPrisma.siteSetting.findMany.mockResolvedValue(rows);

      const result = await service.adminSettings();

      expect(result).toEqual(rows);
      expect(mockPrisma.siteSetting.findMany).toHaveBeenCalledWith({
        orderBy: { key: 'asc' },
      });
    });
  });

  describe('update', () => {
    it('should update an existing setting', async () => {
      const existing = { key: 'siteName', value: 'old', isPublic: true, description: 'old desc' };
      mockPrisma.siteSetting.findUnique.mockResolvedValue(existing);
      mockPrisma.siteSetting.update.mockResolvedValue({
        ...existing,
        value: 'new',
      });

      const result = await service.update('siteName', { value: 'new' }, 'admin-1');

      expect(result.value).toBe('new');
      expect(mockPrisma.siteSetting.update).toHaveBeenCalledWith({
        where: { key: 'siteName' },
        data: expect.objectContaining({ value: 'new', updatedBy: 'admin-1' }),
      });
    });

    it('should throw NotFoundException for non-existent key', async () => {
      mockPrisma.siteSetting.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { value: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should preserve existing values when dto fields are undefined', async () => {
      const existing = { key: 'k', value: 'old', isPublic: true, description: 'desc', updatedBy: null };
      mockPrisma.siteSetting.findUnique.mockResolvedValue(existing);
      mockPrisma.siteSetting.update.mockResolvedValue(existing);

      await service.update('k', {}, 'admin-1');

      expect(mockPrisma.siteSetting.update).toHaveBeenCalledWith({
        where: { key: 'k' },
        data: expect.objectContaining({
          value: 'old',
          isPublic: true,
          description: 'desc',
        }),
      });
    });

    it('should update valueJson when provided', async () => {
      const existing = { key: 'k', value: null, isPublic: false, description: null, updatedBy: null };
      mockPrisma.siteSetting.findUnique.mockResolvedValue(existing);
      mockPrisma.siteSetting.update.mockResolvedValue(existing);

      await service.update('k', { valueJson: { nested: true } });

      expect(mockPrisma.siteSetting.update).toHaveBeenCalledWith({
        where: { key: 'k' },
        data: expect.objectContaining({ valueJson: { nested: true } }),
      });
    });
  });

  describe('bulkUpdate', () => {
    it('should update multiple settings', async () => {
      const existing = { key: 'k', value: 'old', isPublic: true, description: null, updatedBy: null };
      mockPrisma.siteSetting.findUnique.mockResolvedValue(existing);
      mockPrisma.siteSetting.update.mockResolvedValue(existing);

      const result = await service.bulkUpdate(
        { a: { value: '1' }, b: { value: '2' } },
        'admin-1',
      );

      expect(result.updated).toContain('a');
      expect(result.updated).toContain('b');
    });

    it('should skip settings that throw NotFoundException', async () => {
      mockPrisma.siteSetting.findUnique
        .mockResolvedValueOnce({ key: 'ok', value: 'v', isPublic: true, description: null, updatedBy: null })
        .mockResolvedValueOnce(null);
      mockPrisma.siteSetting.update.mockResolvedValue({});

      const result = await service.bulkUpdate(
        { ok: { value: 'new' }, missing: { value: 'x' } },
      );

      expect(result.updated).toContain('ok');
      expect(result.updated).not.toContain('missing');
    });

    it('should return empty updated array for non-object input', async () => {
      const result = await service.bulkUpdate(null as any);
      expect(result.updated).toEqual([]);
    });

    it('should return empty updated array for array input', async () => {
      const result = await service.bulkUpdate([] as any);
      expect(result.updated).toEqual([]);
    });
  });
});
