import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * POST /api/v1/admin/pricing/bulk — set member/dealer prices across all
 * active variants as a percentage of each variant's retail price
 * (products:write). Body:
 *   { memberPercent?: number, dealerPercent?: number, onlyMissing?: boolean,
 *     apply?: boolean }
 * - Percent 0–99; a tier is only touched when its percent is provided.
 * - Rounding: to 2 decimals (variant prices are decimal).
 * - onlyMissing: only fill variants where that tier price is still null.
 * - apply=false (default) is a dry run: returns the would-be changes without
 *   writing. apply=true writes and returns the applied changes.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'products:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const pct = (raw: unknown): number | null => {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 99 ? n : NaN;
  };
  const memberPercent = pct(b['memberPercent']);
  const dealerPercent = pct(b['dealerPercent']);
  if (Number.isNaN(memberPercent) || Number.isNaN(dealerPercent)) {
    return NextResponse.json({ error: 'INVALID_PERCENT' }, { status: 400 });
  }
  if (memberPercent === null && dealerPercent === null) {
    return NextResponse.json({ error: 'NOTHING_TO_DO' }, { status: 400 });
  }
  const onlyMissing = b['onlyMissing'] === true;
  const apply = b['apply'] === true;

  const variants = await prisma.productVariant.findMany({
    where: { isActive: true, product: { isActive: true } },
    select: {
      id: true,
      price: true,
      memberPrice: true,
      dealerPrice: true,
      product: { select: { name: true } },
    },
  });

  const round2 = (n: number): number => Math.round(n * 100) / 100;
  const changes: {
    variantId: string;
    product: string;
    retail: number;
    member: number | null;
    dealer: number | null;
  }[] = [];

  for (const v of variants) {
    const retail = Number(v.price);
    const patch: { memberPrice?: number | null; dealerPrice?: number | null } = {};
    if (memberPercent !== null && (!onlyMissing || v.memberPrice === null)) {
      patch.memberPrice = round2((retail * memberPercent) / 100);
    }
    if (dealerPercent !== null && (!onlyMissing || v.dealerPrice === null)) {
      patch.dealerPrice = round2((retail * dealerPercent) / 100);
    }
    if (Object.keys(patch).length === 0) continue;
    changes.push({
      variantId: v.id,
      product: v.product.name,
      retail,
      member: patch.memberPrice ?? (v.memberPrice === null ? null : Number(v.memberPrice)),
      dealer: patch.dealerPrice ?? (v.dealerPrice === null ? null : Number(v.dealerPrice)),
    });
    if (apply) {
      await prisma.productVariant.update({ where: { id: v.id }, data: patch });
    }
  }

  return NextResponse.json({
    dryRun: !apply,
    matchedVariants: variants.length,
    changedVariants: changes.length,
    changes: changes.slice(0, 50),
    truncated: changes.length > 50,
  });
}
