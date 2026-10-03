import { NextRequest, NextResponse } from 'next/server';

import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { getOrderById } from '@/api/orders';
import { sendOrderConfirmationEmail } from '@/api/orderLookup';

export const dynamic = 'force-dynamic';

const fail = (code: string, status: number): NextResponse =>
  NextResponse.json({ error: code }, { status });

/**
 * POST /api/v1/admin/orders/[id]/resend-email — re-send the order
 * confirmation to the customer (orders:write). 07-api.md §22.
 *
 * Used when delivery fails or the customer never received it. The send itself
 * is the shared `sendOrderConfirmationEmail`, so this route and the customer
 * resend cannot drift apart on what the email says or how it retries.
 *
 * Unlike the customer path there is no email-match check: the caller is an
 * authenticated staff member holding `orders:write`, so proving the order
 * belongs to the address they typed would be theatre. The address used is
 * always the order's own recorded `customerEmail` — never a caller-supplied
 * one, so this cannot be used to send order mail to an arbitrary recipient.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = getAdminToken(req);
  if (!token) return fail('UNAUTHENTICATED', 401);

  const check = await checkPermission(token, 'orders:write');
  if (!check.allowed) return fail(check.error ?? 'FORBIDDEN', 403);

  const { id } = await ctx.params;

  const order = await getOrderById(id);
  if (!order) return fail('ORDER_NOT_FOUND', 404);

  const result = await sendOrderConfirmationEmail(order);
  if (!result.success) {
    // Report the failure honestly rather than claiming a resend that never
    // happened — but report it as one of THIS API's codes.
    //
    // `result.error` is a transport string from lib/email/resend.ts
    // (`EMAIL_NOT_CONFIGURED: …`, `EMAIL_PROVIDER_ERROR: …`), not a route
    // code. Putting it in `error` meant the order modal's
    // `msg.includes('EMAIL_SEND_FAILED')` branch could never match, so every
    // outage fell through to the generic "try again" and the specific message
    // written for it was unreachable. Normalise the code here and keep the
    // provider text in `detail`, the way settings/email-test does.
    const detail = (result.error ?? 'unknown email failure').slice(0, 300);
    console.error(`[resend-email] ${order.orderNumber} → ${detail}`);
    return NextResponse.json({ error: 'EMAIL_SEND_FAILED', detail }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    data: { orderId: id, orderNumber: order.orderNumber, sentTo: order.customerEmail },
  });
}
