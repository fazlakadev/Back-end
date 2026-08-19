import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { generateSync } from 'otplib';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const BASE = '/api/v1';
const ADMIN_BASE = '/api/v1';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface AdminTokenPair {
  accessToken: string;
  refreshToken: string;
}

interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

function assertPaginatedResponse(body: any) {
  expect(body).toHaveProperty('data');
  expect(Array.isArray(body.data)).toBe(true);
  expect(body).toHaveProperty('meta');
  const meta: PaginatedMeta = body.meta;
  expect(typeof meta.page).toBe('number');
  expect(typeof meta.limit).toBe('number');
  expect(typeof meta.total).toBe('number');
  expect(typeof meta.totalPages).toBe('number');
  expect(typeof meta.hasNextPage).toBe('boolean');
  expect(typeof meta.hasPreviousPage).toBe('boolean');
}

describe('Fazlaka API — Full Integration Suite (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = Date.now().toString(36);
  const userEmail = `e2e_${suffix}@test.dev`;
  const userUsername = `e2e_${suffix}`;
  const userPassword = 'Passw0rd!';

  const adminEmail = `admin_e2e_${suffix}@test.dev`;
  const adminUsername = `admin_e2e_${suffix}`;
  const adminPassword = 'AdminPass1!';

  let userTokens: TokenPair = { accessToken: '', refreshToken: '' };
  let adminTokens: AdminTokenPair = { accessToken: '', refreshToken: '' };
  let createdSeasonId = '';
  let createdEpisodeId = '';
  let createdArticleSlug = '';
  let totpSecret = '';

  const registerUser = () =>
    request(app.getHttpServer())
      .post(`${BASE}/auth/register`)
      .send({
        email: userEmail,
        password: userPassword,
        name: 'E2E Test User',
        username: userUsername,
        locale: 'en',
      });

  const loginAdmin = async (): Promise<AdminTokenPair> => {
    // Register admin via direct DB insertion (admin registration
    // may not have a public endpoint; we seed via prisma instead)
    const bcrypt = await import('bcryptjs');
    const hashed = await bcrypt.hash(adminPassword, 10);
    const admin = await prisma.admin.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        passwordHash: hashed,
        displayName: 'E2E Admin',
        username: adminUsername,
        rank: 'SUPER_ADMIN',
        emailVerified: true,
        permissions: ['content:manage', 'users:manage', 'settings:manage', 'analytics:read', 'admins:manage'],
      },
    });

    const res = await request(app.getHttpServer())
      .post(`${ADMIN_BASE}/admin/login`)
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);

    return {
      accessToken: res.body.data.accessToken,
      refreshToken: res.body.data.refreshToken,
    };
  };

  // ──────────────────────────────────────────────
  //  Lifecycle
  // ──────────────────────────────────────────────
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    await app.init();
    prisma = app.get(PrismaService);
  }, 30_000);

  afterAll(async () => {
    // Cleanup test data
    if (createdSeasonId) {
      await prisma.seasonTranslation.deleteMany({ where: { seasonId: createdSeasonId } }).catch(() => {});
      await prisma.season.delete({ where: { id: createdSeasonId } }).catch(() => {});
    }
    if (createdEpisodeId) {
      await prisma.episodeTranslation.deleteMany({ where: { episodeId: createdEpisodeId } }).catch(() => {});
      await prisma.episode.delete({ where: { id: createdEpisodeId } }).catch(() => {});
    }
    if (createdArticleSlug) {
      const article = await prisma.article.findUnique({ where: { slug: createdArticleSlug } }).catch(() => null);
      if (article) {
        await prisma.articleTranslation.deleteMany({ where: { articleId: article.id } }).catch(() => {});
        await prisma.article.delete({ where: { id: article.id } }).catch(() => {});
      }
    }
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e_' } } }).catch(() => {});
    await prisma.admin.deleteMany({ where: { email: { startsWith: 'admin_e2e_' } } }).catch(() => {});
    await app.close();
  }, 30_000);

  // ════════════════════════════════════════════════
  //  1. Health
  // ════════════════════════════════════════════════
  describe('Health', () => {
    it('GET /health → 200 with status ok', () =>
      request(app.getHttpServer())
        .get(`${BASE}/health`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.status).toBe('ok');
          expect(res.body.data.info.database.status).toBe('up');
        }));
  });

  // ════════════════════════════════════════════════
  //  2. Authentication Flow
  // ════════════════════════════════════════════════
  describe('Authentication', () => {
    it('POST /auth/register → 201 with user data and tokens', async () => {
      const res = await registerUser().expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(userEmail);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      expect(res.body.data.user.twoFactorEnabled).toBe(false);
      expect(res.body.data.user.twoFactorSecret).toBeUndefined();
      userTokens.accessToken = res.body.data.accessToken;
      userTokens.refreshToken = res.body.data.refreshToken;
    });

    it('POST /auth/register with existing email → 409', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/auth/register`)
        .send({
          email: userEmail,
          password: userPassword,
          name: 'Duplicate',
          username: `dup_${suffix}`,
          locale: 'en',
        })
        .expect(409);
    });

    it('POST /auth/login → 201 with tokens', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: userEmail, password: userPassword })
        .expect(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      expect(res.body.data.requiresTwoFactor).toBeUndefined();
    });

    it('POST /auth/login with wrong password → 401', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: userEmail, password: 'WrongPassword1!' })
        .expect(401);
    });

    it('POST /auth/refresh → 200 new tokens', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .send({ refreshToken: userTokens.refreshToken })
        .expect(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      // Update stored tokens
      userTokens.accessToken = res.body.data.accessToken;
      userTokens.refreshToken = res.body.data.refreshToken;
    });

    it('POST /auth/refresh with invalid token → 401', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .send({ refreshToken: 'invalid-refresh-token-abc123' })
        .expect(401);
    });

    it('POST /auth/forgot-password → 200', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/auth/forgot-password`)
        .send({ email: userEmail })
        .expect(200);
    });

    it('GET /auth/me → 200 with valid JWT', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/auth/me`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .expect(200);
      expect(res.body.data.email).toBe(userEmail);
    });

    it('GET /auth/me → 401 without token', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/auth/me`)
        .expect(401);
    });

    it('GET /auth/me → 401 with invalid token', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/auth/me`)
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });

    it('GET /auth/sessions → 200 with sessions list', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/auth/sessions`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .set('x-refresh-token', userTokens.refreshToken)
        .expect(200);
      const sessions = res.body.data as Array<{ id: string; isCurrent: boolean }>;
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.some((s) => s.isCurrent)).toBe(true);
    });
  });

  // ════════════════════════════════════════════════
  //  3. TOTP Two-Factor Authentication
  // ════════════════════════════════════════════════
  describe('TOTP 2FA', () => {
    it('GET /auth/2fa/totp/setup → 200 with secret + QR', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/auth/2fa/totp/setup`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .expect(200);
      totpSecret = res.body.data.secret;
      expect(totpSecret).toBeTruthy();
      expect(res.body.data.otpauthUrl).toContain('otpauth://totp/');
      expect(res.body.data.qrDataUrl).toContain('data:image/png;base64,');
    });

    it('POST /auth/2fa/totp/enable with wrong code → 400', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/auth/2fa/totp/enable`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .send({ code: '000000' })
        .expect(400);
    });

    it('POST /auth/2fa/totp/enable with valid code → 200', async () => {
      const code = generateSync({ secret: totpSecret });
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/2fa/totp/enable`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .send({ code })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('Login requires 2FA step after enabling', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: userEmail, password: userPassword })
        .expect(200);
      expect(res.body.data.requiresTwoFactor).toBe(true);
      expect(res.body.data.method).toBe('APP');
      expect(res.body.data.accessToken).toBeUndefined();
    });

    it('POST /auth/login/2fa with TOTP → 200 with tokens', async () => {
      const code = generateSync({ secret: totpSecret });
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/login/2fa`)
        .send({ email: userEmail, otp: code })
        .expect(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      userTokens.accessToken = res.body.data.accessToken;
      userTokens.refreshToken = res.body.data.refreshToken;
    });

    it('POST /auth/2fa/totp/disable with valid code → 200', async () => {
      const code = generateSync({ secret: totpSecret });
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/2fa/totp/disable`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .send({ code })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('Login works directly after disabling 2FA', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: userEmail, password: userPassword })
        .expect(200);
      expect(res.body.data.requiresTwoFactor).toBeUndefined();
      expect(res.body.data.accessToken).toBeTruthy();
      userTokens.accessToken = res.body.data.accessToken;
      userTokens.refreshToken = res.body.data.refreshToken;
    });
  });

  // ════════════════════════════════════════════════
  //  4. Sessions & Logout
  // ════════════════════════════════════════════════
  describe('Sessions & Logout', () => {
    it('POST /auth/logout → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/logout`)
        .send({ refreshToken: userTokens.refreshToken })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /auth/refresh with revoked token → 401', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/auth/refresh`)
        .send({ refreshToken: userTokens.refreshToken })
        .expect(401);
    });

    it('GET /auth/sessions with revoked refresh → 401', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/auth/sessions`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .set('x-refresh-token', userTokens.refreshToken)
        .expect(401);
    });

    // Re-login for remaining tests
    it('Re-login to get fresh tokens', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/login`)
        .send({ email: userEmail, password: userPassword })
        .expect(200);
      userTokens.accessToken = res.body.data.accessToken;
      userTokens.refreshToken = res.body.data.refreshToken;
    });
  });

  // ════════════════════════════════════════════════
  //  5. Admin Login
  // ════════════════════════════════════════════════
  describe('Admin Authentication', () => {
    it('POST /admin/login → 200 with admin tokens', async () => {
      adminTokens = await loginAdmin();
      expect(adminTokens.accessToken).toBeTruthy();
      expect(adminTokens.refreshToken).toBeTruthy();
    });

    it('POST /admin/login with wrong password → 401', async () => {
      await request(app.getHttpServer())
        .post(`${ADMIN_BASE}/admin/login`)
        .send({ email: adminEmail, password: 'WrongAdminPass!' })
        .expect(401);
    });

    it('GET /admin/me → 200 with admin profile', async () => {
      const res = await request(app.getHttpServer())
        .get(`${ADMIN_BASE}/admin/me`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(200);
      expect(res.body.data.email).toBe(adminEmail);
      expect(res.body.data.role).toBe('SUPER_ADMIN');
    });

    it('POST /admin/refresh → 200 new tokens', async () => {
      const res = await request(app.getHttpServer())
        .post(`${ADMIN_BASE}/admin/refresh`)
        .send({ refreshToken: adminTokens.refreshToken })
        .expect(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      adminTokens.accessToken = res.body.data.accessToken;
      adminTokens.refreshToken = res.body.data.refreshToken;
    });

    it('GET /admin/me → 401 without token', async () => {
      await request(app.getHttpServer())
        .get(`${ADMIN_BASE}/admin/me`)
        .expect(401);
    });
  });

  // ════════════════════════════════════════════════
  //  6. Season CRUD (Admin)
  // ════════════════════════════════════════════════
  describe('Season CRUD (Admin)', () => {
    const seasonSlug = `e2e-season-${suffix}`;

    it('POST /seasons/admin → 201 create season', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/seasons/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({
          slug: seasonSlug,
          published: true,
          platform: 'WEB',
          translations: [
            { locale: 'ar', title: 'موسم الاختبار', description: 'وصف الموسم' },
            { locale: 'en', title: 'Test Season', description: 'Test season description' },
          ],
        })
        .expect(201);
      expect(res.body.data).toHaveProperty('id');
      createdSeasonId = res.body.data.id;
    });

    it('POST /seasons/admin without admin token → 401', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/seasons/admin`)
        .send({ slug: 'should-fail', translations: [{ locale: 'en', title: 'Fail' }] })
        .expect(401);
    });

    it('GET /seasons → 200 list with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/seasons`)
        .query({ locale: 'en', page: 1, limit: 5, platform: 'WEB' })
        .expect(200);
      assertPaginatedResponse(res.body);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(5);
    });

    it('GET /seasons/:idOrSlug → 200 get single season', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/seasons/${seasonSlug}`)
        .query({ locale: 'en' })
        .expect(200);
      expect(res.body.data).toHaveProperty('id', createdSeasonId);
    });

    it('GET /seasons/nonexistent-id → 404', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/seasons/nonexistent-slug-12345`)
        .expect(404);
    });

    it('PATCH /seasons/admin/:id → 200 update season', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${BASE}/seasons/admin/${createdSeasonId}`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({
          slug: `${seasonSlug}-updated`,
          translations: [
            { locale: 'ar', title: 'موسم محدث', description: 'تم التحديث' },
            { locale: 'en', title: 'Updated Season', description: 'Updated' },
          ],
        })
        .expect(200);
      expect(res.body.data.slug).toContain('updated');
    });

    it('GET /seasons/admin (admin list) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/seasons/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .query({ locale: 'en', page: 1, limit: 5 })
        .expect(200);
      assertPaginatedResponse(res.body);
    });

    it('DELETE /seasons/admin/:id → 200 delete season', async () => {
      const res = await request(app.getHttpServer())
        .delete(`${BASE}/seasons/admin/${createdSeasonId}`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      createdSeasonId = '';
    });
  });

  // ════════════════════════════════════════════════
  //  7. Episode CRUD (Admin)
  // ════════════════════════════════════════════════
  describe('Episode CRUD (Admin)', () => {
    const episodeSlug = `e2e-episode-${suffix}`;

    it('POST /episodes/admin → 201 create episode', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/episodes/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({
          slug: episodeSlug,
          published: true,
          platform: 'WEB',
          duration: 300,
          episodeNumber: 1,
          category: 'education',
          translations: [
            { locale: 'ar', title: 'حلقة الاختبار', description: 'وصف الحلقة' },
            { locale: 'en', title: 'Test Episode', description: 'Test episode description' },
          ],
        })
        .expect(201);
      expect(res.body.data).toHaveProperty('id');
      createdEpisodeId = res.body.data.id;
    });

    it('GET /episodes → 200 list episodes', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/episodes`)
        .query({ locale: 'en', page: 1, limit: 2, platform: 'WEB' })
        .expect(200);
      assertPaginatedResponse(res.body);
    });

    it('GET /episodes/:idOrSlug → 200 get episode', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/episodes/${episodeSlug}`)
        .query({ locale: 'en' })
        .expect(200);
      expect(res.body.data).toHaveProperty('id', createdEpisodeId);
    });

    it('GET /episodes/admin (admin list) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/episodes/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .query({ locale: 'en', page: 1, limit: 5 })
        .expect(200);
      assertPaginatedResponse(res.body);
    });

    it('PATCH /episodes/admin/:id → 200 update episode', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${BASE}/episodes/admin/${createdEpisodeId}`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({
          slug: `${episodeSlug}-updated`,
          duration: 600,
          translations: [
            { locale: 'ar', title: 'حلقة محدثة' },
            { locale: 'en', title: 'Updated Episode' },
          ],
        })
        .expect(200);
      expect(res.body.data.slug).toContain('updated');
    });

    it('DELETE /episodes/admin/:id → 200 delete episode', async () => {
      const res = await request(app.getHttpServer())
        .delete(`${BASE}/episodes/admin/${createdEpisodeId}`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      createdEpisodeId = '';
    });
  });

  // ════════════════════════════════════════════════
  //  8. Article CRUD (Admin)
  // ════════════════════════════════════════════════
  describe('Article CRUD (Admin)', () => {
    const articleSlug = `e2e-article-${suffix}`;

    it('POST /articles/admin → 201 create article', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/articles/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({
          slug: articleSlug,
          published: true,
          platform: 'WEB',
          category: 'education',
          translations: [
            {
              locale: 'ar',
              title: 'مقال الاختبار',
              body: 'محتوى المقال',
            },
            {
              locale: 'en',
              title: 'Test Article',
              body: 'Article body content',
            },
          ],
        })
        .expect(201);
      expect(res.body.data).toHaveProperty('id');
      createdArticleSlug = articleSlug;
    });

    it('GET /articles → 200 list articles', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/articles`)
        .query({ locale: 'en', page: 1, limit: 5, platform: 'WEB' })
        .expect(200);
      assertPaginatedResponse(res.body);
    });

    it('GET /articles/:idOrSlug → 200 get article', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/articles/${articleSlug}`)
        .query({ locale: 'en' })
        .expect(200);
      expect(res.body.data).toHaveProperty('slug', articleSlug);
    });

    it('GET /articles/admin (admin list) → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/articles/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .query({ locale: 'en', page: 1, limit: 5 })
        .expect(200);
      assertPaginatedResponse(res.body);
    });
  });

  // ════════════════════════════════════════════════
  //  9. Search
  // ════════════════════════════════════════════════
  describe('Search', () => {
    it('GET /search?q=test → 200 with results', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/search`)
        .query({ q: 'test', locale: 'en', page: 1, limit: 10 })
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /search with empty query → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/search`)
        .query({ q: '', locale: 'en' })
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /search/suggestions → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/search/suggestions`)
        .query({ q: 'test', locale: 'en', limit: 5 })
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /search/recommendations → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/search/recommendations`)
        .query({ locale: 'en', limit: 5 })
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  // ════════════════════════════════════════════════
  //  10. User Profile
  // ════════════════════════════════════════════════
  describe('User Profile', () => {
    it('GET /users/me → 200 get own profile', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/users/me`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .expect(200);
      expect(res.body.data.email).toBe(userEmail);
      expect(res.body.data).toHaveProperty('id');
    });

    it('GET /users/me → 401 without token', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/users/me`)
        .expect(401);
    });

    it('PATCH /users/me → 200 update profile', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${BASE}/users/me`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .send({ name: 'Updated E2E Name', bio: 'Updated bio for testing' })
        .expect(200);
      expect(res.body.data.name).toBe('Updated E2E Name');
    });

    it('GET /users/me/preferences → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/users/me/preferences`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('PATCH /users/me/preferences → 200 update preferences', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/users/me/preferences`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .send({ locale: 'en', darkMode: true })
        .expect(200);
    });

    it('POST /users/me/avatar → 200 upload avatar (mock file)', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/users/me/avatar`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .attach('file', Buffer.from('fake-image-data'), {
          filename: 'test-avatar.png',
          contentType: 'image/png',
        })
        .expect(201);
      expect(res.body).toHaveProperty('data');
    });

    it('POST /users/me/banner → 200 upload banner (mock file)', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/users/me/banner`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .attach('file', Buffer.from('fake-banner-data'), {
          filename: 'test-banner.png',
          contentType: 'image/png',
        })
        .expect(201);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /users/profile/:identifier → 200 public profile', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/users/profile/${userUsername}`)
        .expect(200);
      expect(res.body.data).toHaveProperty('username', userUsername);
    });

    it('GET /users/me/notifications → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/users/me/notifications`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /users/me/referrals → 200', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/users/me/referrals`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .expect(200);
    });

    it('POST /users/me/onboarded → 200', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/users/me/onboarded`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .expect(200);
    });
  });

  // ════════════════════════════════════════════════
  //  11. Admin Dashboard & Users
  // ════════════════════════════════════════════════
  describe('Admin Dashboard', () => {
    it('GET /analytics/dashboard → 200 stats', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/analytics/dashboard`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /analytics/dashboard → 401 without admin token', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/analytics/dashboard`)
        .expect(401);
    });

    it('GET /users/admin → 200 user list with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/users/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .query({ page: 1, limit: 5 })
        .expect(200);
      assertPaginatedResponse(res.body);
    });

    it('GET /users/admin with search query → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/users/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .query({ q: 'e2e', page: 1, limit: 5 })
        .expect(200);
      assertPaginatedResponse(res.body);
    });
  });

  // ════════════════════════════════════════════════
  //  12. Settings
  // ════════════════════════════════════════════════
  describe('Settings', () => {
    it('GET /settings/public → 200 public settings', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/settings/public`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /settings/admin → 200 admin settings', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/settings/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /settings/admin → 401 without admin token', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/settings/admin`)
        .expect(401);
    });
  });

  // ════════════════════════════════════════════════
  //  13. Pagination
  // ════════════════════════════════════════════════
  describe('Pagination', () => {
    it('GET /seasons with page=2&limit=3 returns correct meta', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/seasons`)
        .query({ locale: 'en', page: 2, limit: 3 })
        .expect(200);
      assertPaginatedResponse(res.body);
      expect(res.body.meta.page).toBe(2);
      expect(res.body.meta.limit).toBe(3);
    });

    it('GET /episodes with page=1&limit=2 returns correct meta', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/episodes`)
        .query({ locale: 'en', page: 1, limit: 2 })
        .expect(200);
      assertPaginatedResponse(res.body);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(2);
    });

    it('GET /articles with page=1&limit=4 returns correct meta', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/articles`)
        .query({ locale: 'en', page: 1, limit: 4 })
        .expect(200);
      assertPaginatedResponse(res.body);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(4);
    });

    it('Admin pagination: GET /users/admin page=1 limit=2', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/users/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .query({ page: 1, limit: 2 })
        .expect(200);
      assertPaginatedResponse(res.body);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(2);
    });
  });

  // ════════════════════════════════════════════════
  //  14. Error Handling
  // ════════════════════════════════════════════════
  describe('Error Handling', () => {
    it('GET /seasons/nonexistent-slug → 404', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/seasons/nonexistent-slug-xyz`)
        .expect(404);
    });

    it('GET /episodes/nonexistent-slug → 404', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/episodes/nonexistent-slug-xyz`)
        .expect(404);
    });

    it('GET /articles/nonexistent-slug → 404', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/articles/nonexistent-slug-xyz`)
        .expect(404);
    });

    it('POST /auth/register with missing fields → 400', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/auth/register`)
        .send({ email: 'partial@test.dev' })
        .expect(400);
    });

    it('POST /auth/register with invalid email → 400', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/auth/register`)
        .send({ email: 'not-an-email', password: 'Pass1!', name: 'Test', username: 'test', locale: 'en' })
        .expect(400);
    });

    it('POST /seasons/admin without admin token → 401', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/seasons/admin`)
        .send({ slug: 'unauth', translations: [{ locale: 'en', title: 'Nope' }] })
        .expect(401);
    });

    it('POST /seasons/admin with user token → 403 (non-admin)', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/seasons/admin`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .send({ slug: 'user-attempt', translations: [{ locale: 'en', title: 'Nope' }] })
        .expect(403);
    });

    it('GET /admin/me with user token → 401', async () => {
      await request(app.getHttpServer())
        .get(`${ADMIN_BASE}/admin/me`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .expect(401);
    });

    it('GET /users/me → 401 with invalid token format', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/users/me`)
        .set('Authorization', 'Bearer ')
        .expect(401);
    });
  });

  // ════════════════════════════════════════════════
  //  15. Rate Limiting
  // ════════════════════════════════════════════════
  describe('Rate Limiting', () => {
    it('Throttles after 120 requests to /auth/login (expects 429)', async () => {
      // The global throttle is 120/min. We send 125 requests in parallel.
      // At least some should be rejected with 429.
      const batchSize = 130;
      const promises = Array.from({ length: batchSize }, () =>
        request(app.getHttpServer())
          .post(`${BASE}/auth/login`)
          .send({ email: 'rate-limit-test@test.dev', password: 'any' }),
      );

      const results = await Promise.all(promises);
      const statusCounts = results.reduce(
        (acc, r) => {
          acc[r.status] = (acc[r.status] || 0) + 1;
          return acc;
        },
        {} as Record<number, number>,
      );

      // Expect at least one 429 response
      expect(statusCounts[429]).toBeGreaterThan(0);
      // Expect some 401s (valid endpoint, wrong credentials)
      expect(statusCounts[401]).toBeGreaterThan(0);
    }, 30_000);
  });

  // ════════════════════════════════════════════════
  //  16. Admin Content Listings
  // ════════════════════════════════════════════════
  describe('Admin Content Listings', () => {
    it('GET /seasons/admin → 200 (admin content)', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/seasons/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .query({ page: 1, limit: 5 })
        .expect(200);
      assertPaginatedResponse(res.body);
    });

    it('GET /episodes/admin → 200 (admin content)', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/episodes/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .query({ page: 1, limit: 5 })
        .expect(200);
      assertPaginatedResponse(res.body);
    });

    it('GET /articles/admin → 200 (admin content)', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/articles/admin`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .query({ page: 1, limit: 5 })
        .expect(200);
      assertPaginatedResponse(res.body);
    });

    it('GET /admin/admins → 200 admin list', async () => {
      const res = await request(app.getHttpServer())
        .get(`${ADMIN_BASE}/admin/admins`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .query({ page: 1, limit: 5 })
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  // ════════════════════════════════════════════════
  //  17. Admin Security Log
  // ════════════════════════════════════════════════
  describe('Admin Security Log', () => {
    it('GET /admin/security-log → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`${ADMIN_BASE}/admin/security-log`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  // ════════════════════════════════════════════════
  //  18. Public Episodes (no auth required)
  // ════════════════════════════════════════════════
  describe('Public Episodes', () => {
    it('GET /episodes (public) → 200 without auth', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/episodes`)
        .query({ locale: 'en', limit: 2, platform: 'WEB' })
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ════════════════════════════════════════════════
  //  19. Account Deactivation
  // ════════════════════════════════════════════════
  describe('Account Deactivation', () => {
    let freshTokens: TokenPair;

    beforeAll(async () => {
      // Register a throwaway user for deactivation test
      const suffix2 = `deact_${Date.now().toString(36)}`;
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/register`)
        .send({
          email: `deact_${suffix2}@test.dev`,
          password: 'Passw0rd!',
          name: 'Deactivate Me',
          username: `deact_${suffix2}`,
          locale: 'en',
        })
        .expect(201);
      freshTokens = {
        accessToken: res.body.data.accessToken,
        refreshToken: res.body.data.refreshToken,
      };
    });

    it('DELETE /users/me → 200 deactivate account', async () => {
      const res = await request(app.getHttpServer())
        .delete(`${BASE}/users/me`)
        .set('Authorization', `Bearer ${freshTokens.accessToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /users/me → 401 after deactivation', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/users/me`)
        .set('Authorization', `Bearer ${freshTokens.accessToken}`)
        .expect(401);
    });
  });

  // ════════════════════════════════════════════════
  //  20. User Search & Admin User Management
  // ════════════════════════════════════════════════
  describe('User Search & Admin User Management', () => {
    let targetUserId = '';

    beforeAll(async () => {
      // Find the test user ID
      const u = await prisma.user.findUnique({ where: { email: userEmail } });
      targetUserId = u?.id || '';
    });

    it('GET /users/search?q=e2e → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/users/search`)
        .set('Authorization', `Bearer ${userTokens.accessToken}`)
        .query({ q: 'e2e', page: 1, limit: 5 })
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /users/admin/:id → 200 admin get user', async () => {
      if (!targetUserId) return;
      const res = await request(app.getHttpServer())
        .get(`${BASE}/users/admin/${targetUserId}`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(200);
      expect(res.body.data).toHaveProperty('id', targetUserId);
    });

    it('GET /users/admin/:id/activity → 200', async () => {
      if (!targetUserId) return;
      const res = await request(app.getHttpServer())
        .get(`${BASE}/users/admin/${targetUserId}/activity`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });
  });
});
