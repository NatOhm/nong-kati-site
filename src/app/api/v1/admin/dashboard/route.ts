import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission, maskEmail } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { LOW_STOCK_THRESHOLD } from '@/lib/lowStock';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

function dayStart(offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
}

function monthStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * GET /api/v1/admin/dashboard — real analytics replacing src/api/analytics.ts
 * mocks (client list: สรุปยอดขาย, รายงานบัญชีและกำไร, รายงานสต๊อก, สถิติลูกค้า).
 * Requires dashboard:read — NOT reports:read. The dashboard is the landing
 * page for every operational role, so gating it behind reports:read meant
 * catalogue/order/support managers were shown no menu entry and then 403'd.
 * Keeping the two permissions separate stops the dashboard from becoming a
 * back door into Analytics & Reports.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'dashboard:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const today = dayStart(0);
  const weekAgo = dayStart(6);
  const month = monthStart();

  // Review: revenue figures must exclude pending/failed/expired orders.
  // Same canonical set the customer-sales report uses.
  const REVENUE_STATUSES = ['payment_confirmed', 'code_delivered', 'completed'];

  const [
    todayAgg,
    weekAgg,
    monthAgg,
    allAgg,
    statusCounts,
    monthVatAgg,
    refundsAgg,
    monthRefundsAgg,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: { createdAt: { gte: today }, status: { in: REVENUE_STATUSES } },
      _count: { _all: true },
      _sum: { totalAmountThb: true, discountThb: true },
    }),
    prisma.order.aggregate({
      where: { createdAt: { gte: weekAgo }, status: { in: REVENUE_STATUSES } },
      _count: { _all: true },
      _sum: { totalAmountThb: true },
    }),
    prisma.order.aggregate({
      where: { createdAt: { gte: month }, status: { in: REVENUE_STATUSES } },
      _count: { _all: true },
      // discountThb rides along so the month panel's discount needs no extra
      // aggregate (the old monthDiscountAgg was a separate completed-only
      // query whose scope disagreed with the month revenue it sat beside).
      _sum: { totalAmountThb: true, discountThb: true },
    }),
    prisma.order.aggregate({
      where: { status: 'completed' },
      _count: { _all: true },
      _sum: { totalAmountThb: true, discountThb: true },
    }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.order.aggregate({
      where: { createdAt: { gte: month }, status: 'completed', vatEnabled: true },
      _sum: { vatAmountThb: true },
    }),
    prisma.refund.aggregate({ _sum: { amountThb: true } }),
    prisma.refund.aggregate({
      where: { createdAt: { gte: month } },
      _sum: { amountThb: true },
    }),
  ]);

  const statusCount = (s: string) => statusCounts.find((x) => x.status === s)?._count._all ?? 0;

  // Status cards are TIME-SCOPED (review): the groupBy above is all-time, so
  // today counts re-aggregate within the window instead of reusing it.
  const todayStatusGroups = await prisma.order.groupBy({
    by: ['status'],
    where: { createdAt: { gte: today } },
    _count: { _all: true },
  });
  const todayStatusCount = (s: string) =>
    todayStatusGroups.find((x) => x.status === s)?._count._all ?? 0;

  // Revenue by day (last 7 days, completed only). Keys are LOCAL date parts:
  // toISOString() renders the local-midnight Date in UTC, which in ICT (UTC+7)
  // shifted every key back a day — bars labelled one day early and the client
  // clock could never match "today" (review 2026-10-24). `isToday` is decided
  // here so the client no longer needs its own clock at all.
  const localDayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const revenueByDay: { date: string; revenue: number; isToday: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = dayStart(i);
    const end = dayStart(i - 1);
    const agg = await prisma.order.aggregate({
      where: { status: 'completed', completedAt: { gte: start, lt: end } },
      _sum: { totalAmountThb: true },
    });
    revenueByDay.push({
      date: localDayKey(start),
      revenue: Number(agg._sum.totalAmountThb ?? 0),
      isToday: i === 0,
    });
  }

  // Payment methods (completed, all time)
  const paymentGroups = await prisma.order.groupBy({
    by: ['paymentMethod'],
    where: { status: 'completed' },
    _count: { _all: true },
    _sum: { totalAmountThb: true },
  });
  const revenueByPaymentMethod = paymentGroups
    .filter((p) => p.paymentMethod !== null)
    .map((p) => ({
      method: p.paymentMethod as string,
      count: p._count._all,
      total: Number(p._sum.totalAmountThb ?? 0),
    }));

  // Top products (completed orders)
  const topItemGroups = await prisma.orderItem.groupBy({
    by: ['variantId', 'productNameTh'],
    where: { order: { status: 'completed' } },
    _sum: { quantity: true, lineTotalThb: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 8,
  });

  // Customer analytics
  const [totalCustomers, activeCustomers, newCustomers, repeatBase] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { orders: { some: { status: 'completed' } } } }),
    prisma.customer.count({ where: { createdAt: { gte: month } } }),
    // Repeat-buyer numerator for returningCustomerRate: the same 500-customer
    // analytical set as before, selecting only the completed-order count. The
    // old query also pulled full email PII plus every order row to build a
    // top-customers list nothing ever rendered (deleted review 2026-10-24).
    prisma.customer.findMany({
      select: { _count: { select: { orders: { where: { status: 'completed' } } } } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
  ]);

  // Stock
  const [stockAgg, lowStock] = await Promise.all([
    prisma.productVariant.aggregate({ _sum: { stock: true }, _count: { _all: true } }),
    prisma.productVariant.findMany({
      where: { stock: { lte: LOW_STOCK_THRESHOLD }, isActive: true },
      orderBy: { stock: 'asc' },
      take: 8,
      select: { id: true, label: true, stock: true, product: { select: { name: true } } },
    }),
  ]);

  // Review [High]: full customer PII (email) is only for holders of
  // customers:read:full. Everyone else with dashboard:read gets masked emails
  // (maskEmail from lib/rbac — the same helper the order/topup routes use).
  const canSeeFullPii = check.payload?.perms.includes('customers:read:full') ?? false;

  // Recent orders (live)
  const recentOrders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      orderNumber: true,
      customerEmail: true,
      status: true,
      paymentMethod: true,
      totalAmountThb: true,
      createdAt: true,
      items: { select: { productNameTh: true }, take: 1 },
    },
  });

  const grossRevenue = Number(allAgg._sum.totalAmountThb ?? 0);
  const discounts = Number(allAgg._sum.discountThb ?? 0);
  const refundAmount = Number(refundsAgg._sum.amountThb ?? 0);
  const completedOrders = allAgg._count._all;
  const averageOrderValue = completedOrders > 0 ? grossRevenue / completedOrders : 0;

  // PromptPay share (review 2026-10-24): the page read
  // revenueByPaymentMethod[0] — groupBy returns groups in arbitrary order, so
  // a wallet-first store showed the WALLET figure labelled "PromptPay" (28%
  // when the truth was 66%) and an empty store rendered NaN%. Look the method
  // up by name and guard the division.
  const promptpayRevenue =
    revenueByPaymentMethod.find((p) => p.method === 'promptpay')?.total ?? 0;
  const promptpaySharePct =
    grossRevenue > 0 ? Math.round((promptpayRevenue / grossRevenue) * 100) : 0;

  // Month panel figures — scoped to THIS month (the panel previously showed
  // the all-time block under a hardcoded "กรกฎาคม 2026" header: ฿972 lifetime
  // presented as October's ฿312).
  const monthGross = Number(monthAgg._sum.totalAmountThb ?? 0);
  const monthDiscount = Number(monthAgg._sum.discountThb ?? 0);
  const monthVat = Math.round(Number(monthVatAgg._sum.vatAmountThb ?? 0) * 100) / 100;
  const monthRefund = Number(monthRefundsAgg._sum.amountThb ?? 0);
  // VAT is historical order data: use each order's saved VAT amount instead
  // of applying today's rate to revenue from orders placed under old settings.
  const vatGroups = await prisma.order.groupBy({
    by: ['vatEnabled'],
    where: { status: 'completed', vatEnabled: true },
    _sum: { vatAmountThb: true },
  });
  const vatCollected = Math.round(
    vatGroups.reduce((sum, group) => sum + Number(group._sum.vatAmountThb ?? 0), 0) * 100,
  ) / 100;

  // Returning-customer rate (review): numerator is every repeat customer in the
  // 500-customer analytical set, denominator is the active base.
  const repeatCustomers = repeatBase.filter((c) => (c._count?.orders ?? 0) >= 2).length;
  const activeBase = Math.max(activeCustomers, 1);
  const averageOrdersPerCustomer = Math.round((completedOrders / activeBase) * 10) / 10;
  const averageCustomerLifetimeValue = Math.round((grossRevenue / activeBase) * 100) / 100;
  const returningCustomerRate = Math.round((repeatCustomers / activeBase) * 1000) / 10;

  return NextResponse.json({
    sales: {
      todayOrders: todayAgg._count._all,
      todayRevenue: Number(todayAgg._sum.totalAmountThb ?? 0),
      todayCompleted: todayStatusCount('completed'),
      // No writer ever sets Order.status='failed' (the failed writers are
      // emailOutbox/paymentAttempt) — 'expired' is the real dead-order term.
      todayFailed: todayStatusCount('expired'),
      pendingManualFulfilment: statusCount('pending_manual_fulfilment'),
      lowStockAlerts: lowStock.length,
      weekOrders: weekAgg._count._all,
      weekRevenue: Number(weekAgg._sum.totalAmountThb ?? 0),
      monthOrders: monthAgg._count._all,
      monthRevenue: monthGross,
    },
    revenue: {
      grossRevenue,
      netRevenue: grossRevenue - discounts,
      vatCollected,
      refundAmount,
      discountAmount: discounts,
      averageOrderValue,
      revenueByDay,
      revenueByPaymentMethod,
      promptpaySharePct,
      revenueThisMonth: {
        grossRevenue: monthGross,
        netRevenue: monthGross - monthDiscount,
        vatCollected: monthVat,
        discountAmount: monthDiscount,
        refundAmount: monthRefund,
      },
    },
    products: {
      topProducts: topItemGroups.map((t) => ({
        productId: t.variantId,
        name: t.productNameTh,
        totalSold: t._sum.quantity ?? 0,
        totalRevenue: Number(t._sum.lineTotalThb ?? 0),
      })),
    },
    customers: {
      totalCustomers,
      activeCustomers,
      newCustomersThisMonth: newCustomers,
      averageOrdersPerCustomer,
      averageCustomerLifetimeValue,
      returningCustomerRate,
    },
    stock: {
      totalUnits: stockAgg._sum.stock ?? 0,
      variantCount: stockAgg._count._all,
      lowStock: lowStock.map((v) => ({
        id: v.id,
        sku: v.label,
        name: v.product.name,
        stock: v.stock,
        threshold: LOW_STOCK_THRESHOLD,
      })),
    },
    recentOrders: recentOrders.map((o) => ({
      id: o.orderNumber,
      // PII: a dashboard:read role without customers:read:full gets the
      // masked email (regression-asserted in admin-pii-masking).
      customer: canSeeFullPii ? o.customerEmail : maskEmail(o.customerEmail),
      product: o.items[0]?.productNameTh ?? '—',
      amount: Number(o.totalAmountThb),
      status: o.status,
      time: o.createdAt.toISOString(),
      payment: o.paymentMethod ?? '',
    })),
  });
}
