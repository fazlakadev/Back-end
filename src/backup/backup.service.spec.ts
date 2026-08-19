import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BackupService } from './backup.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  backup: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  user: { findMany: jest.fn() },
  userPreference: { findMany: jest.fn() },
  banner: { findMany: jest.fn() },
  bannerTranslation: { findMany: jest.fn() },
  article: { findMany: jest.fn() },
  articleTranslation: { findMany: jest.fn() },
  season: { findMany: jest.fn() },
  seasonTranslation: { findMany: jest.fn() },
  episode: { findMany: jest.fn() },
  episodeTranslation: { findMany: jest.fn() },
  playlist: { findMany: jest.fn() },
  playlistTranslation: { findMany: jest.fn() },
  playlistItem: { findMany: jest.fn() },
  comment: { findMany: jest.fn() },
  like: { findMany: jest.fn() },
  view: { findMany: jest.fn() },
  friend: { findMany: jest.fn() },
  supportTicket: { findMany: jest.fn() },
  supportMessage: { findMany: jest.fn() },
  notification: { findMany: jest.fn() },
  mediaAsset: { findMany: jest.fn() },
  geolocation: { findMany: jest.fn() },
  refreshToken: { findMany: jest.fn() },
};

describe('BackupService', () => {
  let service: BackupService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default all findMany calls to return empty arrays
    for (const model of Object.values(mockPrisma)) {
      if (model && typeof model === 'object' && 'findMany' in model) {
        (model.findMany as jest.Mock).mockResolvedValue([]);
      }
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BackupService>(BackupService);
  });

  describe('exportData', () => {
    it('should export data from all models', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: '1' }]);
      mockPrisma.article.findMany.mockResolvedValue([{ id: 'a1' }]);
      mockPrisma.banner.findMany.mockResolvedValue([]);

      const result = await service.exportData();

      expect(result.manifest).toBeDefined();
      expect((result.manifest as any).app).toBe('fazlaka');
      expect(result.data.user).toEqual([{ id: '1' }]);
      expect(result.data.article).toEqual([{ id: 'a1' }]);
    });

    it('should include counts in manifest', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: '1' }, { id: '2' }]);
      mockPrisma.article.findMany.mockResolvedValue([]);

      const result = await service.exportData();
      expect((result.manifest as any).counts.user).toBe(2);
      expect((result.manifest as any).counts.article).toBe(0);
    });

    it('should return empty arrays for models with no data', async () => {
      const result = await service.exportData();
      expect(result.data.user).toEqual([]);
    });
  });

  describe('importData', () => {
    it('should throw BadRequestException for invalid payload', async () => {
      await expect(service.importData(null as any)).rejects.toThrow(BadRequestException);
      await expect(service.importData({} as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-fazlaka backup', async () => {
      await expect(
        service.importData({
          manifest: { app: 'other' },
          data: {},
        }),
      ).rejects.toThrow('Not a Fazlaka backup');
    });

    it('should import valid data', async () => {
      const createMany = jest.fn().mockResolvedValue({ count: 2 });
      mockPrisma.user = { findMany: jest.fn(), createMany, create: jest.fn() } as any;

      const result = await service.importData({
        manifest: { app: 'fazlaka' },
        data: { user: [{ id: 'u1' }, { id: 'u2' }] },
      });

      expect(result.imported.user).toBe(2);
    });

    it('should skip rows without valid id', async () => {
      const createMany = jest.fn().mockResolvedValue({ count: 1 });
      mockPrisma.user = { findMany: jest.fn(), createMany, create: jest.fn() } as any;

      const result = await service.importData({
        manifest: { app: 'fazlaka' },
        data: { user: [{ id: 'u1' }, { noId: true }] },
      });

      expect(result.imported.user).toBe(1);
    });

    it('should fall back to per-row create on createMany failure', async () => {
      const createMany = jest.fn().mockRejectedValue(new Error('FK violation'));
      const create = jest.fn().mockResolvedValue({ id: 'u1' });
      mockPrisma.user = { findMany: jest.fn(), createMany, create } as any;

      const result = await service.importData({
        manifest: { app: 'fazlaka' },
        data: { user: [{ id: 'u1' }] },
      });

      expect(create).toHaveBeenCalled();
      expect(result.imported.user).toBe(1);
    });

    it('should skip conflicting rows in fallback mode', async () => {
      const createMany = jest.fn().mockRejectedValue(new Error('conflict'));
      const create = jest.fn().mockRejectedValue(new Error('duplicate'));
      mockPrisma.user = { findMany: jest.fn(), createMany, create } as any;

      const result = await service.importData({
        manifest: { app: 'fazlaka' },
        data: { user: [{ id: 'u1' }] },
      });

      expect(result.imported.user).toBe(0);
    });
  });

  describe('list', () => {
    it('should return paginated backup list', async () => {
      const backups = [{ id: 'b1', fileName: 'test.json' }];
      mockPrisma.backup.findMany.mockResolvedValue(backups);
      mockPrisma.backup.count.mockResolvedValue(1);

      const result = await service.list(1, 20);

      expect(result.data).toEqual(backups);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should pass correct skip/take to prisma', async () => {
      mockPrisma.backup.findMany.mockResolvedValue([]);
      mockPrisma.backup.count.mockResolvedValue(0);

      await service.list(2, 10);

      expect(mockPrisma.backup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe('create', () => {
    it('should create a manual backup', async () => {
      const created = { id: 'b1', fileName: 'fazlaka-backup-2024.json', status: 'completed' };
      mockPrisma.backup.create.mockResolvedValue(created);

      const result = await service.create('admin-1');

      expect(mockPrisma.backup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'completed',
            type: 'manual',
            createdById: 'admin-1',
          }),
        }),
      );
      expect(result).toEqual(created);
    });
  });

  describe('remove', () => {
    it('should delete an existing backup', async () => {
      mockPrisma.backup.findUnique.mockResolvedValue({ id: 'b1' });
      mockPrisma.backup.delete.mockResolvedValue({});

      const result = await service.remove('b1');

      expect(result).toEqual({ deleted: true });
      expect(mockPrisma.backup.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    });

    it('should throw NotFoundException if backup not found', async () => {
      mockPrisma.backup.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleScheduledBackup', () => {
    it('should create a daily backup and prune old ones', async () => {
      jest.spyOn(service, 'exportData').mockResolvedValue({
        manifest: {},
        data: {},
      });
      mockPrisma.backup.findMany.mockResolvedValue([
        { id: 'old1' },
        { id: 'old2' },
      ]);
      mockPrisma.backup.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.backup.create.mockResolvedValue({});

      await service.handleScheduledBackup();

      expect(mockPrisma.backup.create).toHaveBeenCalled();
      expect(mockPrisma.backup.deleteMany).toHaveBeenCalled();
    });

    it('should not delete if fewer than 8 daily backups', async () => {
      jest.spyOn(service, 'exportData').mockResolvedValue({
        manifest: {},
        data: {},
      });
      mockPrisma.backup.findMany.mockResolvedValue([]);
      mockPrisma.backup.create.mockResolvedValue({});

      await service.handleScheduledBackup();

      expect(mockPrisma.backup.deleteMany).not.toHaveBeenCalled();
    });

    it('should not throw on exportData failure', async () => {
      jest.spyOn(service, 'exportData').mockRejectedValue(new Error('DB down'));

      await expect(service.handleScheduledBackup()).resolves.toBeUndefined();
    });
  });

  describe('getOne', () => {
    it('should return a backup by id', async () => {
      const backup = { id: 'b1', fileName: 'test.json' };
      mockPrisma.backup.findUnique.mockResolvedValue(backup);

      const result = await service.getOne('b1');
      expect(result).toEqual(backup);
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.backup.findUnique.mockResolvedValue(null);
      await expect(service.getOne('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('restore', () => {
    it('should restore from an existing backup', async () => {
      mockPrisma.backup.findUnique.mockResolvedValue({
        id: 'b1',
        data: { manifest: { app: 'fazlaka' }, data: { user: [] } },
      });
      mockPrisma.backup.update.mockResolvedValue({ id: 'b1', status: 'completed' });

      const result = await service.restore('b1', 'admin-1');
      expect(result.status).toBe('completed');
    });

    it('should throw NotFoundException if backup not found', async () => {
      mockPrisma.backup.findUnique.mockResolvedValue(null);
      await expect(service.restore('x', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if backup data is empty', async () => {
      mockPrisma.backup.findUnique.mockResolvedValue({ id: 'b1', data: null });
      await expect(service.restore('b1', 'admin-1')).rejects.toThrow(BadRequestException);
    });
  });
});
