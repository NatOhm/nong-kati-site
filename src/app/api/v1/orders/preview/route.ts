import { NextRequest, NextResponse } from 'next/server';

import { previewOrder } from '@/api/orders';
import { getCustomerFromToken } from '@/api/customerAuth';

export const dynamic = 'force-dynamic';

const COOKIE = 'nk_session';

/** POST /api/v1/orders/preview — server-side pricing preview, no write. */
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
    const result = await previewOrder({
      customerEmail: String(b['customerEmail'] ?? b['email'] ?? ''),
      customerId: customerId ?? null,
      items: Array.isArray(b['items'])
        ? (b['items'] as { variantId?: unknown; quantity?: unknown }[]).map((i) => ({
            variantId: String(i['variantId'] ?? ''),
            quantity: Number(i['quantity'] ?? 0),
          }))
        : [],
      ...(typeof b['couponCode'] === 'string' ? { couponCode: b['couponCode'] as string } : {}),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const code = err instanceof Error ? err.message : 'PREVIEW_FAILED';
    return NextResponse.json({ error: { code } }, { status: 400 });
  }
}
