import { NextRequest, NextResponse } from 'next/server';

import { checkCoupon } from '@/api/orders';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/coupons/validate — public coupon check for the checkout page.
 * Body: { code, subtotalThb }. Returns { ok, discountThb } or { ok: false, error }.
 * Server-authoritative: the same check runs again at order creation.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const code = typeof b['code'] === 'string' ? b['code'].trim().toUpperCase() : '';
  const subtotalThb = Number(b['subtotalThb'] ?? 0);
  if (!code || !Number.isFinite(subtotalThb) || subtotalThb < 0) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 });
  }

  const result = await checkCoupon(code, subtotalThb);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? 'INACTIVE' });
  }
  return NextResponse.json({ ok: true, discountThb: result.discountThb });
}
