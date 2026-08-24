/**
 * Admin Customers API — 07-api.md §23.
 * Customer lookup and account actions for admin staff.
 * Uses mock data for M7 (Prisma in production).
 */
import { writeAuditLog } from '@/lib/auditLog';

// ─── Types ──────────────────────────────────────────────

export type AdminCustomerListItem = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  emailVerified: boolean;
  totalOrders: number;
  totalSpendThb: number;
  createdAt: Date;
  lastLoginAt: Date | null;
};

export type AdminCustomerDetail = AdminCustomerListItem & {
  phoneNumber: string | null;
  lineOptIn: boolean;
  marketingOptIn: boolean;
  failedLoginAttempts: number;
  recentOrders: {
    orderNumber: string;
    status: string;
    totalAmountThb: number;
    createdAt: Date;
  }[];
};

// ─── Mock Customer Store ─────────────────────────────────

const mockCustomers: AdminCustomerListItem[] = [
  {
    id: 'cust-001',
    email: 'kaem@example.com',
    fullName: 'แก้ม สีดำ',
    status: 'active',
    emailVerified: true,
    totalOrders: 12,
    totalSpendThb: 1284.0,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    lastLoginAt: new Date('2026-08-23T09:00:00Z'),
  },
  {
    id: 'cust-002',
    email: 'somchai@example.com',
    fullName: 'สมชาย ใจดี',
    status: 'active',
    emailVerified: true,
    totalOrders: 3,
    totalSpendThb: 321.0,
    createdAt: new Date('2026-06-10T14:30:00Z'),
    lastLoginAt: new Date('2026-08-22T11:00:00Z'),
  },
  {
    id: 'cust-003',
    email: 'nisa@example.com',
    fullName: 'นิสา สดใส',
    status: 'blocked',
    emailVerified: true,
    totalOrders: 1,
    totalSpendThb: 535.0,
    createdAt: new Date('2026-07-20T08:45:00Z'),
    lastLoginAt: null,
  },
  {
    id: 'cust-004',
    email: 'prawit@example.com',
    fullName: 'ประวิตร มั่นคง',
    status: 'active',
    emailVerified: false,
    totalOrders: 0,
    totalSpendThb: 0,
    createdAt: new Date('2026-08-20T16:00:00Z'),
    lastLoginAt: null,
  },
];

// ─── API Functions ───────────────────────────────────────

/**
 * List admin customers with search and pagination.
 * 07-api.md §23 — GET /admin/customers
 */
export async function adminListCustomers(params: {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: AdminCustomerListItem[]; total: number; page: number; pageSize: number }> {
  const { q, status, page = 1, pageSize = 20 } = params;

  let filtered = [...mockCustomers];

  if (status) {
    filtered = filtered.filter((c) => c.status === status);
  }
  if (q) {
    const term = q.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.email.toLowerCase().includes(term) ||
        c.fullName.toLowerCase().includes(term)
    );
  }

  const total = filtered.length;
  const offset = (page - 1) * pageSize;
  const data = filtered.slice(offset, offset + pageSize);

  return { data, total, page, pageSize };
}

/**
 * Get full customer detail for admin.
 * 07-api.md §23 — GET /admin/customers/:id
 */
export async function adminGetCustomer(
  customerId: string
): Promise<AdminCustomerDetail | null> {
  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) return null;

  return {
    ...customer,
    phoneNumber: '081****678', // Masked per PDPA
    lineOptIn: false,
    marketingOptIn: false,
    failedLoginAttempts: 0,
    recentOrders: [
      {
        orderNumber: 'NK-2026-000001',
        status: 'completed',
        totalAmountThb: 214.0,
        createdAt: new Date('2026-08-20T14:00:00Z'),
      },
    ],
  };
}

/**
 * Block or unblock a customer.
 * 07-api.md §23 — PATCH /admin/customers/:id/block
 */
export async function adminBlockCustomer(
  customerId: string,
  blocked: boolean,
  adminId: string,
  adminEmail: string
): Promise<{ success: boolean; status?: string; error?: string }> {
  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return { success: false, error: 'CUSTOMER_NOT_FOUND' };
  }

  const previousStatus = customer.status;
  customer.status = blocked ? 'blocked' : 'active';

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: blocked ? 'customer_blocked' : 'customer_unblocked',
    tableName: 'store.customers',
    recordId: customerId,
    diff: {
      before: { status: previousStatus },
      after: { status: customer.status },
    },
    metadata: {
      email: customer.email,
    },
  });

  return { success: true, status: customer.status };
}
