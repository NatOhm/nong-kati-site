/**
 * GET /api/v1/internal/sellable-health — is the shop actually sellable?
 *
 * WHY THIS EXISTS
 * `/api/v1/health` proves only that the app reached the database. On 2026-11-19
 * every health check was green while the catalog served 29 published products
 * with a sellable total of ZERO: every variant was out of stock and the last 13
 * `available` GiftCodes were detached from any variant (`variantId IS NULL`), so
 * they counted as inventory and appeared in no product row. The storefront
 * rendered normally and nothing could be bought — and no monitor looked at it.
 *
 * WHAT IT REPORTS (read-only: three SELECTs, no writes anywhere)
 *   sellableUnits           Σ min(stock, available codes) over active variants
 *                           of published products — the same number the catalog
 *                           and the pricing resolver use
 *   publishedProducts       active products
 *   sellableProducts        the subset with at least one sellable unit
 *   detachedAvailableCodes  `available` GiftCodes with no variant
 *
 * AUTH mirrors the sibling internal sweeps: `NK_CRON_SECRET` via `x-cron-token`
 * (or `x-outbox-token` / Bearer), timing-safe, and an unconfigured secret fails
 * CLOSED with 503. There is no admin-JWT fallback because no panel action reads
 * this — fixed by `tests/prod-health-monitor.test.ts` G12.
 *
 * CONSUMER: `scripts/check-sellable.mjs`, run by
 * `.github/workflows/prod-health-monitor.yml`. The checker recomputes the
 * verdict from the numbers rather than trusting `ok` here, so a bug in this
 * route cannot silence the check it feeds.
 */
import { NextRequest, NextResponse } from 'next/server';

import { constantTimeEquals } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { summarizeSellable } from '@/lib/sellableHealth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env['NK_CRON_SECRET'];
  if (!secret) {
    // Not configured → disabled, fail-closed. An unauthenticated view of the
    // shop's inventory is not secret, but a monitor that answers "fine" while
    // nobody can authenticate is worse than one that says it is off.
    return NextResponse.json({ error: 'SELLABLE_CHECK_DISABLED' }, { status: 503 });
  }

  const bearer = req.headers.get('authorization');
  const headerToken = req.headers.get('x-cron-token') ?? req.headers.get('x-outbox-token') ?? '';
  const bearerToken = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  const token = headerToken || bearerToken;

  if (!token || !constantTimeEquals(token, secret)) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const [variants, publishedProducts, detachedAvailableCodes] = await Promise.all([
    prisma.productVariant.findMany({
      // The same population the catalog serves: active variant of an active
      // product. An inactive variant is hidden from the storefront and must
      // not be counted as sellable here either.
      where: { isActive: true, product: { isActive: true } },
      select: {
        productId: true,
        stock: true,
        _count: { select: { giftCodes: { where: { status: 'available' } } } },
      },
    }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.giftCode.count({ where: { status: 'available', variantId: null } }),
  ]);

  const summary = summarizeSellable({
    publishedProducts,
    detachedAvailableCodes,
    variants: variants.map((v) => ({
      productId: v.productId,
      stock: v.stock,
      codesAvailable: v._count.giftCodes,
    })),
  });

  return NextResponse.json(
    { ...summary, checkedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
