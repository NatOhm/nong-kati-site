import { NextRequest, NextResponse } from 'next/server';

import { checkPermission } from '@/lib/rbac';
import {
  aggregateCustomerSales,
  maskCustomerSalesRows,
  toCustomerSalesCsv,
} from '@/lib/reports/customerSales';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/admin/reports/customer-sales/export?period=all|month
 * (reports:export — the PII-level gate rides on customers:read:full)
 *
 * Server-side CSV export of the per-customer purchase report. PII masking
 * happens BEFORE the file is written: rows pass through
 * maskCustomerSalesRows — the same function the JSON endpoint uses — so a
 * role that may view the report but lacks `customers:read:full` can only
 * ever download a CSV with masked identities (u***@domain, no names, no
 * wallet balances). Regression coverage asserts the masking inside the
 * downloaded file itself (tests/admin-pii-masking.test.ts) and the
 * spreadsheet formula-injection guard in the CSV writer.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'reports:export');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get('period') === 'month' ? 'month' : 'all';
  const canSeeFullPii = check.payload?.perms.includes('customers:read:full') ?? false;

  const rows = maskCustomerSalesRows(await aggregateCustomerSales(period), canSeeFullPii);
  const csv = toCustomerSalesCsv(rows);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="customer-sales-${period}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
