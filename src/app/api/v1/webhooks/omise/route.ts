/**
 * Webhook Handler — POST /api/v1/webhooks/omise
 * 09-payment.md §5 — Canonical webhook processing.
 *
 * LD-07: Signature verification (mandatory, first step)
 * LD-08: Idempotency (atomic claim of the order)
 * LD-09: Amount verification (server-side)
 * LD-10: Always return HTTP 200 to gateway
 *
 * Flow: verify signature → find PaymentAttempt by gatewayRef → verify amount
 * → claim order (pending_payment → payment_confirmed, atomic) → fulfil
 * (codes + stock + StockMove + completed) in one transaction.
 */

import { NextRequest, NextResponse } from 'next/server';
import { OmiseAdapter } from '@/lib/payment/omise';
import { prisma } from '@/lib/db';
import { getOrderById, claimOrderForConfirmation } from '@/api/orders';
import { fulfilOrder } from '@/lib/fulfilment';
import { getNotificationSettings, notifyPaymentConfirmed, notifyStockLow } from '@/lib/notify';

export const dynamic = 'force-dynamic';

const gateway = new OmiseAdapter();

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Step 1: Read raw body (before signature check)
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signatureHeader = request.headers.get('x-omise-signature') ?? '';

  // Step 2: Verify signature (LD-07)
  const isValid = gateway.verifyWebhookSignature(rawBody, signatureHeader);
  if (!isValid) {
    console.error('[Webhook] Invalid signature from', request.headers.get('x-forwarded-for'));
    return NextResponse.json({ received: true });
  }

  // Step 3-4: Parse and route
  const event = gateway.parseWebhookEvent(rawBody);

  if (event.key === 'charge.complete' || event.key === 'charge.failed') {
    if (event.status === 'successful') {
      await handleChargeSucceeded(event.chargeId, event.amount);
    } else if (event.status === 'failed') {
      await handleChargeFailed(event.chargeId, event.failureMessage, event.failureCode);
    }
  } else {
    console.log('[Webhook] Unknown event:', event.key);
  }

  // LD-10: Always return 200
  return NextResponse.json({ received: true });
}

async function handleChargeSucceeded(chargeId: string, gatewayAmount: number): Promise<void> {
  // Idempotency: find the persisted attempt by gateway ref (LD-08)
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { gatewayName_gatewayRef: { gatewayName: 'omise', gatewayRef: chargeId } },
  });
  if (!attempt) {
    console.error('[Webhook] Payment attempt not found for charge:', chargeId);
    return;
  }
  if (attempt.status === 'succeeded') {
    console.log('[Webhook] Duplicate webhook for charge:', chargeId);
    return;
  }

  const order = await getOrderById(attempt.orderId);
  if (!order) {
    console.error('[Webhook] Order not found for attempt:', attempt.id);
    return;
  }

  // Amount verification (LD-09)
  const expectedSatang = Math.round(Number(order.totalAmountThb) * 100);
  if (gatewayAmount !== expectedSatang) {
    console.error(`[Webhook] Amount mismatch: expected ${expectedSatang}, got ${gatewayAmount}`);
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'failed', failureReason: 'AMOUNT_MISMATCH' },
    });
    return;
  }

  await prisma.paymentAttempt.update({
    where: { id: attempt.id },
    data: { status: 'succeeded', webhookReceivedAt: new Date(), webhookSignatureValid: true },
  });

  // Claim atomically — duplicate webhooks lose the race here.
  const claimed = await claimOrderForConfirmation(order.id);
  if (!claimed) {
    console.log('[Webhook] Order already confirmed:', order.orderNumber);
    return;
  }

  const fulfilment = await fulfilOrder(order.id);
  if (!fulfilment.success) {
    if (fulfilment.error === 'INSUFFICIENT_STOCK') {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'pending_manual_fulfilment', manualFulfilmentReason: 'INSUFFICIENT_STOCK' },
      });
    }
    return;
  }

  // Notifications (fire-and-forget).
  const cfg = await getNotificationSettings();
  void notifyPaymentConfirmed({
    orderNumber: claimed.orderNumber,
    totalThb: Number(claimed.totalAmountThb),
  });
  const threshold = cfg.lowStockThreshold ?? 5;
  const variantIds = [...new Set(claimed.items.map((i: { variantId: string }) => i.variantId))];
  const low = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, stock: { lte: threshold } },
    include: { product: { select: { name: true } } },
  });
  for (const v of low) {
    void notifyStockLow({
      productName: v.product.name,
      variantLabel: v.label,
      stock: v.stock,
    });
  }
}

async function handleChargeFailed(
  chargeId: string,
  failureMessage?: string,
  failureCode?: string,
): Promise<void> {
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { gatewayName_gatewayRef: { gatewayName: 'omise', gatewayRef: chargeId } },
  });
  if (!attempt) return;

  await prisma.paymentAttempt.update({
    where: { id: attempt.id },
    data: { status: 'failed', failureReason: failureCode ?? failureMessage ?? 'UNKNOWN' },
  });
  // Order stays pending_payment (retriable).
  console.log(`[Webhook] Payment failed for ${chargeId}: ${failureCode} - ${failureMessage}`);
}
