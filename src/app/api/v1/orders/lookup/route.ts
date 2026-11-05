import { NextRequest, NextResponse } from 'next/server';

import { lookupOrder } from '@/api/orderLookup';
import { applyRateLimit, checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/orders/lookup — guest order retrieval by email + order number
 * (UF-03). lookupOrder implements the no-enumeration guard: "not found" and
 * "wrong email" return the identical generic error.
 *
 * Why this endpoint needs a limiter: it returns the order's
 * `confirmationUuid`, and that UUID opens `/orders/<uuid>` — a page that
 * decrypts and prints the delivered gift codes. Order numbers are sequential
 * (`NK-2026-000183`), so unlimited guessing of (email, orderNumber) pairs is
 * the cheapest way to reach somebody else's codes. Two buckets:
 *   - per-IP, checked before any DB work (10 / 15 min);
 *   - per submitted email (5 / 15 min), PEEKED before the query and consumed
 *     only when an order actually matched. Counting failures would let a
 *     stranger spend a victim's email quota with junk requests — the same
 *     reason `orders/route.ts` peeks that bucket.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const ipLimit = await checkRateLimit('/api/v1/orders/lookup', ip);
  if (!ipLimit.allowed) return applyRateLimit('/api/v1/orders/lookup', ip);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON' } }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b['email'] === 'string' ? b['email'].trim() : '';
  const orderNumber = typeof b['orderNumber'] === 'string' ? b['orderNumber'].trim() : '';
  if (!email || !orderNumber) {
    return NextResponse.json({ error: { code: 'MISSING_FIELDS' } }, { status: 400 });
  }

  // Trim + lowercase so `A@b.co` and `a@B.co` share one bucket (the same
  // case-variant bypass the order-velocity email cap closes).
  const emailKey = email.toLowerCase();
  const emailLimit = await checkRateLimit('_order_lookup_email', emailKey, undefined, {
    increment: false,
  });
  if (!emailLimit.allowed) return applyRateLimit('_order_lookup_email', emailKey, undefined);

  try {
    const result = await lookupOrder(email, orderNumber);
    if (!result.success || !result.order) {
      return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    }
    // Only a real match spends the email quota.
    await checkRateLimit('_order_lookup_email', emailKey);
    return NextResponse.json({
      success: true,
      order: { confirmationUuid: result.order.confirmationUuid },
    });
  } catch {
    return NextResponse.json({ error: { code: 'LOOKUP_FAILED' } }, { status: 500 });
  }
}
