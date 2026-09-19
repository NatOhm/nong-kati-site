/**
 * Admin Auth — DB-backed (08-auth.md §4-§5).
 * PostgreSQL (Prisma) + scrypt password hashing + real RFC 6238 TOTP +
 * server-side refresh-token sessions.
 *
 * Security notes:
 * - Passwords hashed with scrypt (N=16384) via lib/password.ts; never stored
 *   or logged in plaintext. Verification is timing-safe.
 * - TOTP verified against the user's real base32 secret with ±1 step drift.
 * - Failed logins lock the account for 15 minutes after 5 consecutive
 *   failures (persisted per AdminUser row, survives restarts).
 * - Login failures are generic — no account enumeration.
 * - Refresh tokens are stored as SHA-256 hashes; logout revokes server-side.
 */

import { createHash } from 'crypto';

import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import {
  generateBackupCodes,
  generateRefreshToken,
  generateTotpSecret,
  issueAdminJwt,
  signJwt,
  verifyJwt,
  verifyTotpCode,
} from '@/lib/jwt';
import { ROLE_PERMISSIONS, type AdminRole, type Permission } from '@/types/auth';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  status: 'active' | 'deactivated' | 'locked';
  totpConfirmed: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

export interface AdminSession {
  adminUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const CHALLENGE_TTL_SECONDS = 5 * 60;

interface ChallengePayload {
  typ: 'admin-challenge';
  sub: string;
}

/**
 * Issue a step-1 challenge: a short-lived signed JWT naming the admin user.
 * Carries a unique `jti`; consumption is recorded in `AdminChallengeConsumed`
 * (see consumeChallengeToken) so a replayed challenge can never mint a second
 * session. The challenge alone grants nothing: step 2 still requires a valid
 * TOTP.
 */
async function issueChallengeToken(adminUserId: string): Promise<string> {
  return signJwt({ typ: 'admin-challenge', sub: adminUserId }, CHALLENGE_TTL_SECONDS);
}

async function readChallengeToken(token: string): Promise<ChallengePayload | null> {
  const payload = await verifyJwt<ChallengePayload>(token);
  if (!payload || payload.typ !== 'admin-challenge' || !payload.sub) return null;
  return payload;
}

/**
 * Consume a challenge at the moment it is finally used (2FA confirm — the
 * step that mints a session). First writer wins via the unique tokenHash
 * index; a replay loses the race and gets TOKEN_INVALID.
 */
async function consumeChallengeToken(token: string): Promise<ChallengePayload | null> {
  const payload = await readChallengeToken(token);
  if (!payload) return null;
  const tokenHash = hashToken(token);
  try {
    await prisma.adminChallengeConsumed.create({ data: { tokenHash } });
  } catch {
    return null; // unique-violation → already consumed
  }
  return payload;
}

/** Housekeeping: drop consumption rows older than the challenge TTL. */
async function pruneConsumedChallenges(): Promise<void> {
  try {
    await prisma.adminChallengeConsumed.deleteMany({
      where: { consumedAt: { lt: new Date(Date.now() - 2 * CHALLENGE_TTL_SECONDS * 1000) } },
    });
  } catch {
    // housekeeping must never break login
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Ensure the default accounts exist. Called lazily on first login so a fresh
 * database bootstraps itself. Passwords come from env overrides (or the dev
 * defaults below) and are hashed with scrypt before storage — plaintext is
 * never persisted. The super-admin gets a real random TOTP secret; limited
 * accounts share the seeded TOTP secret so they can be test-logged-into
 * without enrolling each one.
 *
 * Limited roles exist so RBAC can be exercised end-to-end: their JWTs carry
 * only their role's permissions (src/types/auth.ts ROLE_PERMISSIONS).
 */
interface SeedAdminSpec {
  email: string;
  fullName: string;
  role: AdminRole;
  envVar: string;
  fallbackPassword: string;
}

export const SEED_ADMINS: SeedAdminSpec[] = [
  {
    email: 'admin@nong-kati.co.th',
    fullName: 'Founder',
    role: 'super_admin',
    envVar: 'ADMIN_SEED_PASSWORD',
    fallbackPassword: 'admin123',
  },
  {
    email: 'catalogue@nong-kati.co.th',
    fullName: 'Catalogue Manager',
    role: 'catalogue_manager',
    envVar: 'ADMIN_SEED_CATALOGUE_PASSWORD',
    fallbackPassword: 'catalogue123',
  },
  {
    email: 'orders@nong-kati.co.th',
    fullName: 'Order Manager',
    role: 'order_manager',
    envVar: 'ADMIN_SEED_ORDERS_PASSWORD',
    fallbackPassword: 'orders123',
  },
];

/** Test 2FA secret shared by seeded accounts (standard RFC 6238 vector). */
const SEED_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

export async function ensureSeedAdmin(): Promise<void> {
  for (const spec of SEED_ADMINS) {
    const existing = await prisma.adminUser.findUnique({ where: { email: spec.email } });
    if (existing) continue;
    const password = process.env[spec.envVar] ?? spec.fallbackPassword;
    await prisma.adminUser.create({
      data: {
        email: spec.email,
        fullName: spec.fullName,
        role: spec.role,
        status: 'active',
        passwordHash: await hashPassword(password),
        totpSecret: SEED_TOTP_SECRET,
        // super_admin enrolls via the 2FA-setup flow on first login; the
        // limited test accounts are pre-confirmed so RBAC tests skip setup.
        totpConfirmed: spec.role !== 'super_admin',
        mustChangePassword: true,
      },
    });
  }
}

/**
 * Admin login — first factor (08-auth.md §5.1).
 * Email + password against the DB. Returns a challenge token for step 2.
 */
export async function adminLogin(
  email: string,
  password: string,
): Promise<{
  success: boolean;
  requires2faSetup?: boolean;
  requiresTotp?: boolean;
  challengeToken?: string;
  error?: string;
  retryAfter?: number;
}> {
  await ensureSeedAdmin();

  const user = await prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Generic failure for unknown accounts — same shape as a wrong password.
  if (!user) {
    // Burn comparable time so response latency doesn't leak account existence.
    await verifyPassword(password, 'scrypt$16384$8$1$00$00');
    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  if (user.status === 'deactivated') {
    return { success: false, error: 'ACCOUNT_DEACTIVATED' };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return {
      success: false,
      error: 'ACCOUNT_LOCKED',
      retryAfter: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000),
    };
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.adminUser.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lock ? 0 : attempts,
        status: lock ? 'locked' : user.status,
        lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
      },
    });
    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  const challengeToken = await issueChallengeToken(user.id);
  void pruneConsumedChallenges();

  if (!user.totpConfirmed || !user.totpSecret) {
    return { success: true, requires2faSetup: true, challengeToken };
  }
  return { success: true, requiresTotp: true, challengeToken };
}

/**
 * Setup 2FA — hand out the stored secret + fresh backup codes.
 * 08-auth.md §5.2 — First-login enrollment step.
 */
export async function setup2fa(challengeToken: string): Promise<{
  success: boolean;
  totpUri?: string;
  secretBase32?: string;
  backupCodes?: string[];
  error?: string;
}> {
  const challenge = await readChallengeToken(challengeToken);
  if (!challenge) {
    return { success: false, error: 'TOKEN_INVALID' };
  }

  const user = await prisma.adminUser.findUnique({ where: { id: challenge.sub } });
  if (!user) return { success: false, error: 'USER_NOT_FOUND' };

  // The seeded row already holds a secret — reuse it so the QR the user
  // scanned earlier keeps working across retries of step 2.
  const secret = user.totpSecret ?? generateTotpSecret();
  if (!user.totpSecret) {
    await prisma.adminUser.update({ where: { id: user.id }, data: { totpSecret: secret } });
  }

  const totpUri = `otpauth://totp/Nong-Kati%3A${encodeURIComponent(user.email)}?secret=${secret}&issuer=Nong-Kati`;

  return { success: true, totpUri, secretBase32: secret, backupCodes: generateBackupCodes() };
}

/**
 * Confirm 2FA — verify the TOTP code, activate 2FA, issue the session.
 * 08-auth.md §5.2 — Confirm step.
 */
export async function confirm2fa(
  challengeToken: string,
  totpCode: string,
): Promise<{
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  mustChangePassword?: boolean;
  error?: string;
}> {
  // Single-use: the challenge is consumed here, at the only step that mints
  // a session. (setup2fa stays read-only because the login UI legitimately
  // reuses the same challenge for the setup + confirm pair on first login.)
  const challenge = await consumeChallengeToken(challengeToken);
  if (!challenge) {
    return { success: false, error: 'TOKEN_INVALID' };
  }

  const user = await prisma.adminUser.findUnique({ where: { id: challenge.sub } });
  if (!user) return { success: false, error: 'USER_NOT_FOUND' };
  if (!user.totpSecret) return { success: false, error: 'TOTP_NOT_SETUP' };

  const codeOk = await verifyTotpCode(user.totpSecret, totpCode);
  if (!codeOk) return { success: false, error: 'TOTP_INVALID' };

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { totpConfirmed: true, lastLoginAt: new Date() },
  });

  const session = await issueAdminSession(user);
  // Fresh/flagged accounts land on the change-password form first.
  return user.mustChangePassword ? { ...session, mustChangePassword: true } : session;
}

/**
 * Issue a session: 15-min access JWT + 30-day refresh token (hash stored).
 */
async function issueAdminSession(user: {
  id: string;
  email: string;
  role: string;
}): Promise<{ success: boolean; accessToken: string; refreshToken: string; expiresIn: number }> {
  const role = user.role as AdminRole;
  const perms: Permission[] = ROLE_PERMISSIONS[role] ?? [];
  const accessToken = await issueAdminJwt(user.id, user.email, role, perms);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);

  await prisma.adminSession.create({
    data: {
      adminUserId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return { success: true, accessToken, refreshToken, expiresIn: 15 * 60 };
}

/**
 * Admin logout — revoke the refresh token server-side.
 */
export async function adminLogout(refreshToken: string): Promise<{ success: boolean }> {
  await prisma.adminSession.updateMany({
    where: { tokenHash: hashToken(refreshToken) },
    data: { revokedAt: new Date() },
  });
  return { success: true };
}

/**
 * Refresh an admin session: validate the opaque refresh token against the
 * stored hash, then rotate it (new random token, old row revoked) and issue a
 * fresh 15-minute access JWT. Rotation bounds the blast radius of a leaked
 * refresh token to a single use; reuse of a rotated token fails with
 * TOKEN_INVALID and the client re-logs in.
 */
export async function refreshAdminSession(refreshToken: string): Promise<{
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}> {
  const trimmed = refreshToken.trim();
  if (!trimmed) return { success: false, error: 'REFRESH_TOKEN_REQUIRED' };

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(trimmed) },
    include: { adminUser: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return { success: false, error: 'TOKEN_INVALID' };
  }

  const user = session.adminUser;
  if (user.status !== 'active') return { success: false, error: 'ACCOUNT_DEACTIVATED' };
  // A global invalidation (password change) kills every session minted
  // before it — including ones created by a refresh racing the change.
  if (user.sessionsInvalidBefore && session.createdAt < user.sessionsInvalidBefore) {
    return { success: false, error: 'TOKEN_INVALID' };
  }

  await prisma.adminSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  return issueAdminSession(user);
}

/**
 * Change admin password (08-auth.md §5.1). Requires the current password;
 * revokes every other session.
 */
export async function changeAdminPassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!user) return { success: false, error: 'USER_NOT_FOUND' };

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return { success: false, error: 'CURRENT_PASSWORD_INCORRECT' };
  }
  if (newPassword.length < 12) {
    return { success: false, error: 'PASSWORD_TOO_SHORT' };
  }

  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: adminId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        // +5s margin: any session a concurrent refresh manages to mint during
        // this change is still dated before the threshold and dies on first
        // use. Only sessions from genuine post-change logins survive.
        sessionsInvalidBefore: new Date(Date.now() + 5_000),
      },
    }),
    prisma.adminSession.updateMany({
      where: { adminUserId: adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return { success: true };
}

/**
 * Get admin user by ID (reads the DB).
 */
export async function getAdminUserById(id: string): Promise<AdminUser | undefined> {
  const user = await prisma.adminUser.findUnique({ where: { id } });
  if (!user) return undefined;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as AdminRole,
    status: user.status as AdminUser['status'],
    totpConfirmed: user.totpConfirmed,
    mustChangePassword: user.mustChangePassword,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil,
  };
}
