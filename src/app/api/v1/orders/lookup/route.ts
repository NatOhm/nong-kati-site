import { NextRequest, NextResponse } from 'next/server';

import { lookupOrder } from '@/api/orderLookup';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/orders/lookup — guest order retrieval by email + order number
 * (UF-03). lookupOrder implements the no-enumeration guard: "not found" and
 * "wrong email" return the identical generic error.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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
