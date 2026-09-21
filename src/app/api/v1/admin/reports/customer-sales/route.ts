import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/** Orders that count as revenue (confirmed or fulfilled — never pending/failed). */
const REVENUE_STATUSES = ['payment_confirmed', 'code_delivered', 'completed'];

/**
 * GET /api/v1/admin/reports/customer-sales?period=all|month (reports:read)
 *
 * Per-customer purchase statistics (client ask: "สถิติตัวแทน/สมาชิกที่ซื้อสินค้า —
 * ดูได้ว่าสมาชิกคนไหนทำยอดขายได้เท่าไร"). Revenue-recognized orders only.
 * Profit per customer = Σ(lineTotal − unitCostExVat × qty) using the variant's
 * costThb; items without a cost are excluded from profit, not zeroed (a null
 * cost is "unknown", not "free").
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'reports:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get('period') === 'month' ? 'month' : 'all';
  const since = new Date();
  if (period === 'month') since.setDate(1), since.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: REVENUE_STATUSES },
      customerId: { not: null },
      ...(period === 'month' ? { createdAt: { gte: since } } : {}),
    },
    select: {
      id: true,
      items: {
        select: {
          quantity: true,
          lineTotalThb: true,
          variant: { select: { costThb: true, price: true } },
        },
      },
      customer: {
        select: { id: true, email: true, fullName: true, tier: true, walletBalanceThb: true },
      },
    },
  });

  interface Agg {
    customerId: string;
    email: string;
    fullName: string | null;
    tier: string;
    walletBalanceThb: number;
    orders: number;
    units: number;
    spendThb: number;
    profitThb: number;
    profitKnownThb: number;
  }
  const byCustomer = new Map<string, Agg>();
  for (const o of orders) {
    if (!o.customer) continue;
    const c = o.customer;
    let row = byCustomer.get(c.id);
    if (!row) {
      row = {
        customerId: c.id,
        email: c.email,
        fullName: c.fullName,
        tier: c.tier,
        walletBalanceThb: Number(c.walletBalanceThb),
        orders: 0,
        units: 0,
        spendThb: 0,
        profitThb: 0,
        profitKnownThb: 0,
      };
      byCustomer.set(c.id, row);
    }
    row.orders += 1;
    for (const item of o.items) {
      const qty = item.quantity;
      const line = Number(item.lineTotalThb);
      row.units += qty;
      row.spendThb += line;
      const cost = item.variant?.costThb;
      if (cost != null) {
        row.profitThb += line - Number(cost) * qty;
        row.profitKnownThb += line;
      }
    }
  }

  const rows = [...byCustomer.values()]
    .sort((a, b) => b.spendThb - a.spendThb)
    .map((r) => ({
      customerId: r.customerId,
      email: r.email,
      fullName: r.fullName,
      tier: r.tier,
      walletBalanceThb: r.walletBalanceThb,
      orders: r.orders,
      units: r.units,
      spendThb: r.spendThb,
      // Profit covers only costed items; pct relative to those items' revenue.
      profitThb: r.profitThb,
      profitCoveragePct: r.spendThb > 0 ? Math.round((r.profitKnownThb / r.spendThb) * 100) : 0,
    }));

  const totals = rows.reduce(
    (t, r) => ({
      orders: t.orders + r.orders,
      units: t.units + r.units,
      spendThb: t.spendThb + r.spendThb,
      profitThb: t.profitThb + r.profitThb,
    }),
    { orders: 0, units: 0, spendThb: 0, profitThb: 0 },
  );

  return NextResponse.json({ period, customers: rows, totals });
}
