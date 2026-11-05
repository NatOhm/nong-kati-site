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
 *   - per submitted email (10 / 15 min), counting EVERY attempt. The old
 *     bucket was peeked and consumed only on a match, which meant misses —
 *     i.e. the entire guessing attack — never spent it. Counting misses can
 *     cost one customer 15 minutes of this page (they still have the order
 *     link in their email); not counting them cost the cap entirely.
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

  // Lowercase so `A@b.co` and `a@B.co` share one bucket (the same case-variant
  // bypass the order-velocity email cap closes). Scoped by email, not by IP, so
  // it still binds when the guesses are spread across many addresses.
  const emailKey = email.toLowerCase();
  const emailLimit = await checkRateLimit('_order_lookup_email', emailKey);
  if (!emailLimit.allowed) return applyRateLimit('_order_lookup_email', emailKey, undefined);

  try {
    const result = await lookupOrder(email, orderNumber);
    if (!result.success || !result.order) {
      return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      order: { confirmationUuid: result.order.confirmationUuid },
    });
  } catch {
    return NextResponse.json({ error: { code: 'LOOKUP_FAILED' } }, { status: 500 });
  }
}
