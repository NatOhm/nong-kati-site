/**
 * Admin Customers API — 07-api.md §23.
 * Prisma-backed customer lookup, account actions, and price-tier management
 * (ราคาสมาชิก/ตัวแทนจำหน่าย: customer.tier = retail | member | dealer).
 * SERVER-ONLY: imports Prisma — client pages go through /api/v1/admin/*.
 */
import { prisma } from '@/lib/db';
import { normalizeTier, type PriceTier } from '@/lib/pricing';
import { writeAuditLog } from '@/lib/auditLog';

// ─── Types ──────────────────────────────────────────────

export type AdminCustomerListItem = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  tier: PriceTier;
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

// ─── Queries ────────────────────────────────────────────

/**
 * List customers with aggregates. 07-api.md §23 — GET /admin/customers
 */
export async function adminListCustomers(params: {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: AdminCustomerListItem[]; total: number; page: number; pageSize: number }> {
  const { q, status, page = 1, pageSize = 20 } = params;

  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { fullName: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { orders: true } },
        orders: { select: { totalAmountThb: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    data: rows.map((c) => ({
      id: c.id,
      email: c.email,
      fullName: c.fullName ?? '',
      status: c.status,
      tier: normalizeTier(c.tier),
      emailVerified: c.emailVerified,
      totalOrders: c._count.orders,
      totalSpendThb: Math.round(c.orders.reduce((s, o) => s + Number(o.totalAmountThb), 0) * 100) / 100,
      createdAt: c.createdAt,
      lastLoginAt: c.lastLoginAt,
    })),
    total,
    page,
    pageSize,
  };
}

/**
 * Get full customer detail for admin. 07-api.md §23 — GET /admin/customers/:id
 */
export async function adminGetCustomer(
  customerId: string,
): Promise<AdminCustomerDetail | null> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      _count: { select: { orders: true } },
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { orderNumber: true, status: true, totalAmountThb: true, createdAt: true },
      },
    },
  }).catch(() => null);
  if (!c) return null;

  const allSpend = await prisma.order.aggregate({
    where: { customerId },
    _sum: { totalAmountThb: true },
  });

  return {
    id: c.id,
    email: c.email,
    fullName: c.fullName ?? '',
    status: c.status,
    tier: normalizeTier(c.tier),
    emailVerified: c.emailVerified,
    totalOrders: c._count.orders,
    totalSpendThb: Number(allSpend._sum.totalAmountThb ?? 0),
    createdAt: c.createdAt,
    lastLoginAt: c.lastLoginAt,
    // Masked per PDPA — never expose the full phone number to staff UI.
    phoneNumber: c.phoneNumber ? `${c.phoneNumber.slice(0, 3)}****${c.phoneNumber.slice(-3)}` : null,
    lineOptIn: false,
    marketingOptIn: c.marketingOptIn,
    failedLoginAttempts: c.failedLoginAttempts,
    recentOrders: c.orders.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      totalAmountThb: Number(o.totalAmountThb),
      createdAt: o.createdAt,
    })),
  };
}

/**
 * Block or unblock a customer. 07-api.md §23 — PATCH /admin/customers/:id/block
 */
export async function adminBlockCustomer(
  customerId: string,
  blocked: boolean,
  adminId: string,
  adminEmail: string,
): Promise<{ success: boolean; status?: string; error?: string }> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, email: true, status: true },
  });
  if (!customer) return { success: false, error: 'CUSTOMER_NOT_FOUND' };

  const previousStatus = customer.status;
  const nextStatus = blocked ? 'blocked' : 'active';
  await prisma.customer.update({
    where: { id: customerId },
    data: { status: nextStatus },
  });

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: blocked ? 'customer_blocked' : 'customer_unblocked',
    tableName: 'store.customers',
    recordId: customerId,
    diff: {
      before: { status: previousStatus },
      after: { status: nextStatus },
    },
    metadata: {
      email: customer.email,
    },
  });

  return { success: true, status: nextStatus };
}

/**
 * Change a customer's price tier (ราคาปลีก/สมาชิก/ตัวแทนจำหน่าย).
 * Audited — tier changes directly change what the customer pays.
 */
export async function adminSetCustomerTier(
  customerId: string,
  tier: unknown,
  adminId: string,
  adminEmail: string,
): Promise<{ success: boolean; tier?: PriceTier; error?: string }> {
  const next = normalizeTier(tier);
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, email: true, tier: true },
  });
  if (!customer) return { success: false, error: 'CUSTOMER_NOT_FOUND' };

  const previous = normalizeTier(customer.tier);
  if (previous === next) return { success: true, tier: next };

  await prisma.customer.update({ where: { id: customerId }, data: { tier: next } });

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'customer_tier_changed',
    tableName: 'store.customers',
    recordId: customerId,
    diff: { before: { tier: previous }, after: { tier: next } },
    metadata: { email: customer.email },
  });

  return { success: true, tier: next };
}
