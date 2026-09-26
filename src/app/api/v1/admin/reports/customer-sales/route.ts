import { NextRequest, NextResponse } from 'next/server';

import { checkPermission } from '@/lib/rbac';
import { aggregateCustomerSales, maskCustomerSalesRows } from '@/lib/reports/customerSales';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/admin/reports/customer-sales?period=all|month (reports:read)
 *
 * Per-customer purchase statistics (client ask: "สถิติตัวแทน/สมาชิกที่ซื้อสินค้า —
 * ดูได้ว่าสมาชิกคนไหนทำยอดขายได้เท่าไร"). Revenue-recognized orders only.
 *
 * Review [High]: full identity + wallet balance requires customers:read:full.
 * reports:read alone gets masked emails, no names, no wallet balances. The
 * shaping runs through maskCustomerSalesRows in lib/reports/customerSales —
 * the SAME function the CSV export uses, so a limited role can never obtain
 * raw PII in either form.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'reports:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get('period') === 'month' ? 'month' : 'all';
  const canSeeFullPii = check.payload?.perms.includes('customers:read:full') ?? false;

  const rows = maskCustomerSalesRows(await aggregateCustomerSales(period), canSeeFullPii);

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
