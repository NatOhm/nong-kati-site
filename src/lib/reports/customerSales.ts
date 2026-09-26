/**
 * Customer-sales report — shared aggregation, PII masking, and CSV writing.
 *
 * Single masking source: the JSON response
 * (/api/v1/admin/reports/customer-sales) and the server-side CSV export
 * (/api/v1/admin/reports/customer-sales/export) MUST run the exact same
 * rows through maskCustomerSalesRows() before serving — a role without
 * `customers:read:full` can never obtain raw identity data in either form.
 * (Regression coverage: tests/admin-pii-masking.test.ts asserts masked
 * emails in the JSON AND inside the downloaded CSV file itself.)
 *
 * CSV cells are additionally guarded against spreadsheet formula injection
 * (=, +, -, @, TAB, CR prefixes) because customer-controlled strings (names,
 * emails) land verbatim in a file staff will open in Excel/Sheets.
 */
import { prisma } from '@/lib/db';

import { maskEmail } from '@/lib/rbac';

/** Orders that count as revenue (confirmed or fulfilled — never pending/failed). */
const REVENUE_STATUSES = ['payment_confirmed', 'code_delivered', 'completed'];

/** Aggregation output before permission-scoped shaping. */
export interface CustomerSalesRawRow {
  customerId: string;
  email: string;
  fullName: string | null;
  tier: string;
  walletBalanceThb: number;
  orders: number;
  units: number;
  spendThb: number;
  profitThb: number;
  profitCoveragePct: number;
}

/** API/CSV row after permission-scoped shaping (masked or full). */
export interface CustomerSalesRow {
  customerId: string;
  email: string;
  fullName?: string | null;
  tier: string;
  walletBalanceThb?: number;
  orders: number;
  units: number;
  spendThb: number;
  profitThb: number;
  profitCoveragePct: number;
}

/**
 * Per-customer purchase statistics over revenue-recognized orders.
 * Profit per customer = Σ(lineTotal − unitCost × qty) using the variant's
 * costThb; items without a cost are excluded from profit, not zeroed (a
 * null cost is "unknown", not "free"). Sorted by spend, descending.
 */
export async function aggregateCustomerSales(
  period: 'all' | 'month',
): Promise<CustomerSalesRawRow[]> {
  const since = new Date();
  if (period === 'month') {
    since.setDate(1);
    since.setHours(0, 0, 0, 0);
  }

  const orders = await prisma.order.findMany({
    where: {
      status: { in: REVENUE_STATUSES },
      customerId: { not: null },
      ...(period === 'month' ? { createdAt: { gte: since } } : {}),
    },
    select: {
      items: {
        select: {
          quantity: true,
          lineTotalThb: true,
          variant: { select: { costThb: true } },
        },
      },
      customer: {
        select: { id: true, email: true, fullName: true, tier: true, walletBalanceThb: true },
      },
    },
  });

  const byCustomer = new Map<
    string,
    Omit<CustomerSalesRawRow, 'profitCoveragePct'> & { profitKnownThb: number }
  >();
  for (const o of orders) {
    const c = o.customer;
    if (!c) continue;
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

  return [...byCustomer.values()]
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
      profitThb: r.profitThb,
      // Profit covers only costed items; pct relative to those items' revenue.
      profitCoveragePct: r.spendThb > 0 ? Math.round((r.profitKnownThb / r.spendThb) * 100) : 0,
    }));
}

/**
 * Permission-scoped shaping — THE one place identity is masked for this
 * report. Roles holding `customers:read:full` keep raw email + name +
 * wallet balance; everyone else gets masked email only (u***@domain), no
 * name, no wallet balance.
 */
export function maskCustomerSalesRows(
  rows: CustomerSalesRawRow[],
  canSeeFullPii: boolean,
): CustomerSalesRow[] {
  return rows.map((r) => ({
    customerId: r.customerId,
    email: canSeeFullPii ? r.email : maskEmail(r.email),
    ...(canSeeFullPii ? { fullName: r.fullName } : {}),
    tier: r.tier,
    ...(canSeeFullPii ? { walletBalanceThb: r.walletBalanceThb } : {}),
    orders: r.orders,
    units: r.units,
    spendThb: r.spendThb,
    profitThb: r.profitThb,
    profitCoveragePct: r.profitCoveragePct,
  }));
}

/**
 * True when a string would be interpreted as a formula by Excel/Sheets
 * (OWASP CSV injection). Customer emails/names must never start with these.
 */
export function isFormulaInjection(value: string): boolean {
  return /^[=+\-@\t\r]/.test(value);
}

/** One CSV cell: formula-neutralized + quote-escaped + always quoted. */
function csvCell(value: string | number): string {
  const raw = typeof value === 'number' ? String(value) : value;
  const guarded = isFormulaInjection(raw) ? `'${raw}` : raw;
  return `"${guarded.replaceAll('"', '""')}"`;
}

/**
 * Serialize shaped rows to a UTF-8-BOM CSV (BOM so Excel reads the Thai
 * headers correctly). Rows must already be shaped by maskCustomerSalesRows —
 * this function writes what it is given, nothing more.
 */
export function toCustomerSalesCsv(rows: CustomerSalesRow[]): string {
  const header = [
    'อีเมล',
    'ชื่อ',
    'ระดับ',
    'ออเดอร์',
    'ชิ้น',
    'ยอดซื้อ (บาท)',
    'กำไร (บาท)',
    'กำไรครอบคลุมข้อมูลต้นทุน (%)',
    'วอลเล็ต (บาท)',
  ];
  const lines = rows.map((r) =>
    [
      r.email,
      r.fullName ?? '',
      r.tier,
      r.orders,
      r.units,
      r.spendThb.toFixed(2),
      r.profitThb.toFixed(2),
      r.profitCoveragePct,
      (r.walletBalanceThb ?? 0).toFixed(2),
    ]
      .map(csvCell)
      .join(','),
  );
  return '\uFEFF' + [header.map(csvCell).join(','), ...lines].join('\n');
}
