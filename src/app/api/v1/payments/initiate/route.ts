import { NextRequest, NextResponse } from 'next/server';

import { OmiseAdapter } from '@/lib/payment/omise';
import { gatewayCircuitBreaker, GatewayUnavailableError } from '@/lib/payment/circuitBreaker';
import { getOrderById } from '@/api/orders';
import { prisma } from '@/lib/db';
import { notifyNewOrder } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/**
 * Lazy singleton — the adapter must NOT be constructed at module import:
 * Next collects route modules at BUILD time, and the fail-closed constructor
 * throws when production credentials are absent (as in CI), breaking the
 * whole build. Constructing lazily means a missing-config error becomes a
 * runtime 503 from THIS route instead of a failed deploy.
 */
let gateway: OmiseAdapter | null = null;
function getGateway(): OmiseAdapter {
  if (!gateway) gateway = new OmiseAdapter();
  return gateway;
}

/**
 * POST /api/v1/payments/initiate — create a PromptPay charge for an order.
 * Audit #1: the real Opn/Omise integration is implemented — with real keys
 * this creates a live PromptPay charge (amount in satang, server-
 * authoritative) and returns the bank QR (downloaded server-side behind
 * secret-key auth, handed to the browser as a data URI). Mock mode
 * (NK_PAYMENT_MOCK=true, nonproduction only) still simulates for staging.
 * The payment attempt row is always persisted so the status endpoint and
 * webhook can find it. Fires the new-order Discord notification.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON' } }, { status: 400 });
  }
  const orderId = String((body as Record<string, unknown>)?.['orderId'] ?? '');
  if (!orderId) {
    return NextResponse.json({ error: { code: 'ORDER_ID_REQUIRED' } }, { status: 400 });
  }

  const order = await getOrderById(orderId);
  if (!order || order.status !== 'pending_payment') {
    return NextResponse.json({ error: { code: 'ORDER_NOT_PAYABLE' } }, { status: 400 });
  }

  const amountSatang = Math.round(Number(order.totalAmountThb) * 100);

  let chargeId: string;
  let qrImageUri: string | undefined;
  let expiresAt: Date | undefined;
  try {
    const result = await gatewayCircuitBreaker.call(() =>
      getGateway().createPromptPayCharge({
        amountSatang,
        orderNumber: order.orderNumber,
        currency: 'THB',
        description: `Nong-Kati Order ${order.orderNumber}`,
      }),
    );
    chargeId = result.chargeId;
    qrImageUri = result.qrImageUri;
    expiresAt = result.expiresAt;
  } catch (err) {
    if (err instanceof GatewayUnavailableError) {
      return NextResponse.json({ error: { code: 'SERVICE_UNAVAILABLE' } }, { status: 503 });
    }
    // Audit #1: the real integration exists, so any failure here is a
    // genuine gateway/config problem, not a "not implemented" gate. The
    // legacy marker stays mapped to the deliberate-gate response in case an
    // old deployment pin surfaces it.
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('not implemented')) {
      return NextResponse.json({ error: { code: 'PAYMENT_UNAVAILABLE' } }, { status: 503 });
    }
    return NextResponse.json({ error: { code: 'PAYMENT_INIT_FAILED' } }, { status: 502 });
  }

  const attempt = await prisma.paymentAttempt.create({
    data: {
      orderId: order.id,
      paymentMethod: 'promptpay',
      gatewayName: 'omise',
      amountThb: order.totalAmountThb,
      status: 'pending',
      gatewayRef: chargeId,
      qrExpiresAt: expiresAt ?? null,
    },
  });

  // Discord: new order (fire-and-forget — never blocks checkout).
  void notifyNewOrder({
    orderNumber: order.orderNumber,
    email: order.customerEmail,
    totalThb: Number(order.totalAmountThb),
    itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
    paymentMethod: 'promptpay',
  });

  return NextResponse.json({
    paymentAttemptId: attempt.id,
    qrImageUrl: qrImageUri,
    qrExpiresAt: expiresAt?.toISOString(),
    gatewayRef: chargeId,
  });
}
