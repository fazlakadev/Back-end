import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { VerificationService } from '../verification/verification.service';
import { AuthEventsService } from '../auth-events/auth-events.service';
import * as i18nModule from 'nestjs-i18n';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  userPreference: {
    upsert: jest.fn(),
  },
  geolocation: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  notification: {
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
  friend: { count: jest.fn() },
  rating: {
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  article: { count: jest.fn() },
  playlist: { count: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
  report: { findMany: jest.fn() },
  authEvent: { findMany: jest.fn() },
  view: { findMany: jest.fn() },
  comment: { findMany: jest.fn() },
  like: { findMany: jest.fn() },
  progress: { findMany: jest.fn() },
  verificationToken: { findFirst: jest.fn() },
};

const mockRealtime = { sendNotification: jest.fn().mockResolvedValue(undefined) };
const mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
const mockMail = {
  sendAccountNotice: jest.fn().mockResolvedValue(undefined),
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
};
const mockVerification = { issue: jest.fn() };
const mockAuthEvents = { record: jest.fn().mockResolvedValue(undefined) };
const mockConfig = { get: jest.fn() };

jest.spyOn(i18nModule.I18nContext, 'current').mockReturnValue({
  t: (key: string) => key,
  lang: 'en',
} as any);

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(i18nModule.I18nContext, 'current').mockReturnValue({
      t: (key: string) => key,
      lang: 'en',
    } as any);
    // Re-apply mock implementations after resetAllMocks
    mockRealtime.sendNotification.mockResolvedValue(undefined);
    mockAudit.record.mockResolvedValue(undefined);
    mockMail.sendAccountNotice.mockResolvedValue(undefined);
    mockMail.sendVerificationEmail.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: AuditService, useValue: mockAudit },
        { provide: MailService, useValue: mockMail },
        { provide: VerificationService, useValue: mockVerification },
        { provide: AuthEventsService, useValue: mockAuthEvents },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('getMe', () => {
    it('should return user without sensitive fields', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        passwordHash: 'secret',
        twoFactorSecret: 'totp',
        phone: '123',
        googleId: 'g1',
        githubId: null,
        facebookId: null,
        preference: { locale: 'en' },
      });

      const result = await service.getMe('u1');

      expect(result.id).toBe('u1');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('twoFactorSecret');
      expect(result.hasPassword).toBe(true);
      expect(result.phoneLinked).toBe(true);
      expect(result.googleLinked).toBe(true);
      expect(result.githubLinked).toBe(false);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getMe('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPublicProfile', () => {
    it('should return public profile with stats', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        publicId: 'pub1',
        name: 'Test',
        emailVerified: new Date(),
      });
      mockPrisma.friend.count.mockResolvedValue(5);
      mockPrisma.rating.count.mockResolvedValue(3);
      mockPrisma.article.count.mockResolvedValue(2);
      mockPrisma.playlist.count.mockResolvedValue(1);

      const result = await service.getPublicProfile('pub1');

      expect(result.id).toBe('u1');
      expect(result.verified).toBe(true);
      expect(result.stats.friendsCount).toBe(5);
      expect(result.stats.ratingsCount).toBe(3);
    });

    it('should set verified false when emailVerified is null', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        emailVerified: null,
      });
      mockPrisma.friend.count.mockResolvedValue(0);
      mockPrisma.rating.count.mockResolvedValue(0);
      mockPrisma.article.count.mockResolvedValue(0);
      mockPrisma.playlist.count.mockResolvedValue(0);

      const result = await service.getPublicProfile('u1');
      expect(result.verified).toBe(false);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.getPublicProfile('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('should update profile fields', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', name: 'New' });

      const result = await service.updateProfile('u1', { name: 'New' });
      expect(result.name).toBe('New');
    });

    it('should throw ConflictException for duplicate username', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'other' });

      await expect(
        service.updateProfile('u1', { username: 'taken' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow keeping same username', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', username: 'me' });

      const result = await service.updateProfile('u1', { username: 'me' });
      expect(result.username).toBe('me');
    });
  });

  describe('updatePreferences', () => {
    it('should upsert preferences', async () => {
      mockPrisma.userPreference.upsert.mockResolvedValue({ userId: 'u1', darkMode: true });

      const result = await service.updatePreferences('u1', { darkMode: true });
      expect(result.darkMode).toBe(true);
    });

    it('should update user locale when locale is in dto', async () => {
      mockPrisma.userPreference.upsert.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      await service.updatePreferences('u1', { locale: 'ar' as any });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { locale: 'ar' },
      });
    });
  });

  describe('setBanner', () => {
    it('should update bannerUrl', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', bannerUrl: 'url' });

      const result = await service.setBanner('u1', 'url');
      expect(result.bannerUrl).toBe('url');
    });
  });

  describe('setAvatar', () => {
    it('should update avatarUrl', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', avatarUrl: 'url' });

      const result = await service.setAvatar('u1', 'url');
      expect(result.avatarUrl).toBe('url');
    });
  });

  describe('heartbeat', () => {
    it('should update lastActiveAt and return success', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.heartbeat('u1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('deactivate', () => {
    it('should set status to deleted and revoke tokens', async () => {
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await service.deactivate('u1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { status: 'deleted' },
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled();
    });
  });

  describe('searchUsers', () => {
    it('should return paginated search results', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Test' }]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.searchUsers('test', 'current-u1', 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('adminList', () => {
    it('should return paginated admin list', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1', email: 'a@b.com' }]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.adminList(1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should apply status filter', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.adminList(1, 20, { status: 'banned' as any });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'banned' }),
        }),
      );
    });
  });

  describe('adminGet', () => {
    it('should return full user details for admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        passwordHash: 'secret',
        preference: {},
        _count: { playlists: 2, comments: 5, ratings: 3 },
      });
      mockPrisma.rating.aggregate.mockResolvedValue({ _avg: { value: 4.5 }, _count: 10 });
      mockPrisma.report.findMany.mockResolvedValue([]);

      const result = await service.adminGet('u1');

      expect(result.id).toBe('u1');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.stats.ratingAverage).toBe(4.5);
      expect(result.stats.ratingCount).toBe(10);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.adminGet('x')).rejects.toThrow(NotFoundException);
    });

    it('should handle null rating average', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        passwordHash: null,
        preference: {},
        _count: {},
      });
      mockPrisma.rating.aggregate.mockResolvedValue({ _avg: { value: null }, _count: 0 });
      mockPrisma.report.findMany.mockResolvedValue([]);

      const result = await service.adminGet('u1');
      expect(result.stats.ratingAverage).toBeNull();
    });
  });

  describe('adminUpdate', () => {
    it('should update user as admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        name: 'Updated',
        passwordHash: 'h',
      });

      const result = await service.adminUpdate('admin-1', 'u1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.adminUpdate('admin-1', 'x', { name: 'n' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for duplicate username', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'other' });

      await expect(
        service.adminUpdate('admin-1', 'u1', { username: 'taken' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'other' }); // email check

      await expect(
        service.adminUpdate('admin-1', 'u1', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('setStatus', () => {
    it('should update user status and record audit', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        status: 'active',
        email: 'a@b.com',
        name: 'User',
        locale: 'en',
        banReason: null,
        banExpiresAt: null,
        bannedAt: null,
      });
      mockPrisma.user.update.mockResolvedValue({ status: 'banned' });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({});

      const result = await service.setStatus('admin-1', 'u1', { status: 'banned' });

      expect(result.status).toBe('banned');
      expect(mockAudit.record).toHaveBeenCalled();
    });

    it('should revoke tokens when status is not active', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        status: 'active',
        email: null,
        banReason: null,
        banExpiresAt: null,
        bannedAt: null,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({});

      await service.setStatus('admin-1', 'u1', { status: 'suspended' });

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('should send unbanned email when going from banned to active', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        status: 'banned',
        email: 'a@b.com',
        name: 'User',
        locale: 'en',
        banReason: 'spam',
        banExpiresAt: null,
        bannedAt: new Date(),
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({});

      await service.setStatus('admin-1', 'u1', { status: 'active' });

      expect(mockMail.sendAccountNotice).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.setStatus('admin-1', 'x', { status: 'banned' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markOnboarded', () => {
    it('should set onboardedAt if user exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', onboardedAt: null });
      mockPrisma.user.update.mockResolvedValue({});

      await service.markOnboarded('u1');
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.markOnboarded('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createDefaultUsername', () => {
    it('should create username from email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createDefaultUsername('john@example.com');
      expect(result).toBe('john');
    });

    it('should append number if username exists', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: 'existing' })
        .mockResolvedValueOnce(null);

      const result = await service.createDefaultUsername('john@example.com');
      expect(result).toBe('john1');
    });
  });

  describe('createNotification', () => {
    it('should create and send notification', async () => {
      mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });

      const result = await service.createNotification({
        userId: 'u1',
        type: 'like',
        title: 'Title',
        body: 'Body',
      });

      expect(result.id).toBe('n1');
      expect(mockRealtime.sendNotification).toHaveBeenCalledWith('u1', result);
    });
  });

  describe('getNotifications', () => {
    it('should return paginated notifications', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([{ id: 'n1' }]);
      mockPrisma.notification.count.mockResolvedValue(1);

      const result = await service.getNotifications('u1', 1, 20);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('markAllNotificationsRead', () => {
    it('should update all unread notifications', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllNotificationsRead('u1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('clearNotifications', () => {
    it('should delete all user notifications', async () => {
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 10 });

      const result = await service.clearNotifications('u1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('saveGeolocation', () => {
    it('should create geolocation record', async () => {
      mockPrisma.geolocation.create.mockResolvedValue({ id: 'g1' });

      const result = await service.saveGeolocation(
        'u1',
        { location: { lat: 40.7, lng: -74.0 } } as any,
        { platform: 'WEB' } as any,
      );

      expect(result.id).toBe('g1');
    });
  });

  describe('getGeolocations', () => {
    it('should return geolocations for user', async () => {
      mockPrisma.geolocation.findMany.mockResolvedValue([{ id: 'g1' }]);

      const result = await service.getGeolocations('u1', 10);
      expect(result).toHaveLength(1);
    });

    it('should cap limit at 100', async () => {
      mockPrisma.geolocation.findMany.mockResolvedValue([]);

      await service.getGeolocations('u1', 999);

      expect(mockPrisma.geolocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });
});
