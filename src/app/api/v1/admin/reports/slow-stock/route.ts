import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

const SETTING_KEY = 'slow_stock';
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

async function getSlowStockDays(): Promise<number> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: SETTING_KEY } });
    if (!row) return DEFAULT_DAYS;
    const parsed: unknown = JSON.parse(row.value);
    const days = (parsed as { days?: unknown })?.days;
    if (typeof days === 'number' && Number.isFinite(days) && days >= 1 && days <= MAX_DAYS)
      return Math.floor(days);
    return DEFAULT_DAYS;
  } catch {
    return DEFAULT_DAYS;
  }
}

/**
 * GET /api/v1/admin/reports/slow-stock — slow-moving stock report.
 * Variants with stock on hand that haven't sold in N days, ranked by
 * days-since-last-sale (never-sold = worst, ties broken by most stock).
 * The N is admin-configurable via the ?days= setter (persisted in SiteSetting).
 * Requires `reports:read`. Read-only computation — never touches stock.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'reports:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const days = await getSlowStockDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Last sale date per variant, straight from the stock ledger.
  const lastSales = await prisma.stockMove.groupBy({
    by: ['variantId'],
    where: { reason: 'sale' },
    _max: { createdAt: true },
  });
  const lastSaleMap = new Map(lastSales.map((s) => [s.variantId, s._max.createdAt]));

  const variants = await prisma.productVariant.findMany({
    where: { stock: { gt: 0 }, isActive: true, product: { isActive: true } },
    select: {
      id: true,
      label: true,
      stock: true,
      costThb: true,
      price: true,
      product: { select: { name: true, slug: true, sku: true } },
    },
  });

  const rows = variants
    .map((v) => {
      const last = lastSaleMap.get(v.id) ?? null;
      const daysSince = last
        ? Math.floor((Date.now() - last.getTime()) / (24 * 60 * 60 * 1000))
        : null;
      return {
        variantId: v.id,
        productName: v.product.name,
        productSlug: v.product.slug,
        sku: v.product.sku,
        label: v.label,
        stock: v.stock,
        costThb: v.costThb == null ? null : Number(v.costThb),
        stockValueThb: v.costThb == null ? null : Number(v.costThb) * v.stock,
        priceThb: Number(v.price),
        lastSaleAt: last?.toISOString() ?? null,
        daysSinceLastSale: daysSince,
        neverSold: daysSince === null,
      };
    })
    .filter((r) => r.neverSold || r.daysSinceLastSale! >= days)
    .sort((a, b) => {
      // Never-sold first (worst), then most days since sale, then most capital stuck.
      if (a.neverSold !== b.neverSold) return a.neverSold ? -1 : 1;
      const da = a.daysSinceLastSale ?? 0;
      const db = b.daysSinceLastSale ?? 0;
      if (da !== db) return db - da;
      return (b.stockValueThb ?? 0) - (a.stockValueThb ?? 0);
    });

  const totalStockValueThb = rows.reduce((s, r) => s + (r.stockValueThb ?? 0), 0);
  const neverSoldCount = rows.filter((r) => r.neverSold).length;

  return NextResponse.json({
    days,
    totals: {
      variants: rows.length,
      units: rows.reduce((s, r) => s + r.stock, 0),
      stockValueThb: Number(totalStockValueThb.toFixed(2)),
      neverSoldCount,
    },
    rows,
  });
}

/**
 * PUT /api/v1/admin/reports/slow-stock — set the N-days threshold.
 * Body: { days: number }. Requires `settings:write` (it's a persisted setting).
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  let body: { days?: unknown };
  try {
    body = (await req.json()) as { days?: unknown };
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const days = Number(body.days);
  if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) {
    return NextResponse.json(
      { error: 'INVALID_DAYS', detail: `days must be 1-${MAX_DAYS}` },
      { status: 400 },
    );
  }

  const value = JSON.stringify({ days: Math.floor(days) });
  await prisma.siteSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value },
    create: { key: SETTING_KEY, value },
  });

  return NextResponse.json({ days: Math.floor(days) });
}
