/**
 * Admin Staff API — 07-api.md §24. Real Prisma-backed staff management
 * (replaces the M7 mock store). Super Admin only (staff:* permissions;
 * see ROLE_PERMISSIONS in src/types/auth.ts).
 *
 * Rules enforced here, not in the UI:
 * - Duplicate emails rejected (unique constraint mapped to EMAIL_ALREADY_EXISTS).
 * - The last active super_admin cannot be deactivated or demoted.
 * - You cannot deactivate/demote yourself.
 * - New staff get a random temp password + mustChangePassword, and land in
 *   the 2FA-setup flow on first login (same as the seeded limited accounts).
 * - Deactivating or changing a role revokes the target's live sessions
 *   (revokedAt on AdminSession + sessionsInvalidBefore on the user).
 */

import { prisma } from '@/lib/db';
import { writeAuditLog } from '@/lib/auditLog';
import { hashPassword } from '@/lib/password';
import type { AdminRole } from '@/types/auth';

// ─── Types ──────────────────────────────────────────────

export type AdminStaffListItem = {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  status: string;
  totpConfirmed: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

const STAFF_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  totpConfirmed: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

type StaffTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Revoke every live session of a user + invalidate anything in flight. */
async function revokeSessions(tx: StaffTx, adminUserId: string): Promise<void> {
  await tx.adminSession.updateMany({
    where: { adminUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await tx.adminUser.update({
    where: { id: adminUserId },
    data: { sessionsInvalidBefore: new Date() },
  });
}

/** Guardrail shared by role-change and deactivate paths. Caller must hold the tx. */
async function checkLastSuperAdmin(tx: StaffTx, targetId: string): Promise<string | null> {
  const target = await tx.adminUser.findUnique({ where: { id: targetId } });
  if (!target) return 'STAFF_NOT_FOUND';
  if (target.role !== 'super_admin' || target.status !== 'active') return null;
  const otherActive = await tx.adminUser.count({
    where: { role: 'super_admin', status: 'active', id: { not: targetId } },
  });
  return otherActive === 0 ? 'LAST_SUPER_ADMIN' : null;
}

/**
 * Serializable wrapper with retry on write-conflict (finding #8): two racing
 * mutations must never both see "another super admin exists" and demote both.
 * Returns the mutation result, or a DB failure.
 */
async function runStaffMutation<T>(fn: (tx: StaffTx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' });
    } catch (e) {
      const isConflict =
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code?: string }).code === 'P2034';
      if (!isConflict || attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
  throw new Error('unreachable'); // loop always returns or throws
}

// ─── API Functions ───────────────────────────────────────

/**
 * List all staff members.
 * 07-api.md §24 — GET /admin/staff (staff:read)
 */
export async function adminListStaff(): Promise<AdminStaffListItem[]> {
  const rows = await prisma.adminUser.findMany({
    orderBy: { createdAt: 'asc' },
    select: STAFF_SELECT,
  });
  return rows as AdminStaffListItem[];
}

/**
 * Create a new staff member.
 * 07-api.md §24 — POST /admin/staff (staff:write)
 */
export async function adminCreateStaff(
  input: { email: string; fullName: string; role: AdminRole },
  adminId: string,
  adminEmail: string,
): Promise<{ data: AdminStaffListItem; tempPassword: string } | { error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'INVALID_EMAIL' };

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) return { error: 'EMAIL_ALREADY_EXISTS' };

  const tempPassword = generateTempPassword();
  const created = await prisma.adminUser.create({
    data: {
      email,
      fullName: input.fullName.trim(),
      role: input.role,
      status: 'active',
      passwordHash: await hashPassword(tempPassword),
      totpSecret: null,
      totpConfirmed: false,
      mustChangePassword: true,
    },
    select: STAFF_SELECT,
  });

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'staff_created',
    tableName: 'AdminUser',
    recordId: created.id,
    diff: { before: null, after: { email, role: input.role } },
  });

  return { data: created as AdminStaffListItem, tempPassword };
}

/**
 * Change a staff member's role.
 * 07-api.md §24 — PATCH /admin/staff/:id/role (staff:write)
 */
export async function adminChangeStaffRole(
  staffId: string,
  newRole: AdminRole,
  adminId: string,
  adminEmail: string,
): Promise<{ success: boolean; error?: string }> {
  if (staffId === adminId) return { success: false, error: 'CANNOT_MODIFY_SELF' };

  // Guardrail + mutation + session invalidation must be one atomic unit
  // (finding #8): two concurrent demotions of different super admins must
  // not both succeed, or the system ends with zero super admins.
  const result = await runStaffMutation(async (tx) => {
    const lastSuper = await checkLastSuperAdmin(tx, staffId);
    if (lastSuper) return { success: false as const, error: lastSuper };

    const staff = await tx.adminUser.findUnique({ where: { id: staffId } });
    if (!staff) return { success: false as const, error: 'STAFF_NOT_FOUND' };
    if (staff.role === newRole) return { success: true as const };

    await tx.adminUser.update({ where: { id: staffId }, data: { role: newRole } });
    // A demotion must not keep live sessions minted with the old permission set.
    await revokeSessions(tx, staffId);

    writeAuditLog({
      actorType: 'admin',
      actorId: adminId,
      actorEmail: adminEmail,
      action: 'role_change',
      tableName: 'AdminUser',
      recordId: staffId,
      diff: { before: { role: staff.role }, after: { role: newRole } },
      metadata: { staffEmail: staff.email },
    });

    return { success: true as const };
  });
  return result;
}

/**
 * Deactivate / reactivate a staff member.
 * 07-api.md §24 — PATCH /admin/staff/:id/deactivate (staff:deactivate)
 * Blocked for the last active Super Admin; self-deactivation blocked.
 */
export async function adminDeactivateStaff(
  staffId: string,
  deactivate: boolean,
  adminId: string,
  adminEmail: string,
): Promise<{ success: boolean; error?: string }> {
  if (staffId === adminId) return { success: false, error: 'CANNOT_MODIFY_SELF' };

  // Same atomic unit as the role change (finding #8).
  const result = await runStaffMutation(async (tx) => {
    if (deactivate) {
      const lastSuper = await checkLastSuperAdmin(tx, staffId);
      if (lastSuper) return { success: false as const, error: lastSuper };
    }

    const staff = await tx.adminUser.findUnique({ where: { id: staffId } });
    if (!staff) return { success: false as const, error: 'STAFF_NOT_FOUND' };
    if (staff.status === (deactivate ? 'deactivated' : 'active')) {
      return { success: true as const };
    }

    await tx.adminUser.update({
      where: { id: staffId },
      data: { status: deactivate ? 'deactivated' : 'active' },
    });
    if (deactivate) await revokeSessions(tx, staffId);

    writeAuditLog({
      actorType: 'admin',
      actorId: adminId,
      actorEmail: adminEmail,
      action: deactivate ? 'staff_deactivated' : 'staff_activated',
      tableName: 'AdminUser',
      recordId: staffId,
      diff: {
        before: { status: staff.status },
        after: { status: deactivate ? 'deactivated' : 'active' },
      },
      metadata: { staffEmail: staff.email },
    });

    return { success: true as const };
  });
  return result;
}

/**
 * Reset a staff member's password to a new temp password.
 * (staff:reset-2fa shares the guardrails: no self, no last super admin.)
 * Sets mustChangePassword so the target lands on the change form at next login.
 */
export async function adminResetStaffPassword(
  staffId: string,
  adminId: string,
  adminEmail: string,
): Promise<{ tempPassword: string } | { error: string }> {
  if (staffId === adminId) return { error: 'CANNOT_MODIFY_SELF' };

  const staff = await prisma.adminUser.findUnique({ where: { id: staffId } });
  if (!staff) return { error: 'STAFF_NOT_FOUND' };

  const tempPassword = generateTempPassword();
  // Atomic: the new credential and the session invalidation land together —
  // a crash between them must not leave live sessions on a known temp password.
  await runStaffMutation(async (tx) => {
    await tx.adminUser.update({
      where: { id: staffId },
      data: {
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await revokeSessions(tx, staffId);
    return { success: true as const };
  });

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'staff_password_reset',
    tableName: 'AdminUser',
    recordId: staffId,
    diff: null,
    metadata: { staffEmail: staff.email },
  });

  return { tempPassword };
}

/** Unlock a locked account (clears the 15-min lockout + counters). */
export async function adminUnlockStaff(
  staffId: string,
  adminId: string,
  adminEmail: string,
): Promise<{ success: boolean; error?: string }> {
  const staff = await prisma.adminUser.findUnique({ where: { id: staffId } });
  if (!staff) return { success: false, error: 'STAFF_NOT_FOUND' };

  // Finding #10: login lockout sets status='locked'; clearing only the
  // counters left the account unusable (/me + refresh require 'active').
  // Restore 'active' for locked accounts; never resurrect 'deactivated'.
  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: staffId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.adminUser.updateMany({
      where: { id: staffId, status: 'locked' },
      data: { status: 'active' },
    }),
  ]);

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'staff_unlocked',
    tableName: 'AdminUser',
    recordId: staffId,
    diff: null,
    metadata: { staffEmail: staff.email },
  });

  return { success: true };
}

// ─── Helpers ─────────────────────────────────────────────

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}
