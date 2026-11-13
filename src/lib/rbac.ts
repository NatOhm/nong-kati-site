/**
 * RBAC Middleware — 08-auth.md §7.4.
 * Enforces permission checks on every admin route.
 *
 * Permission check: JWT payload.perms includes required permission (OR logic).
 * No DB lookup per request — permissions embedded in JWT at issuance.
 */

import {
  type Permission,
  ROLE_PERMISSIONS,
  type AdminRole,
  type AdminJwtPayload,
} from '@/types/auth';
import { verifyAdminJwt } from './jwt';

export interface RbacCheckResult {
  allowed: boolean;
  payload?: AdminJwtPayload;
  error?: string;
}

/**
 * Check if a JWT token has the required permission.
 * 08-auth.md §7.4 — Middleware verifies permission presence in JWT.
 */
export async function checkPermission(
  token: string,
  requiredPermission: Permission,
): Promise<RbacCheckResult> {
  const payload = await verifyAdminJwt(token);
  if (!payload) {
    return { allowed: false, error: 'UNAUTHENTICATED' };
  }

  // The account's live state (exists, active, session epoch, role) is NOT
  // trusted from the token: `verifyAdminJwt` reads it and returns null, so a
  // deactivated/demoted admin is rejected on their very next request instead
  // of riding the token to its 15-minute expiry. Do not "optimise" that read
  // away here — this file would then enforce a stale snapshot.

  // Check permission
  if (!payload.perms.includes(requiredPermission)) {
    // A forced-password-change admin is zeroed perms on EVERY route, which
    // used to surface as INSUFFICIENT_PERMISSIONS — telling the operator to
    // ask their manager for access when the actual fix is one form away.
    // The distinction is the whole point: the gate still denies, it just
    // stops lying about why.
    return {
      allowed: false,
      error: payload.passwordChangeRequired
        ? 'PASSWORD_CHANGE_REQUIRED'
        : 'INSUFFICIENT_PERMISSIONS',
    };
  }

  return { allowed: true, payload };
}

/**
 * Check if a role has a specific permission.
 * Useful for UI rendering (show/hide based on role).
 */
export function roleHasPermission(role: AdminRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes(permission);
}

/**
 * Get all permissions for a role.
 */
export function getRolePermissions(role: AdminRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Mask an email for limited-visibility roles: u***@domain (exported for
 * permission-based response shaping in the admin order routes). */
export function maskEmail(email: string): string {
  if (!email) return email;
  const parts = email.split('@');
  const localPart = parts[0] ?? '';
  const domain = parts[1];
  if (!domain) return email;
  const masked = localPart[0] + '***';
  return `${masked}@${domain}`;
}

/** Mask a phone for limited-visibility roles: 08****56 (exported, same use). */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length < 4) return '****';
  return phone.slice(0, 2) + '****' + phone.slice(-2);
}
