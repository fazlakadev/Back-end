import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminRank } from '@prisma/client';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GeoService } from '../common/geo/geo.service';
import { MailService } from '../mail/mail.service';
import { AdminAuthEventsService } from './admin-events.service';
import * as i18nModule from 'nestjs-i18n';

const mockPrisma = {
  admin: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  adminRefreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  adminOtp: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue('jwt-token'),
  verifyAsync: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'adminJwt.secret') return 'test-secret';
    if (key === 'adminJwt.expiresIn') return '2h';
    if (key === 'adminJwt.refreshExpiresIn') return '7d';
    return undefined;
  }),
};

const mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
const mockGeo = {
  lookupIp: jest.fn().mockResolvedValue({
    country: 'US', countryCode: 'US', city: 'NYC', lat: 40.7, lng: -74.0,
  }),
  compareCoordinates: jest.fn().mockReturnValue(null),
};
const mockMail = {
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  sendAccountNotice: jest.fn().mockResolvedValue(undefined),
};
const mockAdminEvents = { record: jest.fn().mockResolvedValue(undefined) };

jest.spyOn(i18nModule.I18nContext, 'current').mockReturnValue({
  t: (key: string) => key,
  lang: 'en',
} as any);

const mockAdmin = {
  id: 'admin-1',
  username: 'superadmin',
  email: 'admin@test.com',
  displayName: 'Super Admin',
  avatarUrl: null,
  passwordHash: '$2a$10$hash',
  rank: AdminRank.SUPER_ADMIN,
  permissions: [],
  platforms: ['WEB'],
  isActive: true,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  lastLoginAt: null,
  lastLoginIp: null,
  lastLoginCountry: null,
  lastLoginCity: null,
  lastLoginLat: null,
  lastLoginLng: null,
  lastLoginDevice: null,
  lastLoginBrowser: null,
  lastLoginOs: null,
  failedLoginCount: 0,
  lockedUntil: null,
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(i18nModule.I18nContext, 'current').mockReturnValue({
      t: (key: string) => key,
      lang: 'en',
    } as any);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AuditService, useValue: mockAudit },
        { provide: GeoService, useValue: mockGeo },
        { provide: MailService, useValue: mockMail },
        { provide: AdminAuthEventsService, useValue: mockAdminEvents },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('sanitize', () => {
    it('should remove passwordHash and twoFactorSecret', () => {
      const result = service.sanitize(mockAdmin);
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('twoFactorSecret');
      expect(result.id).toBe('admin-1');
    });
  });

  describe('getMe', () => {
    it('should return sanitized admin', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(mockAdmin);

      const result = await service.getMe('admin-1');
      expect(result.id).toBe('admin-1');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw UnauthorizedException if not found', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(null);
      await expect(service.getMe('x')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('createAdmin', () => {
    it('should create admin when actor is SUPER_ADMIN', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(null);
      mockPrisma.admin.create.mockResolvedValue(mockAdmin);

      const result = await service.createAdmin(mockAdmin, {
        username: 'newadmin',
        password: 'Password123',
      });

      expect(result).not.toHaveProperty('passwordHash');
      expect(mockPrisma.admin.create).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when actor is not SUPER_ADMIN', async () => {
      const regularAdmin = { ...mockAdmin, rank: 'ADMIN' };
      await expect(
        service.createAdmin(regularAdmin, {
          username: 'newadmin',
          password: 'Password123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException for duplicate username', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createAdmin(mockAdmin, {
          username: 'existing',
          password: 'Password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for duplicate email', async () => {
      mockPrisma.admin.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing' });

      await expect(
        service.createAdmin(mockAdmin, {
          username: 'newadmin',
          password: 'Password123',
          email: 'taken@test.com',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listAdmins', () => {
    it('should return paginated admin list', async () => {
      mockPrisma.admin.findMany.mockResolvedValue([mockAdmin]);
      mockPrisma.admin.count.mockResolvedValue(1);

      const result = await service.listAdmins(mockAdmin, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should throw ForbiddenException for non-super admin', async () => {
      const regularAdmin = { ...mockAdmin, rank: 'ADMIN' };
      await expect(
        service.listAdmins(regularAdmin, 1, 20),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getAdmin', () => {
    it('should return admin by id', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(mockAdmin);

      const result = await service.getAdmin(mockAdmin, 'admin-1');
      expect(result.id).toBe('admin-1');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(null);
      await expect(
        service.getAdmin(mockAdmin, 'x'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateAdmin', () => {
    it('should update admin fields', async () => {
      mockPrisma.admin.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(null); // email check
      mockPrisma.admin.update.mockResolvedValue({ ...mockAdmin, displayName: 'New' });

      const result = await service.updateAdmin(mockAdmin, 'admin-1', {
        displayName: 'New',
      });

      expect(result.displayName).toBe('New');
    });

    it('should prevent self-deactivation', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(mockAdmin);

      await expect(
        service.updateAdmin(mockAdmin, 'admin-1', { isActive: false }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent self-rank-change', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(mockAdmin);

      await expect(
        service.updateAdmin(mockAdmin, 'admin-1', { rank: 'ADMIN' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if target not found', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(null);
      await expect(
        service.updateAdmin(mockAdmin, 'x', { displayName: 'n' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for duplicate email', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(mockAdmin);
      mockPrisma.admin.findFirst.mockResolvedValue({ id: 'other' });

      await expect(
        service.updateAdmin(mockAdmin, 'admin-1', { email: 'taken@test.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should revoke tokens when password is changed', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(mockAdmin);
      mockPrisma.admin.update.mockResolvedValue(mockAdmin);
      mockPrisma.adminRefreshToken.updateMany.mockResolvedValue({});

      await service.updateAdmin(mockAdmin, 'admin-1', { password: 'NewPass123' });

      expect(mockPrisma.adminRefreshToken.updateMany).toHaveBeenCalled();
    });
  });

  describe('removeAdmin', () => {
    it('should delete an admin', async () => {
      const target = { ...mockAdmin, id: 'target-1' };
      mockPrisma.admin.findUnique.mockResolvedValue(target);
      mockPrisma.admin.delete.mockResolvedValue({});

      const result = await service.removeAdmin(mockAdmin, 'target-1');
      expect(result).toEqual({ success: true });
    });

    it('should prevent self-deletion', async () => {
      await expect(
        service.removeAdmin(mockAdmin, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if target not found', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(null);
      await expect(
        service.removeAdmin(mockAdmin, 'x'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('changePassword', () => {
    it('should change password when current is valid', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('OldPass1', 10);
      mockPrisma.admin.findUnique.mockResolvedValue({
        ...mockAdmin,
        passwordHash: hash,
      });
      mockPrisma.admin.update.mockResolvedValue({});
      mockPrisma.adminRefreshToken.updateMany.mockResolvedValue({});

      const result = await service.changePassword('admin-1', {
        currentPassword: 'OldPass1',
        newPassword: 'NewPass123',
      });

      expect(result).toEqual({ success: true });
    });

    it('should throw UnauthorizedException if admin not found', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(null);
      await expect(
        service.changePassword('x', {
          currentPassword: 'old',
          newPassword: 'NewPass123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ConflictException for wrong current password', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({
        ...mockAdmin,
        passwordHash: '$2a$10$hash',
      });

      await expect(
        service.changePassword('admin-1', {
          currentPassword: 'WrongPass',
          newPassword: 'NewPass123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('logout', () => {
    it('should revoke refresh token', async () => {
      mockPrisma.adminRefreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        adminId: 'admin-1',
        revokedAt: null,
      });
      mockPrisma.adminRefreshToken.update.mockResolvedValue({});

      await service.logout('raw-token', {} as any);

      expect(mockPrisma.adminRefreshToken.update).toHaveBeenCalled();
    });

    it('should do nothing if token not found', async () => {
      mockPrisma.adminRefreshToken.findUnique.mockResolvedValue(null);

      await service.logout('nonexistent', {} as any);

      expect(mockPrisma.adminRefreshToken.update).not.toHaveBeenCalled();
    });

    it('should do nothing if token already revoked', async () => {
      mockPrisma.adminRefreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        revokedAt: new Date(),
      });

      await service.logout('raw-token', {} as any);

      expect(mockPrisma.adminRefreshToken.update).not.toHaveBeenCalled();
    });
  });
});
