import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
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
 * Requires reports:read.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'reports:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const today = dayStart(0);
  const weekAgo = dayStart(6);
  const month = monthStart();

  const [todayAgg, weekAgg, monthAgg, allAgg, statusCounts, monthDiscountAgg, refundsAgg] =
    await Promise.all([
      prisma.order.aggregate({
        where: { createdAt: { gte: today } },
        _count: { _all: true },
        _sum: { totalAmountThb: true, discountThb: true },
      }),
      prisma.order.aggregate({
        where: { createdAt: { gte: weekAgo } },
        _count: { _all: true },
        _sum: { totalAmountThb: true },
      }),
      prisma.order.aggregate({
        where: { createdAt: { gte: month } },
        _count: { _all: true },
        _sum: { totalAmountThb: true },
      }),
      prisma.order.aggregate({
        where: { status: 'completed' },
        _count: { _all: true },
        _sum: { totalAmountThb: true, discountThb: true },
      }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.order.aggregate({
        where: { createdAt: { gte: month }, status: 'completed' },
        _sum: { discountThb: true },
      }),
      prisma.refund.aggregate({ _sum: { amountThb: true } }),
    ]);

  const statusCount = (s: string) => statusCounts.find((x) => x.status === s)?._count._all ?? 0;

  // Revenue by day (last 7 days, completed only)
  const revenueByDay: { date: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = dayStart(i);
    const end = dayStart(i - 1);
    const agg = await prisma.order.aggregate({
      where: { status: 'completed', completedAt: { gte: start, lt: end } },
      _sum: { totalAmountThb: true },
    });
    revenueByDay.push({
      date: start.toISOString().slice(0, 10),
      revenue: Number(agg._sum.totalAmountThb ?? 0),
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

  // Cost of goods + top products (completed orders)
  const topItemGroups = await prisma.orderItem.groupBy({
    by: ['variantId', 'productNameTh'],
    where: { order: { status: 'completed' } },
    _sum: { quantity: true, lineTotalThb: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 8,
  });
  const costItems = await prisma.orderItem.findMany({
    where: { order: { status: 'completed' } },
    select: { quantity: true, variant: { select: { costThb: true } } },
  });
  const totalCost = costItems.reduce(
    (sum, it) => sum + (it.variant.costThb === null ? 0 : Number(it.variant.costThb)) * it.quantity,
    0,
  );

  const itemsSoldAgg = await prisma.orderItem.aggregate({
    where: { order: { status: 'completed' } },
    _sum: { quantity: true },
  });

  // Customer analytics
  const [totalCustomers, activeCustomers, newCustomers, topCustomers] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { orders: { some: { status: 'completed' } } } }),
    prisma.customer.count({ where: { createdAt: { gte: month } } }),
    prisma.customer.findMany({
      where: { orders: { some: { status: 'completed' } } },
      select: {
        id: true,
        email: true,
        _count: { select: { orders: { where: { status: 'completed' } } } },
        orders: { where: { status: 'completed' }, select: { totalAmountThb: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
  ]);
  const customerTotals = topCustomers
    .map((c) => ({
      customerId: c.id,
      email: c.email,
      totalOrders: c._count.orders,
      totalSpend: c.orders.reduce((s, o) => s + Number(o.totalAmountThb), 0),
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 5);

  // Stock
  const [stockAgg, lowStock] = await Promise.all([
    prisma.productVariant.aggregate({ _sum: { stock: true }, _count: { _all: true } }),
    prisma.productVariant.findMany({
      where: { stock: { lte: 5 }, isActive: true },
      orderBy: { stock: 'asc' },
      take: 8,
      select: { id: true, label: true, stock: true, product: { select: { name: true } } },
    }),
  ]);

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
  const profit = grossRevenue - discounts - totalCost;
  const completedOrders = allAgg._count._all;
  const averageOrderValue = completedOrders > 0 ? grossRevenue / completedOrders : 0;
  // ราคาขายรวม VAT แล้ว — VAT ที่เก็บจริง = ยอด − ยอด/1.07
  const vatCollected = Math.round((grossRevenue - grossRevenue / 1.07) * 100) / 100;

  // Returning-customer rate: customers with ≥2 completed orders.
  const repeatCustomers = customerTotals.filter((c) => c.totalOrders >= 2).length;
  const activeBase = Math.max(activeCustomers, 1);
  const averageOrdersPerCustomer = Math.round((completedOrders / activeBase) * 10) / 10;
  const averageCustomerLifetimeValue = Math.round((grossRevenue / activeBase) * 100) / 100;
  const returningCustomerRate = Math.round((repeatCustomers / activeBase) * 1000) / 10;

  // Category performance (completed order items → variant → product → category)
  const categoryGroups = await prisma.product.groupBy({
    by: ['categoryId'],
    _count: { _all: true },
  });
  const categories = await prisma.category.findMany({
    select: { id: true, name: true },
  });
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const categoryRevenue = await prisma.orderItem.groupBy({
    by: ['variantId'],
    where: { order: { status: 'completed' } },
    _sum: { lineTotalThb: true, quantity: true },
  });
  // resolve variant → product → category once
  const variantIds = categoryRevenue.map((c) => c.variantId);
  const variantProducts = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, productId: true },
  });
  const v2p = new Map(variantProducts.map((v) => [v.id, v.productId]));
  const catPerf = new Map<string, { name: string; orderCount: number; revenue: number }>();
  for (const row of categoryRevenue) {
    const pid = v2p.get(row.variantId);
    if (!pid) continue;
    const prod = await prisma.product.findUnique({
      where: { id: pid },
      select: { categoryId: true },
    });
    if (!prod) continue;
    const entry = catPerf.get(prod.categoryId) ?? {
      name: catName.get(prod.categoryId) ?? prod.categoryId,
      orderCount: 0,
      revenue: 0,
    };
    entry.revenue += Number(row._sum.lineTotalThb ?? 0);
    entry.orderCount += row._sum.quantity ?? 0;
    catPerf.set(prod.categoryId, entry);
  }

  return NextResponse.json({
    sales: {
      todayOrders: todayAgg._count._all,
      todayRevenue: Number(todayAgg._sum.totalAmountThb ?? 0),
      todayCompleted: statusCount('completed'),
      todayFailed: statusCount('failed') + statusCount('expired'),
      pendingManualFulfilment: statusCount('pending_manual_fulfilment'),
      lowStockAlerts: lowStock.length,
      weekOrders: weekAgg._count._all,
      weekRevenue: Number(weekAgg._sum.totalAmountThb ?? 0),
      monthOrders: monthAgg._count._all,
      monthRevenue: Number(monthAgg._sum.totalAmountThb ?? 0),
      completedOrders,
      itemsSold: itemsSoldAgg._sum.quantity ?? 0,
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
    },
    profitReport: {
      revenueThb: grossRevenue,
      discountsThb: discounts,
      costThb: totalCost,
      grossProfitThb: Math.round(profit * 100) / 100,
      codNote: 'ร้านรับชำระผ่านพร้อมเพย์/บัตร — ไม่มียอดเก็บปลายทางในระบบ',
    },
    products: {
      topProducts: topItemGroups.map((t) => ({
        productId: t.variantId,
        name: t.productNameTh,
        totalSold: t._sum.quantity ?? 0,
        totalRevenue: Number(t._sum.lineTotalThb ?? 0),
      })),
      categoryPerformance: [...catPerf.entries()]
        .map(([categoryId, v]) => ({
          categoryId,
          name: v.name,
          orderCount: v.orderCount,
          revenue: v.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    },
    customers: {
      totalCustomers,
      activeCustomers,
      newCustomersThisMonth: newCustomers,
      averageOrdersPerCustomer,
      averageCustomerLifetimeValue,
      returningCustomerRate,
      topCustomers: customerTotals,
    },
    stock: {
      totalUnits: stockAgg._sum.stock ?? 0,
      variantCount: stockAgg._count._all,
      lowStock: lowStock.map((v) => ({
        id: v.id,
        sku: v.label,
        name: v.product.name,
        stock: v.stock,
        threshold: 5,
      })),
    },
    recentOrders: recentOrders.map((o) => ({
      id: o.orderNumber,
      customer: o.customerEmail,
      product: o.items[0]?.productNameTh ?? '—',
      amount: Number(o.totalAmountThb),
      status: o.status,
      time: o.createdAt.toISOString(),
      payment: o.paymentMethod ?? '',
    })),
  });
}
