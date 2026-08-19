import * as crypto from 'crypto';

export function slugify(input: string): string {
  return input
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w\u0600-\u06FF-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Opaque, unguessable public identifier for user profile URLs. URL-safe hex
 * (no dots/encoding issues), 96 bits of entropy, never derived from the DB id
 * or username so it cannot be guessed or enumerated.
 */
export function generatePublicId(): string {
  return crypto.randomBytes(12).toString('hex');
}

export function generateReferralCode(name: string): string {
  const base = slugify(name).replace(/-/g, '').slice(0, 6).toUpperCase();
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return (base || 'FAZ') + suffix;
}

export function hashIp(ip: string): string {
  return crypto
    .createHash('sha256')
    .update(String(ip))
    .digest('hex')
    .slice(0, 32);
}

interface AdminLike {
  isAdmin?: boolean;
  adminRank?: string;
  adminPermissions?: string[];
}

/**
 * True when the caller is an admin allowed to act (SUPER_ADMIN bypass, or the
 * permission is explicitly granted).
 */
export function adminCan(
  caller: AdminLike | undefined,
  permission: string,
): boolean {
  if (!caller?.isAdmin) return false;
  if (caller.adminRank === 'SUPER_ADMIN') return true;
  return (caller.adminPermissions ?? []).includes(permission);
}
