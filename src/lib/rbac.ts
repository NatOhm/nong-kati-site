/**
 * RBAC Middleware — 08-auth.md §7.4.
 * Enforces permission checks on every admin route.
 *
 * Permission check: JWT payload.perms includes required permission (OR logic).
 * No DB lookup per request — permissions embedded in JWT at issuance.
 */

import { type Permission, ROLE_PERMISSIONS, type AdminRole, type AdminJwtPayload } from '@/types/auth';
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

  // Check if role is active (not deactivated/locked)
  // In production, this checks admin_users.status in DB
  // For mock, we assume active if JWT is valid

  // Check permission
  if (!payload.perms.includes(requiredPermission)) {
    return { allowed: false, error: 'INSUFFICIENT_PERMISSIONS' };
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

/**
 * Mask PII based on role.
 * 08-auth.md §7.4 — support_agent sees masked data only.
 */
export function maskPII(data: Record<string, unknown>, role: AdminRole): Record<string, unknown> {
  if (role !== 'support_agent') return data;

  return {
    ...data,
    customer_email: maskEmail(data['customer_email'] as string),
    customer_phone: maskPhone(data['customer_phone'] as string),
    ip_address: undefined,
    payment_attempts: undefined,
    codes: undefined,
  };
}

function maskEmail(email: string): string {
  if (!email) return email;
  const parts = email.split('@');
  const localPart = parts[0] ?? '';
  const domain = parts[1];
  if (!domain) return email;
  const masked = localPart[0] + '***';
  return `${masked}@${domain}`;
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length < 4) return '****';
  return phone.slice(0, 2) + '****' + phone.slice(-2);
}
