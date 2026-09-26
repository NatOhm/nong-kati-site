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

import QRCode from 'qrcode';

import { prisma } from '@/lib/db';
import { writeAuditLog } from '@/lib/auditLog';
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
  lastLoginAt: Date | null;
  activeSessions: number;
}

export interface AdminSession {
  adminUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

// ─── Runtime-tunable security policy (security settings group) ──────────
// The /management/settings security panel persists its values in the
// SiteSetting table (key 'security'); the helpers below read that group so
// the configured values are actually enforced — the panel is not decorative.

const SECURITY_DEFAULTS = {
  lockoutMaxAttempts: 5,
  lockoutMinutes: 15,
  passwordMinLength: 12,
  pwRequireUpper: true,
  pwRequireLower: true,
  pwRequireDigit: true,
  pwRequireSpecial: false,
};

export type SecurityPolicy = typeof SECURITY_DEFAULTS;

let securityPolicyCache: { value: SecurityPolicy; at: number } | null = null;
const SECURITY_POLICY_TTL_MS = 30_000;

/**
 * Effective security policy: SiteSetting('security') overlaid on defaults,
 * cached for 30s so the login hot path stays one query when unchanged.
 */
export async function getSecurityPolicy(): Promise<SecurityPolicy> {
  if (securityPolicyCache && Date.now() - securityPolicyCache.at < SECURITY_POLICY_TTL_MS) {
    return securityPolicyCache.value;
  }
  let value: SecurityPolicy = { ...SECURITY_DEFAULTS };
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: 'security' } });
    if (row) {
      const parsed: unknown = JSON.parse(row.value);
      if (typeof parsed === 'object' && parsed !== null) {
        const p = parsed as Record<string, unknown>;
        const num = (
          key: 'lockoutMaxAttempts' | 'lockoutMinutes' | 'passwordMinLength',
          min: number,
          max: number,
        ): number => {
          const v = p[key];
          return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
            ? v
            : value[key];
        };
        const bool = (key: keyof SecurityPolicy): boolean =>
          typeof p[key] === 'boolean' ? (p[key] as boolean) : (value[key] as boolean);
        value = {
          lockoutMaxAttempts: num('lockoutMaxAttempts', 3, 10),
          lockoutMinutes: num('lockoutMinutes', 5, 1440),
          passwordMinLength: num('passwordMinLength', 8, 64),
          pwRequireUpper: bool('pwRequireUpper'),
          pwRequireLower: bool('pwRequireLower'),
          pwRequireDigit: bool('pwRequireDigit'),
          pwRequireSpecial: bool('pwRequireSpecial'),
        };
      }
    }
  } catch {
    // Unreadable setting → defaults; brute-force protection never opens up.
  }
  securityPolicyCache = { value, at: Date.now() };
  return value;
}

/** Drop the cached policy — called right after the settings save. */
export function invalidateSecurityPolicyCache(): void {
  securityPolicyCache = null;
}

/**
 * Validate a new password against the configured policy.
 * Returns an error code, or null when the password passes.
 */
export async function checkPasswordPolicy(newPassword: string): Promise<string | null> {
  const policy = await getSecurityPolicy();
  if (newPassword.length < policy.passwordMinLength) return 'PASSWORD_TOO_SHORT';
  if (policy.pwRequireUpper && !/[A-Z]/.test(newPassword)) return 'PASSWORD_MISSING_UPPER';
  if (policy.pwRequireLower && !/[a-z]/.test(newPassword)) return 'PASSWORD_MISSING_LOWER';
  if (policy.pwRequireDigit && !/[0-9]/.test(newPassword)) return 'PASSWORD_MISSING_DIGIT';
  if (policy.pwRequireSpecial && !/[^A-Za-z0-9]/.test(newPassword))
    return 'PASSWORD_MISSING_SPECIAL';
  return null;
}
// Step-2 TOTP guessing: same 5-strike discipline as the password step, but a
// separate persistent counter so password failures never seed/burn it.
const ADMIN_TOTP_MAX_ATTEMPTS = 5;
const ADMIN_TOTP_LOCKOUT_MS = 15 * 60 * 1000;
const CHALLENGE_TTL_SECONDS = 5 * 60;

interface ChallengePayload {
  typ: 'admin-challenge';
  sub: string;
  /** Remember-me choice from step 1, carried to the session issuer. */
  rem?: boolean;
}

/**
 * Issue a step-1 challenge: a short-lived signed JWT naming the admin user.
 * Carries a unique `jti`; consumption is recorded in `AdminChallengeConsumed`
 * (see consumeChallengeToken) so a replayed challenge can never mint a second
 * session. The challenge alone grants nothing: step 2 still requires a valid
 * TOTP.
 */
async function issueChallengeToken(adminUserId: string, remember = false): Promise<string> {
  return signJwt(
    { typ: 'admin-challenge', sub: adminUserId, rem: remember },
    CHALLENGE_TTL_SECONDS,
  );
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
 * NOTE: the old lazy seed-admin bootstrap was removed from the login path
 * (security review C1 — documented credentials must never be able to create
 * privileged rows in production). Provision admins explicitly with
 * scripts/create-admin.ts instead.
 */

/**
 * Admin login — first factor (08-auth.md §5.1).
 * Email + password against the DB. Returns a challenge token for step 2.
 */
export async function adminLogin(
  email: string,
  password: string,
  remember = false,
): Promise<{
  success: boolean;
  requires2faSetup?: boolean;
  requiresTotp?: boolean;
  challengeToken?: string;
  error?: string;
  retryAfter?: number;
}> {
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
    // Atomic increment with a CAS-style guard (review 2026-09-26): the old
    // read-modify-write let N concurrent failures all write N=1.
    const bumped = await prisma.adminUser.updateMany({
      where: { id: user.id, lockedUntil: null },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    const fresh =
      bumped.count === 1
        ? await prisma.adminUser.findUnique({
            where: { id: user.id },
            select: { failedLoginAttempts: true },
          })
        : null;
    const attempts = fresh?.failedLoginAttempts ?? 1;
    const policy = await getSecurityPolicy();
    const lock = attempts >= policy.lockoutMaxAttempts;
    if (lock) {
      await prisma.adminUser.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          status: 'locked',
          lockedUntil: new Date(Date.now() + policy.lockoutMinutes * 60 * 1000),
        },
      });
    }
    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  // Review #6: an expired lockout must not linger — the lock window passed,
  // the password is correct, so restore `active` here. updateMany with the
  // status guard keeps explicitly deactivated accounts deactivated.
  await prisma.adminUser.updateMany({
    where: {
      id: user.id,
      status: 'locked',
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }],
    },
    data: {
      status: 'active',
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  // TOTP lock blocks the WHOLE login (challenge issuance included): with the
  // password in hand there would otherwise be unlimited fresh challenges.
  if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
    return {
      success: false,
      error: 'TOTP_LOCKED',
      retryAfter: Math.ceil((user.totpLockedUntil.getTime() - Date.now()) / 1000),
    };
  }

  const challengeToken = await issueChallengeToken(user.id, remember);
  void pruneConsumedChallenges();

  if (!user.totpConfirmed || !user.totpSecret) {
    return { success: true, requires2faSetup: true, challengeToken };
  }
  return { success: true, requiresTotp: true, challengeToken };
}

/**
 * Setup 2FA — hand out the stored secret + fresh backup codes.
 * 08-auth.md §5.2 — First-login enrollment step.
 * The QR is rendered server-side (qrcode lib → data URL) and shipped inside
 * the JSON, so the setup screen never depends on an external image service
 * (the previous api.qrserver.com <img> rendered blank whenever that host was
 * blocked — the “2FA page doesn't load” report).
 */
export async function setup2fa(challengeToken: string): Promise<{
  success: boolean;
  totpUri?: string;
  qrDataUrl?: string;
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
  if (user.status !== 'active') {
    return { success: false, error: 'ACCOUNT_DEACTIVATED' };
  }
  // Already enrolled: never hand the secret back. Knowing the password
  // alone must not reveal the second factor; re-enrollment goes through
  // a super-admin reset, not this endpoint.
  if (user.totpConfirmed) {
    return { success: false, error: 'ALREADY_ENROLLED' };
  }

  // The seeded row already holds a secret — reuse it so the QR the user
  // scanned earlier keeps working across retries of step 2.
  const secret = user.totpSecret ?? generateTotpSecret();
  if (!user.totpSecret) {
    await prisma.adminUser.update({ where: { id: user.id }, data: { totpSecret: secret } });
  }

  const totpUri = `otpauth://totp/Nong-Kati%3A${encodeURIComponent(user.email)}?secret=${secret}&issuer=Nong-Kati`;

  // Render the QR here: a PNG data URL needs no third-party host, no CSP
  // exception and works offline — the enrollment screen can never blank out
  // because of an external image request.
  const qrDataUrl = await QRCode.toDataURL(totpUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 220,
  });

  return {
    success: true,
    totpUri,
    qrDataUrl,
    secretBase32: secret,
    backupCodes: generateBackupCodes(),
  };
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
  retryAfter?: number;
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

  // Persistent per-account TOTP lockout (review 2026-09-26): the IP limiter
  // alone cannot stop distributed guessing with a stolen password.
  if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
    return {
      success: false,
      error: 'TOTP_LOCKED',
      retryAfter: Math.ceil((user.totpLockedUntil.getTime() - Date.now()) / 1000),
    };
  }

  const codeOk = await verifyTotpCode(user.totpSecret, totpCode);
  if (!codeOk) {
    // Atomic increment — concurrent wrong codes must accumulate, not overwrite.
    const updated = await prisma.adminUser.updateMany({
      where: { id: user.id, totpLockedUntil: null },
      data: { failedTotpAttempts: { increment: 1 } },
    });
    const fresh =
      updated.count === 1
        ? await prisma.adminUser.findUnique({
            where: { id: user.id },
            select: { failedTotpAttempts: true },
          })
        : null;
    if (fresh && fresh.failedTotpAttempts >= ADMIN_TOTP_MAX_ATTEMPTS) {
      await prisma.adminUser.updateMany({
        where: { id: user.id, totpLockedUntil: null },
        data: {
          totpLockedUntil: new Date(Date.now() + ADMIN_TOTP_LOCKOUT_MS),
          failedTotpAttempts: 0,
          status: 'locked',
        },
      });
      writeAuditLog({
        actorType: 'admin',
        actorId: user.id,
        actorEmail: user.email,
        action: 'admin_totp_lockout',
        tableName: 'AdminUser',
        recordId: user.id,
      });
    }
    return { success: false, error: 'TOTP_INVALID' };
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      totpConfirmed: true,
      lastLoginAt: new Date(),
      failedTotpAttempts: 0,
      totpLockedUntil: null,
    },
  });

  const session = await issueAdminSession(user, challenge.rem === true);
  // Fresh/flagged accounts land on the change-password form first.
  return user.mustChangePassword ? { ...session, mustChangePassword: true } : session;
}

/**
 * Issue a session: 15-min access JWT + refresh token.
 * Remember me → 30-day refresh (the classic "keep me logged in" box).
 * Not remembered → 12-hour refresh: the session still survives refreshes
 * within the workday but is gone by tomorrow, or whenever the browser
 * session ends (the client clears storage on unload).
 */
const REFRESH_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_TTL_SESSION_MS = 12 * 60 * 60 * 1000;

async function issueAdminSession(
  user: {
    id: string;
    email: string;
    role: string;
  },
  remember = false,
): Promise<{ success: boolean; accessToken: string; refreshToken: string; expiresIn: number }> {
  const role = user.role as AdminRole;
  const perms: Permission[] = ROLE_PERMISSIONS[role] ?? [];
  const accessToken = await issueAdminJwt(user.id, user.email, role, perms);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);

  await prisma.adminSession.create({
    data: {
      adminUserId: user.id,
      tokenHash,
      expiresAt: new Date(
        Date.now() + (remember ? REFRESH_TTL_REMEMBER_MS : REFRESH_TTL_SESSION_MS),
      ),
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

  // First-writer-wins claim (review 2026-09-26): revocation is a guarded
  // updateMany, not an unconditional write. Two concurrent refreshes with the
  // same token — exactly one gets count===1 and mints a replacement; the
  // other sees 0 rows and fails. No second durable session can exist.
  const claimed = await prisma.adminSession.updateMany({
    where: { id: session.id, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date() },
  });
  if (claimed.count !== 1) {
    return { success: false, error: 'TOKEN_INVALID' };
  }

  // Preserve the remembered-ness of the session being rotated: the new row
  // keeps the original's expiry class (30 days vs 12 hours).
  return issueAdminSession(
    user,
    session.expiresAt.getTime() - session.createdAt.getTime() > REFRESH_TTL_SESSION_MS,
  );
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
  const policyError = await checkPasswordPolicy(newPassword);
  if (policyError) {
    return { success: false, error: policyError };
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
  const user = await prisma.adminUser.findUnique({
    where: { id },
    include: {
      // Active sessions = not revoked and not yet expired. Shown as "Sessions
      // ที่ใช้งานอยู่" in the profile popover.
      _count: {
        select: {
          sessions: {
            where: { revokedAt: null, expiresAt: { gt: new Date() } },
          },
        },
      },
    },
  });
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
    lastLoginAt: user.lastLoginAt,
    activeSessions: user._count.sessions,
  };
}
