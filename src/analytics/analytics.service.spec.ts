import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: {
    count: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  article: { count: jest.fn() },
  episode: { count: jest.fn() },
  season: { count: jest.fn() },
  playlist: { count: jest.fn() },
  view: {
    count: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  like: { count: jest.fn() },
  comment: { count: jest.fn() },
  rating: {
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  report: {
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  authEvent: {
    count: jest.fn(),
    groupBy: jest.fn(),
    findMany: jest.fn(),
  },
  friend: { count: jest.fn() },
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);

    // Default mocks for dashboard
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.article.count.mockResolvedValue(0);
    mockPrisma.episode.count.mockResolvedValue(0);
    mockPrisma.season.count.mockResolvedValue(0);
    mockPrisma.playlist.count.mockResolvedValue(0);
    mockPrisma.view.count.mockResolvedValue(0);
    mockPrisma.like.count.mockResolvedValue(0);
    mockPrisma.comment.count.mockResolvedValue(0);
    mockPrisma.rating.count.mockResolvedValue(0);
    mockPrisma.user.groupBy.mockResolvedValue([]);
    mockPrisma.report.groupBy.mockResolvedValue([]);
  });

  describe('dashboard', () => {
    it('should return all dashboard stats', async () => {
      const result = await service.dashboard();

      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('activeUsers');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('social');
      expect(result).toHaveProperty('moderation');
      expect(result).toHaveProperty('trends');
      expect(result).toHaveProperty('contentByStatus');
    });

    it('should filter by platform when provided', async () => {
      await service.dashboard({ platform: 'mobile' });

      expect(mockPrisma.article.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { platform: 'MOBILE' } }),
      );
    });

    it('should not filter by platform when omitted', async () => {
      await service.dashboard();

      expect(mockPrisma.article.count).toHaveBeenCalledWith({ where: {} });
    });

    it('should reduce usersByStatus correctly', async () => {
      mockPrisma.user.groupBy.mockResolvedValue([
        { status: 'active', _count: 10 },
        { status: 'banned', _count: 2 },
      ]);

      const result = await service.dashboard();
      expect(result.usersByStatus).toEqual({ active: 10, banned: 2 });
    });

    it('should reduce reportsByStatus correctly', async () => {
      mockPrisma.report.groupBy.mockResolvedValue([
        { status: 'pending', _count: 5 },
      ]);

      const result = await service.dashboard();
      expect(result.moderation.reports).toEqual({ pending: 5 });
    });
  });

  describe('platformBreakdown', () => {
    it('should return breakdown with share percentages', async () => {
      mockPrisma.view.groupBy.mockResolvedValue([
        { platform: 'WEB', _count: { _all: 70 }, _sum: { durationSec: 1000 } },
        { platform: 'MOBILE', _count: { _all: 30 }, _sum: { durationSec: 500 } },
      ]);

      const result = await service.platformBreakdown({});

      expect(result.total).toBe(100);
      expect(result.breakdown).toHaveLength(2);
      expect(result.breakdown[0].share).toBe(70);
      expect(result.breakdown[1].share).toBe(30);
    });

    it('should handle zero total gracefully', async () => {
      mockPrisma.view.groupBy.mockResolvedValue([]);

      const result = await service.platformBreakdown({});

      expect(result.total).toBe(0);
      expect(result.breakdown).toEqual([]);
    });

    it('should default durationSec to 0', async () => {
      mockPrisma.view.groupBy.mockResolvedValue([
        { platform: 'WEB', _count: { _all: 10 }, _sum: { durationSec: null } },
      ]);

      const result = await service.platformBreakdown({});
      expect(result.breakdown[0].totalSeconds).toBe(0);
    });
  });

  describe('viewsOverTime', () => {
    it('should aggregate views by day and platform', async () => {
      const day1 = '2024-01-01';
      const day2 = '2024-01-02';
      mockPrisma.view.findMany.mockResolvedValue([
        { createdAt: new Date(day1), platform: 'WEB' },
        { createdAt: new Date(day1), platform: 'MOBILE' },
        { createdAt: new Date(day2), platform: 'WEB' },
      ]);

      const result = await service.viewsOverTime({});

      expect(result.total).toBe(3);
      expect(result.byDay[day1]).toBe(2);
      expect(result.byDay[day2]).toBe(1);
      expect(result.byPlatform.WEB[day1]).toBe(1);
      expect(result.byPlatform.MOBILE[day1]).toBe(1);
    });

    it('should return empty result for no views', async () => {
      mockPrisma.view.findMany.mockResolvedValue([]);

      const result = await service.viewsOverTime({});

      expect(result.total).toBe(0);
      expect(result.byDay).toEqual({});
    });
  });

  describe('topContent', () => {
    it('should return top content groups', async () => {
      const groups = [
        { contentType: 'EPISODE', contentId: 'e1', _count: { _all: 100 } },
      ];
      mockPrisma.view.groupBy.mockResolvedValue(groups);

      const result = await service.topContent({ limit: 5 });

      expect(result).toEqual(groups);
      expect(mockPrisma.view.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });

    it('should cap limit at 50', async () => {
      mockPrisma.view.groupBy.mockResolvedValue([]);

      await service.topContent({ limit: 999 });

      expect(mockPrisma.view.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('should default limit to 10', async () => {
      mockPrisma.view.groupBy.mockResolvedValue([]);

      await service.topContent({});

      expect(mockPrisma.view.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  describe('userGrowth', () => {
    it('should aggregate user signups by day', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { createdAt: new Date('2024-01-01') },
        { createdAt: new Date('2024-01-01') },
        { createdAt: new Date('2024-01-02') },
      ]);

      const result = await service.userGrowth({});

      expect(result.total).toBe(3);
      expect(result.byDay['2024-01-01']).toBe(2);
      expect(result.byDay['2024-01-02']).toBe(1);
    });
  });

  describe('contentEngagement', () => {
    it('should return likes, comments, and friend relationships', async () => {
      mockPrisma.like.count.mockResolvedValue(50);
      mockPrisma.comment.count.mockResolvedValue(30);
      mockPrisma.friend.count.mockResolvedValue(10);

      const result = await service.contentEngagement({});

      expect(result.likes).toBe(50);
      expect(result.comments).toBe(30);
      expect(result.newFriendRelationships).toBe(10);
    });
  });

  describe('authStats', () => {
    it('should return auth statistics with success rate', async () => {
      mockPrisma.authEvent.count
        .mockResolvedValueOnce(5)   // registrations
        .mockResolvedValueOnce(20)  // totalLogins
        .mockResolvedValueOnce(18)  // successfulLogins
        .mockResolvedValueOnce(2);  // failedLogins
      mockPrisma.authEvent.groupBy
        .mockResolvedValueOnce([])  // byEventType
        .mockResolvedValueOnce([])  // byPlatform
        .mockResolvedValueOnce([]); // byStatus
      mockPrisma.authEvent.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValueOnce(100); // totalUsers
      mockPrisma.user.count.mockResolvedValueOnce(50);  // activeUsers
      mockPrisma.user.count.mockResolvedValueOnce(3);   // lockedAccounts

      const result = await service.authStats({});

      expect(result.registrations).toBe(5);
      expect(result.logins).toBe(20);
      expect(result.successfulLogins).toBe(18);
      expect(result.failedLogins).toBe(2);
      expect(result.successRate).toBe(90);
      expect(result.totalUsers).toBe(100);
      expect(result.lockedAccounts).toBe(3);
    });

    it('should return 0 successRate when no events', async () => {
      mockPrisma.authEvent.count.mockResolvedValue(0);
      mockPrisma.authEvent.groupBy.mockResolvedValue([]);
      mockPrisma.authEvent.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      const result = await service.authStats({});

      expect(result.successRate).toBe(0);
    });
  });
});
