/**
 * Admin Staff API — 07-api.md §24.
 * Staff management for Super Admin only.
 * Uses mock data for M7 (Prisma in production).
 */
import { writeAuditLog } from '@/lib/auditLog';
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
  lastLoginIp: string | null;
  createdAt: Date;
};

// ─── Mock Staff Store ────────────────────────────────────

const mockStaff: AdminStaffListItem[] = [
  {
    id: 'staff-001',
    email: 'founder@nong-kati.co.th',
    fullName: 'Founder',
    role: 'super_admin',
    status: 'active',
    totpConfirmed: true,
    mustChangePassword: false,
    lastLoginAt: new Date('2026-08-24T08:00:00Z'),
    lastLoginIp: '1.2.3.4',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'staff-002',
    email: 'nipa@nong-kati.co.th',
    fullName: 'นิภา',
    role: 'order_manager',
    status: 'active',
    totpConfirmed: true,
    mustChangePassword: false,
    lastLoginAt: new Date('2026-08-23T09:00:00Z'),
    lastLoginIp: '5.6.7.8',
    createdAt: new Date('2026-06-01T09:00:00Z'),
  },
  {
    id: 'staff-003',
    email: 'somboon@nong-kati.co.th',
    fullName: 'สมบูรณ์',
    role: 'catalogue_manager',
    status: 'active',
    totpConfirmed: false,
    mustChangePassword: true,
    lastLoginAt: null,
    lastLoginIp: null,
    createdAt: new Date('2026-08-20T14:00:00Z'),
  },
];

// ─── API Functions ───────────────────────────────────────

/**
 * List all staff members.
 * 07-api.md §24 — GET /admin/staff (Super Admin only)
 */
export async function adminListStaff(): Promise<AdminStaffListItem[]> {
  return [...mockStaff];
}

/**
 * Create a new staff member.
 * 07-api.md §24 — POST /admin/staff (Super Admin only)
 */
export async function adminCreateStaff(
  input: {
    email: string;
    fullName: string;
    role: AdminRole;
  },
  adminId: string,
  adminEmail: string
): Promise<{ data: AdminStaffListItem; tempPassword: string } | { error: string }> {
  // Check for duplicate email
  const existing = mockStaff.find(
    (s) => s.email.toLowerCase() === input.email.toLowerCase()
  );
  if (existing) {
    return { error: 'EMAIL_ALREADY_EXISTS' };
  }

  const tempPassword = generateTempPassword();

  const newStaff: AdminStaffListItem = {
    id: `staff_${Date.now()}`,
    email: input.email,
    fullName: input.fullName,
    role: input.role,
    status: 'active',
    totpConfirmed: false,
    mustChangePassword: true,
    lastLoginAt: null,
    lastLoginIp: null,
    createdAt: new Date(),
  };

  mockStaff.push(newStaff);

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'staff_created',
    tableName: 'admin.admin_users',
    recordId: newStaff.id,
    diff: {
      before: null,
      after: { email: input.email, role: input.role },
    },
  });

  return { data: newStaff, tempPassword };
}

/**
 * Change a staff member's role.
 * 07-api.md §24 — PATCH /admin/staff/:id/role (Super Admin only)
 */
export async function adminChangeStaffRole(
  staffId: string,
  newRole: AdminRole,
  adminId: string,
  adminEmail: string
): Promise<{ success: boolean; error?: string }> {
  const staff = mockStaff.find((s) => s.id === staffId);
  if (!staff) {
    return { success: false, error: 'STAFF_NOT_FOUND' };
  }

  const previousRole = staff.role;
  staff.role = newRole;

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'role_change',
    tableName: 'admin.admin_users',
    recordId: staffId,
    diff: {
      before: { role: previousRole },
      after: { role: newRole },
    },
    metadata: {
      staffEmail: staff.email,
    },
  });

  return { success: true };
}

/**
 * Deactivate a staff member.
 * 07-api.md §24 — PATCH /admin/staff/:id/deactivate (Super Admin only)
 * Blocked if target is last active Super Admin.
 */
export async function adminDeactivateStaff(
  staffId: string,
  deactivate: boolean,
  adminId: string,
  adminEmail: string
): Promise<{ success: boolean; error?: string }> {
  const staff = mockStaff.find((s) => s.id === staffId);
  if (!staff) {
    return { success: false, error: 'STAFF_NOT_FOUND' };
  }

  // Last Super Admin protection
  if (deactivate && staff.role === 'super_admin') {
    const activeSuperAdmins = mockStaff.filter(
      (s) => s.role === 'super_admin' && s.status === 'active' && s.id !== staffId
    );
    if (activeSuperAdmins.length === 0) {
      return { success: false, error: 'LAST_SUPER_ADMIN' };
    }
  }

  const previousStatus = staff.status;
  staff.status = deactivate ? 'deactivated' : 'active';

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: deactivate ? 'staff_deactivated' : 'staff_activated',
    tableName: 'admin.admin_users',
    recordId: staffId,
    diff: {
      before: { status: previousStatus },
      after: { status: staff.status },
    },
    metadata: {
      staffEmail: staff.email,
    },
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
