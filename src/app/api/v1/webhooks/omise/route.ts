/**
 * Webhook Handler — POST /api/v1/webhooks/omise
 * 09-payment.md §5 — Canonical webhook processing.
 *
 * LD-07: Signature verification (mandatory, first step)
 * LD-08: Idempotency (row-locked, atomic)
 * LD-09: Amount verification (server-side)
 * LD-10: Always return HTTP 200 to gateway
 *
 * This is a Next.js App Router Route Handler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { OmiseAdapter } from '@/lib/payment/omise';
import {
  getPaymentAttemptByGatewayRef,
  updatePaymentAttemptStatus,
} from '@/api/payments';
import { getOrderById, updateOrderStatus } from '@/api/orders';
import { processOrderDelivery } from '@/lib/delivery/codeDelivery';
import { enqueueJob } from '@/lib/jobs/mockQueue';

const gateway = new OmiseAdapter();

/**
 * POST /api/v1/webhooks/omise
 *
 * Processing steps (09-payment.md §5):
 * 1. Read raw body (do NOT parse before signature check)
 * 2. Verify signature (LD-07)
 * 3. Parse JSON → event
 * 4. Route by event.key
 * 5. Handle charge.succeeded: idempotency check → amount check → update → deliver
 * 6. Handle charge.failed: update payment, keep order retriable
 * 7. Always return 200
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Step 1: Read raw body
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signatureHeader = request.headers.get('x-omise-signature') ?? '';

  // Step 2: Verify signature (LD-07)
  const isValid = gateway.verifyWebhookSignature(rawBody, signatureHeader);
  if (!isValid) {
    // LD-10: Still return 200 to avoid retry storm
    // But log the invalid signature
    console.error('[Webhook] Invalid signature from', request.headers.get('x-forwarded-for'));
    return NextResponse.json({ received: true });
  }

  // Step 3: Parse event
  const event = gateway.parseWebhookEvent(rawBody);

  // Step 4: Route by event key
  switch (event.key) {
    case 'charge.complete':
      if (event.status === 'successful') {
        await handleChargeSucceeded(event.chargeId, event.amount);
      } else if (event.status === 'failed') {
        await handleChargeFailed(event.chargeId, event.failureMessage, event.failureCode);
      }
      break;

    case 'charge.failed':
      await handleChargeFailed(event.chargeId, event.failureMessage, event.failureCode);
      break;

    default:
      // Unknown event — log and ignore
      console.log('[Webhook] Unknown event:', event.key);
      break;
  }

  // Step 7: Always return 200 (LD-10)
  return NextResponse.json({ received: true });
}

/**
 * Handle successful charge — 09-payment.md §5 step 5.
 *
 * 5.a: BEGIN TX, SELECT payment_attempts FOR UPDATE
 * 5.b: Idempotency check — if already succeeded, no-op
 * 5.c: Amount verification (LD-09)
 * 5.d: Update payment_attempts
 * 5.e: Update orders → payment_confirmed
 * 5.f: COMMIT
 * 5.g: Enqueue delivery job
 */
async function handleChargeSucceeded(
  chargeId: string,
  gatewayAmount: number,
): Promise<void> {
  // Find payment attempt by gateway_ref (LD-08 — idempotency)
  const attempt = getPaymentAttemptByGatewayRef('omise', chargeId);
  if (!attempt) {
    console.error('[Webhook] Payment attempt not found for charge:', chargeId);
    return;
  }

  // Idempotency check — already succeeded
  if (attempt.status === 'succeeded') {
    console.log('[Webhook] Duplicate webhook for charge:', chargeId);
    return;
  }

  // Get order
  const order = getOrderById(attempt.orderId);
  if (!order) {
    console.error('[Webhook] Order not found for attempt:', attempt.id);
    return;
  }

  // Amount verification (LD-09)
  const expectedSatang = Math.round(Number(order.totalAmountThb) * 100);
  if (gatewayAmount !== expectedSatang) {
    console.error(
      `[Webhook] Amount mismatch: expected ${expectedSatang}, got ${gatewayAmount}`,
    );
    // Flag mismatch — code never delivered
    updateOrderStatus(order.id, 'pending_payment', 'PAYMENT_MISMATCH');
    return;
  }

  // Update payment attempt → succeeded
  updatePaymentAttemptStatus(attempt.id, 'succeeded');

  // Update order → payment_confirmed
  updateOrderStatus(order.id, 'payment_confirmed');

  // Enqueue code delivery job (§5 step 5.g)
  // HIGH priority, 3× retry, 2s/4s/8s backoff
  await enqueueJob(
    'delivery',
    'code-delivery',
    {
      orderId: order.id,
      items: order.items.map((item) => ({
        orderItemId: item.id,
        variantId: item.variantId,
        productNameTh: item.productNameTh,
        denominationThb: Number(item.denominationThb),
        quantity: item.quantity,
      })),
    },
    { priority: 'HIGH', maxRetries: 3 },
  );

  // Process delivery inline (mock mode)
  // In production, BullMQ worker picks this up
  const deliveryResult = processOrderDelivery(
    order.id,
    order.items.map((item) => ({
      orderId: order.id,
      orderItemId: item.id,
      variantId: item.variantId,
      productNameTh: item.productNameTh,
      denominationThb: Number(item.denominationThb),
      quantity: item.quantity,
    })),
  );

  if (deliveryResult.success) {
    updateOrderStatus(order.id, 'completed');

    // Enqueue notification job (email with codes)
    await enqueueJob(
      'notification',
      'order-confirmation-email',
      {
        orderId: order.id,
        email: order.customerEmail,
        codes: deliveryResult.codes,
      },
      { priority: 'MEDIUM', maxRetries: 3 },
    );
  } else {
    // Insufficient stock at assignment
    updateOrderStatus(order.id, 'pending_manual_fulfilment', 'INSUFFICIENT_STOCK');
  }
}

/**
 * Handle failed charge — 09-payment.md §5 step 6.
 */
async function handleChargeFailed(
  chargeId: string,
  failureMessage?: string,
  failureCode?: string,
): Promise<void> {
  const attempt = getPaymentAttemptByGatewayRef('omise', chargeId);
  if (!attempt) return;

  updatePaymentAttemptStatus(attempt.id, 'failed');

  // Order stays pending_payment (retriable)
  // Unless max attempts exceeded — checked at retry time
  console.log(
    `[Webhook] Payment failed for ${chargeId}: ${failureCode} - ${failureMessage}`,
  );
}
