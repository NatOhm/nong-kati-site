/**
 * Dashboard money-scope regressions (review 2026-10-24):
 *
 *  1. "รายได้เดือนนี้" used to render the ALL-TIME revenue aggregate (฿972
 *     lifetime) under a month header — the month panel and the all-time block
 *     must be separate numbers.
 *  2. The PromptPay share used to read revenueByPaymentMethod[0]: the DB
 *     returns groups in arbitrary order (wallet first in the seeded store),
 *     so the panel showed 28% when PromptPay was really 66%.
 *  3. An empty store used to render NaN% (0/0) — it must be 0.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: { findUnique: vi.fn() },
    order: { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    refund: { aggregate: vi.fn() },
    customer: { count: vi.fn(), findMany: vi.fn() },
    productVariant: { aggregate: vi.fn(), findMany: vi.fn() },
    orderItem: { groupBy: vi.fn() },
  };
  return { prismaMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

import { issueAdminJwt } from '@/lib/jwt';
import { ROLE_PERMISSIONS, type AdminRole } from '@/types/auth';

/** Seeded store: ฿972 lifetime, ฿312 this month, PromptPay ฿642 of ฿972. */
const ALL_TIME_GROSS = 972;
const MONTH_GROSS = 312;
const PROMPTPAY_SHARE = 66; // round(642 / 972 * 100)

type OrderWhere = Record<string, unknown>;

function isMonthStart(d: Date): boolean {
  const now = new Date();
  return (
    d.getDate() === 1 &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  // verifyAdminJwt re-reads the admin row on every request (live status/role).
  prismaMock.adminUser.findUnique.mockResolvedValue({
    role: 'super_admin',
    status: 'active',
    sessionsInvalidBefore: null,
    mustChangePassword: false,
  });

  // Dispatch by where-shape: this one mock serves today/week/month/all-time
  // aggregates, the month VAT aggregate and the 7-day revenue loop.
  prismaMock.order.aggregate.mockImplementation(async (args: { where?: OrderWhere }) => {
    const where = args?.where ?? {};
    if (where['completedAt']) return { _sum: { totalAmountThb: null } }; // day loop
    if (where['vatEnabled']) return { _sum: { vatAmountThb: '31.2' } }; // month VAT
    if (where['createdAt']) {
      const gte = (where['createdAt'] as { gte: Date }).gte;
      // month aggregate (gte = 1st of month) vs today/week windows
      if (isMonthStart(gte)) {
        return { _count: { _all: 7 }, _sum: { totalAmountThb: String(MONTH_GROSS), discountThb: '12' } };
      }
      return { _count: { _all: 2 }, _sum: { totalAmountThb: '50', discountThb: '0' } };
    }
    if (where['status'] === 'completed') {
      // all-time completed (allAgg)
      return { _count: { _all: 30 }, _sum: { totalAmountThb: String(ALL_TIME_GROSS), discountThb: '20' } };
    }
    return { _count: { _all: 0 }, _sum: { totalAmountThb: null, discountThb: null } };
  });

  prismaMock.order.groupBy.mockImplementation(
    async (args: { by: string[]; where?: OrderWhere }) => {
      if (args.by.includes('paymentMethod')) {
        // WALLET FIRST — reproduces the DB order that broke revenueByPaymentMethod[0].
        return [
          { paymentMethod: 'wallet', _count: { _all: 1 }, _sum: { totalAmountThb: '330' } },
          { paymentMethod: 'promptpay', _count: { _all: 5 }, _sum: { totalAmountThb: '642' } },
        ];
      }
      if (args.by.includes('vatEnabled')) {
        return [{ vatEnabled: true, _sum: { vatAmountThb: '97.2' } }];
      }
      if (args.where?.['createdAt']) {
        // today status groups
        return [
          { status: 'completed', _count: { _all: 4 } },
          { status: 'expired', _count: { _all: 1 } },
        ];
      }
      // all-time status groups
      return [
        { status: 'completed', _count: { _all: 30 } },
        { status: 'pending_manual_fulfilment', _count: { _all: 2 } },
      ];
    },
  );

  prismaMock.refund.aggregate.mockImplementation(async (args?: { where?: unknown }) =>
    args?.where ? { _sum: { amountThb: '0' } } : { _sum: { amountThb: '50' } },
  );

  prismaMock.order.findMany.mockResolvedValue([]);
  prismaMock.customer.count.mockResolvedValue(0);
  prismaMock.customer.findMany.mockResolvedValue([]);
  prismaMock.productVariant.aggregate.mockResolvedValue({
    _sum: { stock: 0 },
    _count: { _all: 0 },
  });
  prismaMock.productVariant.findMany.mockResolvedValue([]);
  prismaMock.orderItem.groupBy.mockResolvedValue([]);
});

type DashboardBody = {
  revenue: {
    grossRevenue: number;
    promptpaySharePct: number;
    revenueByPaymentMethod: { method: string; total: number }[];
    revenueThisMonth: {
      grossRevenue: number;
      netRevenue: number;
      vatCollected: number;
      discountAmount: number;
      refundAmount: number;
    };
  };
};

async function callDashboard(): Promise<DashboardBody> {
  const mod = await import('../src/app/api/v1/admin/dashboard/route');
  const token = await issueAdminJwt('admin-super_admin', 'admin@test.local', 'super_admin', [
    ...ROLE_PERMISSIONS['super_admin' as AdminRole],
  ]);
  const req = new NextRequest('http://localhost/api/v1/admin/dashboard', {
    headers: { authorization: `Bearer ${token}` },
  });
  const res = await mod.GET(req);
  expect(res.status).toBe(200);
  return (await res.json()) as DashboardBody;
}

describe('dashboard money scope', () => {
  it('month panel is THIS month, not the all-time aggregate', async () => {
    const body = await callDashboard();
    expect(body.revenue.grossRevenue).toBe(ALL_TIME_GROSS);
    expect(body.revenue.revenueThisMonth.grossRevenue).toBe(MONTH_GROSS);
    expect(body.revenue.revenueThisMonth.grossRevenue).not.toBe(body.revenue.grossRevenue);
    expect(body.revenue.revenueThisMonth.netRevenue).toBe(MONTH_GROSS - 12);
    expect(body.revenue.revenueThisMonth.vatCollected).toBeCloseTo(31.2, 5);
    expect(body.revenue.revenueThisMonth.discountAmount).toBe(12);
  });

  it('PromptPay share is found BY METHOD, not by array position', async () => {
    const body = await callDashboard();
    // Guard the reproduction: wallet really is group 0 in this store.
    expect(body.revenue.revenueByPaymentMethod[0]?.method).toBe('wallet');
    expect(body.revenue.promptpaySharePct).toBe(PROMPTPAY_SHARE);
  });

  it('an empty store reports 0% instead of NaN%', async () => {
    prismaMock.order.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { totalAmountThb: null, discountThb: null, vatAmountThb: null },
    });
    prismaMock.order.groupBy.mockResolvedValue([]);
    prismaMock.refund.aggregate.mockResolvedValue({ _sum: { amountThb: null } });

    const body = await callDashboard();
    expect(body.revenue.promptpaySharePct).toBe(0);
    expect(body.revenue.revenueThisMonth.grossRevenue).toBe(0);
  });
});
