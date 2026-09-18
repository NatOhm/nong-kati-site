import { NextRequest, NextResponse } from 'next/server';

import { createOrder } from '@/api/orders';
import { getCustomerFromToken } from '@/api/customerAuth';

export const dynamic = 'force-dynamic';

const COOKIE = 'nk_session';

/** Map internal error codes to HTTP status. */
function statusFor(code: string): number {
  switch (code) {
    case 'CART_EMPTY':
    case 'TOS_NOT_ACCEPTED':
    case 'INVALID_EMAIL':
    case 'INVALID_QUANTITY':
    case 'VARIANT_NOT_FOUND':
      return 400;
    default:
      return 500;
  }
}

/**
 * POST /api/v1/orders — create a pending_payment order.
 * Body: CreateOrderInput; items are {variantId, quantity} references —
 * price/stock are re-read from the DB server-side (client prices ignored).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON' } }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // Attach customer id when logged in (session cookie).
  let customerId: string | null = null;
  const token = req.cookies.get(COOKIE)?.value;
  if (token) {
    try {
      const customer = await getCustomerFromToken(token);
      if (customer) customerId = customer.id;
    } catch {
      // invalid cookie — treat as guest
    }
  }

  try {
    const result = await createOrder({
      customerEmail: String(b['customerEmail'] ?? ''),
      ...(typeof b['customerPhone'] === 'string'
        ? { customerPhone: b['customerPhone'] as string }
        : {}),
      paymentMethod: 'promptpay',
      lineOptIn: false,
      marketingOptIn: b['marketingOptIn'] === true,
      tosAccepted: b['tosAccepted'] === true,
      tosVersion: '1.0',
      requiresTaxInvoice: b['requiresTaxInvoice'] === true,
      ...(typeof b['taxInvoiceName'] === 'string'
        ? { taxInvoiceName: b['taxInvoiceName'] as string }
        : {}),
      ...(typeof b['taxInvoiceTaxId'] === 'string'
        ? { taxInvoiceTaxId: b['taxInvoiceTaxId'] as string }
        : {}),
      items: Array.isArray(b['items'])
        ? (b['items'] as { variantId?: unknown; quantity?: unknown }[]).map((i) => ({
            variantId: String(i['variantId'] ?? ''),
            quantity: Number(i['quantity'] ?? 0),
          }))
        : [],
      ...(typeof b['couponCode'] === 'string' ? { couponCode: b['couponCode'] as string } : {}),
      customerId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const code = err instanceof Error ? err.message : 'ORDER_CREATE_FAILED';
    return NextResponse.json({ error: { code } }, { status: statusFor(code) });
  }
}
