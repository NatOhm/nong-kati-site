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
import type { WebhookEvent } from '@/lib/payment/gateway';
import { prisma } from '@/lib/db';
import { getOrderById, claimOrderForConfirmation } from '@/api/orders';
import { fulfilOrder, scheduleOutboxDrain } from '@/lib/fulfilment';
import { recordPaymentReconciliation } from '@/lib/paymentReconciliation';
import { getNotificationSettings, notifyPaymentConfirmed, notifyStockLow } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/**
 * Lazy singleton — see payments/initiate/route.ts: the adapter must not be
 * constructed at module import (Next collects routes at build time, and the
 * fail-closed constructor throws without credentials in CI).
 */
let gateway: OmiseAdapter | null = null;
function getGateway(): OmiseAdapter {
  if (!gateway) gateway = new OmiseAdapter();
  return gateway;
}

/** Control-flow markers for expected, non-retryable transaction outcomes. */
class WebhookAlreadyConfirmedError extends Error {}
class InsufficientStockError extends Error {}

/**
 * Production review HIGH-6: independent verification per Opn's documented
 * model — GET the charge with the secret key and confirm amount, status and
 * livemode match the event before trusting it. Returns the refreshed event
 * (source-of-truth fields win over the webhook payload) or null when the
 * charge does not validate. Also REWRITES event.status from the retrieved
 * charge so downstream logic never acts on a stale/mutated payload.
 */
async function verifyChargeAgainstOpn(event: WebhookEvent): Promise<WebhookEvent | null> {
  if (!event.chargeId) return null;
  try {
    const charge = await getGateway().retrieveCharge(event.chargeId);
    const status = String(charge['status'] ?? '');
    const amount = Number(charge['amount'] ?? 0);
    const livemode = charge['livemode'] === true;
    const expectedLive = process.env.NODE_ENV === 'production';
    if (livemode !== expectedLive) {
      console.error(`[Webhook] livemode mismatch: charge=${livemode} env=${expectedLive}`);
      return null;
    }
    if (event.amount > 0 && amount !== event.amount) {
      console.error(`[Webhook] amount mismatch: event=${event.amount} opn=${amount}`);
      return null;
    }
    return {
      ...event,
      status:
        status === 'successful'
          ? 'successful'
          : status === 'failed'
            ? 'failed'
            : status === 'expired'
              ? 'expired'
              : event.status,
      amount,
      rawData: { ...(event.rawData ?? {}), retrieved: true },
    };
  } catch (err) {
    console.error(
      '[Webhook] charge verification failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Step 1: Read raw body (before signature check)
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signatureHeader = request.headers.get('x-omise-signature') ?? '';

  // Step 2: Verify signature (LD-07). Production review HIGH-6: when the
  // signature does NOT verify we no longer discard the event — Opn's
  // documented verification model is to RETRIEVE the charge independently,
  // so an unverifiable event goes through the authenticated lookup and is
  // processed only if the source of truth confirms it. A fabricated event
  // still cannot pass (unknown charge ids fail the lookup; amounts/status
  // must match), but a genuine Opn event can never be silently dropped.
  const event = getGateway().parseWebhookEvent(rawBody);
  const isValid = getGateway().verifyWebhookSignature(rawBody, signatureHeader);
  if (!isValid && (event.key === 'charge.complete' || event.key === 'charge.failed')) {
    const verified = await verifyChargeAgainstOpn(event);
    if (!verified) {
      console.error(
        '[Webhook] Signature invalid AND charge verification failed — discarding event from',
        request.headers.get('x-forwarded-for'),
      );
      return NextResponse.json({ received: true });
    }
    // Source-of-truth fields replace the webhook payload for routing.
    Object.assign(event, verified);
  }

  // Step 3-4: Route

  if (event.key === 'charge.complete' || event.key === 'charge.failed') {
    if (event.status === 'successful') {
      await handleChargeSucceeded(event.chargeId, event.amount);
    } else if (event.status === 'failed') {
      await handleChargeFailed(event.chargeId, event.failureMessage, event.failureCode);
    }
  } else {
    console.warn('[Webhook] Unknown event:', event.key);
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
    console.warn('[Webhook] Duplicate webhook for charge:', chargeId);
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

  // Finding #7: confirmation + fulfilment are ONE transaction. A transient
  // fulfilment failure rolls the claim and the attempt-status back, so the
  // gateway's redelivery retries the whole unit — no permanent
  // payment_confirmed-but-unfulfilled limbo.
  try {
    const claimed = await prisma.$transaction(async (tx) => {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'succeeded', webhookReceivedAt: new Date(), webhookSignatureValid: true },
      });
      // Production review HIGH-2: an externally-verified payment must not be
      // rejected because coupon state changed after the QR was issued — the
      // claim honors the charged coupon snapshot instead of throwing.
      const c = await claimOrderForConfirmation(order.id, tx, { paidExternally: true });
      if (!c) throw new WebhookAlreadyConfirmedError(order.orderNumber); // duplicate lost the race
      const fulfilment = await fulfilOrder(order.id, tx);
      if (fulfilment.error === 'INSUFFICIENT_STOCK')
        throw new InsufficientStockError(order.orderNumber);
      if (fulfilment.error === 'ALREADY_FULFILLED')
        throw new WebhookAlreadyConfirmedError(order.orderNumber);
      return c;
    });

    // Audit #2: the code-delivery email is a durable outbox row written
    // inside the fulfilment transaction — schedule the delivery worker run
    // now that the unit committed. Webhook retries stay idempotent via the
    // outbox's unique idempotency key.
    await scheduleOutboxDrain();

    // Notifications (fire-and-forget), only after a real commit.
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
  } catch (e) {
    if (e instanceof WebhookAlreadyConfirmedError) {
      console.info('[Webhook] Order already confirmed:', e.message);
      return;
    }
    if (e instanceof InsufficientStockError) {
      // Expected outcome, not a failure: the main tx rolled back, so commit
      // the manual-fulfilment state. Review #4: claim + order update + attempt
      // success are one transaction — a crash between writes can no longer
      // strand the order payment_confirmed with a pending attempt.
      for (let i = 0; i < 3; i++) {
        try {
          await prisma.$transaction(
            async (tx) => {
              const c = await claimOrderForConfirmation(order.id, tx);
              if (!c) throw new Error('CLAIM_LOST');
              await tx.order.update({
                where: { id: order.id },
                data: {
                  status: 'pending_manual_fulfilment',
                  manualFulfilmentReason: 'INSUFFICIENT_STOCK',
                },
              });
              await tx.paymentAttempt.update({
                where: { id: attempt.id },
                data: {
                  status: 'succeeded',
                  webhookReceivedAt: new Date(),
                  webhookSignatureValid: true,
                },
              });
              console.error(
                `[Webhook] Order ${c.orderNumber} needs manual fulfilment (INSUFFICIENT_STOCK)`,
              );
            },
            { isolationLevel: 'Serializable' },
          );
          return;
        } catch (txErr) {
          // CLAIM_LOST = someone else confirmed/consumed it between retries —
          // not an error for us. Real write failures: retry, then give up so
          // the gateway redelivers and the whole unit retries.
          if (txErr instanceof Error && txErr.message === 'CLAIM_LOST') {
            const cur = await prisma.order.findUnique({
              where: { id: order.id },
              select: { status: true },
            });
            if (cur && cur.status !== 'pending_payment') return;
            continue;
          }
          if (i < 2) {
            await new Promise((r) => setTimeout(r, 80));
            continue;
          }
          // Audit #4: all retries failed. Returning 200 here (LD-10) is fine
          // for the GATEWAY, but the verified payment must not vanish
          // unrecorded — leave a reconciliation evidence row for operators.
          await recordPaymentReconciliation({
            trigger: 'webhook_recovery_failed',
            orderId: order.id,
            orderNumber: order.orderNumber,
            paymentRef: chargeId,
            paymentAttemptId: attempt.id,
            failureReason: 'INSUFFICIENT_STOCK',
            recoveryError: txErr instanceof Error ? txErr.message : String(txErr),
          });
          return;
        }
      }
      console.error('[Webhook] Could not record manual-fulfilment state for', chargeId);
      return;
    }
    // Unexpected failure: everything rolled back and the attempt is still
    // un-succeeded → the gateway redelivers and retries the whole unit.
    throw e;
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
  console.warn(`[Webhook] Payment failed for ${chargeId}: ${failureCode} - ${failureMessage}`);
}
