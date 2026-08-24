/**
 * Admin Auth API — 08-auth.md §5.
 *
 * POST /admin/auth/login — Email + password (first factor)
 * POST /admin/auth/setup-2fa — Generate TOTP secret + backup codes
 * POST /admin/auth/confirm-2fa — Confirm TOTP setup
 * POST /admin/auth/verify-totp — Verify TOTP code (second factor)
 * POST /admin/auth/logout — Revoke session
 * POST /admin/auth/change-password — Change password
 */

import {
  issueAdminJwt,
  generateRefreshToken,
  hashRefreshToken,
  generateTotpSecret,
  generateBackupCodes,
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
  passwordHash: string;
}

export interface AdminSession {
  adminUserId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

// In-memory stores (mock)
const adminUsers = new Map<string, AdminUser>();
const adminSessions = new Map<string, AdminSession>();
const challengeTokens = new Map<string, { adminUserId: string; expiresAt: Date }>();

// Seed default admin user
function seedAdminUser(): void {
  if (adminUsers.size > 0) return;
  adminUsers.set('admin@nong-kati.co.th', {
    id: 'admin-001',
    email: 'admin@nong-kati.co.th',
    fullName: 'Founder',
    role: 'super_admin',
    status: 'active',
    totpConfirmed: true,
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordHash: 'admin123', // Mock: plaintext check
  });
}

seedAdminUser();

/**
 * Admin login — first factor.
 * 08-auth.md §5.1 — Email + password.
 *
 * Returns challenge_token for 2FA verification.
 */
export function adminLogin(
  email: string,
  password: string,
): {
  success: boolean;
  requires2faSetup?: boolean;
  requiresTotp?: boolean;
  challengeToken?: string;
  error?: string;
  retryAfter?: number;
} {
  const user = adminUsers.get(email);
  if (!user) {
    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  // Check account status
  if (user.status === 'deactivated') {
    return { success: false, error: 'ACCOUNT_DEACTIVATED' };
  }

  if (user.status === 'locked' && user.lockedUntil && user.lockedUntil > new Date()) {
    const retryAfter = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
    return { success: false, error: 'ACCOUNT_LOCKED', retryAfter };
  }

  // Verify password (mock: simple string comparison)
  if (user.passwordHash !== password) {
    user.failedLoginAttempts++;

    if (user.failedLoginAttempts >= 5) {
      user.status = 'locked';
      user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    }

    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  // Reset failed attempts
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;

  // Generate challenge token for 2FA
  const challengeToken = cn(crypto.randomUUID());
  challengeTokens.set(challengeToken, {
    adminUserId: user.id,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
  });

  if (!user.totpConfirmed) {
    return {
      success: true,
      requires2faSetup: true,
      challengeToken,
    };
  }

  return {
    success: true,
    requiresTotp: true,
    challengeToken,
  };
}

// Helper to avoid circular reference
function cn(s: string): string { return s; }

/**
 * Setup 2FA — generate TOTP secret + backup codes.
 * 08-auth.md §5.2 — Called on first login when totp_confirmed = FALSE.
 */
export function setup2fa(
  challengeToken: string,
): {
  success: boolean;
  totpUri?: string;
  secretBase32?: string;
  backupCodes?: string[];
  error?: string;
} {
  const challenge = challengeTokens.get(challengeToken);
  if (!challenge || challenge.expiresAt < new Date()) {
    return { success: false, error: 'TOKEN_INVALID' };
  }

  const user = [...adminUsers.values()].find((u) => u.id === challenge.adminUserId);
  if (!user) {
    return { success: false, error: 'USER_NOT_FOUND' };
  }

  const secret = generateTotpSecret();
  const backupCodes = generateBackupCodes();

  const totpUri = `otpauth://totp/Nong-Kati%3A${encodeURIComponent(user.email)}?secret=${secret}&issuer=Nong-Kati`;

  return {
    success: true,
    totpUri,
    secretBase32: secret,
    backupCodes,
  };
}

/**
 * Confirm 2FA — verify TOTP code and activate 2FA.
 * 08-auth.md §5.2 — Confirm step.
 */
export function confirm2fa(
  challengeToken: string,
  totpCode: string,
): {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
} {
  const challenge = challengeTokens.get(challengeToken);
  if (!challenge || challenge.expiresAt < new Date()) {
    return { success: false, error: 'TOKEN_INVALID' };
  }

  const user = [...adminUsers.values()].find((u) => u.id === challenge.adminUserId);
  if (!user) {
    return { success: false, error: 'USER_NOT_FOUND' };
  }

  // Verify TOTP code
  if (!verifyTotpCode('', totpCode)) {
    return { success: false, error: 'TOTP_INVALID' };
  }

  // Activate 2FA
  user.totpConfirmed = true;

  // Issue session
  return issueAdminSession(user);
}

/**
 * Verify TOTP — second factor for login.
 * 08-auth.md §5.1 — verify-totp endpoint.
 */
export function verifyTotp(
  challengeToken: string,
  totpCode: string,
): {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
} {
  const challenge = challengeTokens.get(challengeToken);
  if (!challenge || challenge.expiresAt < new Date()) {
    return { success: false, error: 'TOKEN_INVALID' };
  }

  const user = [...adminUsers.values()].find((u) => u.id === challenge.adminUserId);
  if (!user) {
    return { success: false, error: 'USER_NOT_FOUND' };
  }

  // Verify TOTP code
  if (!verifyTotpCode('', totpCode)) {
    return { success: false, error: 'TOTP_INVALID' };
  }

  // Issue session
  return issueAdminSession(user);
}

/**
 * Issue admin session (JWT + refresh token).
 */
function issueAdminSession(
  user: AdminUser,
): {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} {
  const perms = ROLE_PERMISSIONS[user.role] ?? [];
  const accessToken = issueAdminJwt(user.id, user.email, user.role, perms);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  // Store refresh token
  adminSessions.set(tokenHash, {
    adminUserId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
    createdAt: new Date(),
  });

  // Enforce max 3 concurrent sessions
  const userSessions = [...adminSessions.values()]
    .filter((s) => s.adminUserId === user.id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (userSessions.length > 3) {
    const toRevoke = userSessions.slice(0, userSessions.length - 3);
    for (const session of toRevoke) {
      adminSessions.delete(session.tokenHash);
    }
  }

  return {
    success: true,
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // 15 minutes
  };
}

/**
 * Admin logout — revoke session.
 */
export function adminLogout(refreshToken: string): { success: boolean } {
  const tokenHash = hashRefreshToken(refreshToken);
  adminSessions.delete(tokenHash);
  return { success: true };
}

/**
 * Change admin password.
 * 08-auth.md §5.1 — change-password endpoint.
 */
export function changeAdminPassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
): { success: boolean; error?: string } {
  const user = [...adminUsers.values()].find((u) => u.id === adminId);
  if (!user) {
    return { success: false, error: 'USER_NOT_FOUND' };
  }

  if (user.passwordHash !== currentPassword) {
    return { success: false, error: 'CURRENT_PASSWORD_INCORRECT' };
  }

  user.passwordHash = newPassword;
  user.mustChangePassword = false;

  // Invalidate all other sessions
  for (const [hash, session] of adminSessions.entries()) {
    if (session.adminUserId === adminId) {
      adminSessions.delete(hash);
    }
  }

  return { success: true };
}

/**
 * Get admin user by ID.
 */
export function getAdminUserById(id: string): AdminUser | undefined {
  return [...adminUsers.values()].find((u) => u.id === id);
}
