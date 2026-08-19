import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter } as any);

  const username = process.env.ADMIN_DEFAULT_USERNAME || 'superadmin';
  const password = process.env.ADMIN_DEFAULT_PASSWORD || 'Super@2026';
  const email =
    process.env.ADMIN_DEFAULT_EMAIL || 'aly.safwat.mohamed@gmail.com';
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.admin.upsert({
    where: { username },
    update: { email },
    create: {
      username,
      email,
      displayName: 'Super Admin',
      passwordHash,
      rank: 'SUPER_ADMIN',
      permissions: ['*'],
      platforms: ['WEB', 'MOBILE', 'DESKTOP'],
      isActive: true,
    },
  });

  console.log('Seeded super admin:', admin.username);

  const platformDefaults: Array<{
    platform: 'WEB' | 'MOBILE' | 'DESKTOP';
    displayName: string;
  }> = [
    { platform: 'WEB', displayName: 'Website' },
    { platform: 'MOBILE', displayName: 'Mobile App' },
    { platform: 'DESKTOP', displayName: 'Desktop App' },
  ];

  for (const p of platformDefaults) {
    await prisma.platformConfig.upsert({
      where: { platform: p.platform },
      update: { displayName: p.displayName },
      create: { platform: p.platform, displayName: p.displayName },
    });
  }
  console.log('Seeded platform configs');

  const settings: Array<{
    key: string;
    value: string;
    description: string;
    isPublic: boolean;
  }> = [
    { key: 'appName', value: 'Fazlaka', description: 'Application name', isPublic: true },
    { key: 'appTagline', value: 'Learn. Watch. Grow.', description: 'Short tagline', isPublic: true },
    { key: 'contactEmail', value: 'support@fazlaka.app', description: 'Support email', isPublic: true },
    { key: 'maintenanceMode', value: 'false', description: 'Global maintenance mode', isPublic: true },
    { key: 'maintenanceMessage', value: '', description: 'Maintenance message', isPublic: true },
    { key: 'socialX', value: '', description: 'X/Twitter handle', isPublic: true },
    { key: 'socialInstagram', value: '', description: 'Instagram handle', isPublic: true },
    { key: 'socialTiktok', value: '', description: 'TikTok handle', isPublic: true },
    { key: 'socialYoutube', value: '', description: 'YouTube channel', isPublic: true },
    { key: 'websiteUrl', value: 'http://localhost:3002', description: 'Public website URL', isPublic: false },
    { key: 'apiBaseUrl', value: 'http://localhost:3001/api/v1', description: 'Public API base URL', isPublic: false },
  ];

  for (const s of settings) {
    await prisma.siteSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, isPublic: s.isPublic },
      create: s,
    });
  }
  console.log('Seeded site settings');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
