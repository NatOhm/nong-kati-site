/**
 * Confirm a bank-verified slip: settle the attempt, claim the order, deliver.
 *
 * Extracted on 2026-11-22 from `POST /api/v1/payments/slip-verify` so the
 * background re-check of a delayed slip (src/lib/slipRecheck.ts) settles money
 * through the SAME transaction rather than a second copy of it. The control
 * flow — duplicate slip ref, lost claim race, shortage, delivery failure,
 * durable reconciliation evidence — is the original, unchanged; only the HTTP
 * mapping stayed in the route.
 *
 * `confirmed` is the ONLY outcome that means codes were delivered. Everything
 * else either tells the customer someone else is handling it, or parks the
 * order so a verified payment can never expire unpaid.
 */
import { claimOrderForConfirmation } from '@/api/orders';
import { prisma } from '@/lib/db';
import { fulfilOrder } from '@/lib/fulfilment';
import { recordPaymentReconciliation } from '@/lib/paymentReconciliation';
import {
  CONFIRM_TX_ATTEMPTS,
  CONFIRM_TX_MAX_WAIT_MS,
  CONFIRM_TX_RETRY_DELAY_MS,
  CONFIRM_TX_TIMEOUT_MS,
  PARK_TX_TIMEOUT_MS,
} from '@/lib/slipConfirmBudget';

export type SlipConfirmOutcome =
  | { kind: 'confirmed' }
  /** Another attempt already used this bank ref (unique index). */
  | { kind: 'duplicate_slip' }
  /**
   * Another writer recorded this payment first. `stage` says where the race
   * was lost, which is the difference between "nothing to do" (409) and
   * "delivery is already running" (200).
   */
  | { kind: 'already_claimed'; stage: 'claim' | 'stock' | 'delivery' }
  /** Payment recorded, delivery queued for the team (never a 5xx). */
  | { kind: 'parked'; reason: 'INSUFFICIENT_STOCK' | 'DELIVERY_PENDING' }
  /** Even the parking write failed — the evidence row is all that exists. */
  | { kind: 'reconciliation_failed'; stage: 'stock' | 'delivery'; error: string };

function prismaErrorCode(e: unknown): string | null {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

/** True when the transaction itself was lost, not when the work inside failed. */
function isRetryableConfirmationError(e: unknown): boolean {
  const code = prismaErrorCode(e);
  if (code === 'P2028' || code === 'P2034') return true;
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes('Transaction not found') ||
    msg.includes('old closed transaction') ||
    msg.includes('Transaction already closed') ||
    msg.includes('Write conflict') ||
    msg.includes('could not serialize access')
  );
}

/**
 * Run the confirmation, retrying once when the transaction expired under us.
 * Bounded: the caller's error handling (unique-slip, ALREADY_CLAIMED, stock,
 * parking) sees the last failure exactly as it saw a single one before.
 */
async function withConfirmationRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attemptNo = 1; ; attemptNo += 1) {
    try {
      return await run();
    } catch (e) {
      if (attemptNo >= CONFIRM_TX_ATTEMPTS || !isRetryableConfirmationError(e)) throw e;
      console.warn('[slip-confirm] confirmation transaction expired — retrying once', {
        code: prismaErrorCode(e),
      });
      await new Promise((resolve) => setTimeout(resolve, CONFIRM_TX_RETRY_DELAY_MS));
    }
  }
}

async function currentOrderStatus(orderId: string): Promise<string | null> {
  const row = await prisma.order
    .findUnique({ where: { id: orderId }, select: { status: true } })
    .catch(() => null);
  return row?.status ?? null;
}

export async function confirmVerifiedSlip(args: {
  orderId: string;
  orderNumber: string;
  attemptId: string;
  ref: string;
  /** Null when the bank reported no receiver (stored as-is). */
  receiverAccount: string | null;
  verifiedBy: string;
  raw: unknown;
}): Promise<SlipConfirmOutcome> {
  const { orderId, orderNumber, attemptId, ref, receiverAccount, verifiedBy, raw } = args;
  const settled = {
    status: 'succeeded',
    slipVerifiedRef: ref,
    slipVerifiedAt: new Date(),
    slipReceiverAccount: receiverAccount,
    slipVerifiedBy: verifiedBy,
  };

  try {
    await withConfirmationRetry(() =>
      prisma.$transaction(
        async (tx) => {
          await tx.paymentAttempt.update({
            where: { id: attemptId },
            data: { ...settled, gatewayResponse: raw as object },
          });
          // Production review HIGH-2: the bank verified this transfer, so
          // coupon state changes after QR issuance cannot strand the money.
          const claimed = await claimOrderForConfirmation(orderId, tx, { paidExternally: true });
          if (!claimed) throw new Error('ALREADY_CLAIMED');
          const fulfilment = await fulfilOrder(orderId, tx);
          if (fulfilment.error === 'INSUFFICIENT_STOCK') throw new Error('INSUFFICIENT_STOCK');
          if (fulfilment.error && fulfilment.error !== 'ALREADY_FULFILLED') {
            throw new Error(fulfilment.error);
          }
          return claimed;
        },
        {
          isolationLevel: 'Serializable',
          timeout: CONFIRM_TX_TIMEOUT_MS,
          maxWait: CONFIRM_TX_MAX_WAIT_MS,
        },
      ),
    );
    return { kind: 'confirmed' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Unique constraint')) return { kind: 'duplicate_slip' };
    if (msg === 'ALREADY_CLAIMED') return { kind: 'already_claimed', stage: 'claim' };

    if (msg === 'INSUFFICIENT_STOCK') {
      // The transaction above rolled back claim+attempt, so redo it committed.
      // The recovery MUST be awaited and its outcome verified BEFORE answering —
      // a swallowed failure used to 200 while the verified payment was recorded
      // NOWHERE (order pending, attempt pending, no evidence row).
      try {
        // Uses the shared claim helper: a direct updateMany skipped
        // claimOrderForConfirmation, so discounted orders parked for manual
        // fulfilment never consumed the coupon's allowance.
        await prisma.$transaction(async (tx) => {
          await tx.paymentAttempt.update({ where: { id: attemptId }, data: settled });
          const claimed = await claimOrderForConfirmation(orderId, tx, { paidExternally: true });
          if (!claimed) throw new Error('ALREADY_CLAIMED');
          await tx.order.update({
            where: { id: orderId },
            data: {
              status: 'pending_manual_fulfilment',
              manualFulfilmentReason: 'INSUFFICIENT_STOCK',
            },
          });
        });
        return { kind: 'parked', reason: 'INSUFFICIENT_STOCK' };
      } catch (recoveryErr) {
        const recMsg = recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr);
        if (recMsg === 'ALREADY_CLAIMED') {
          const orderStatus = await currentOrderStatus(orderId);
          // The admin button or a racing verify won → the payment is handled.
          if (orderStatus !== null && orderStatus !== 'pending_payment') {
            return { kind: 'already_claimed', stage: 'stock' };
          }
          // Status still pending but the guard did not match — a genuine
          // recovery failure, not a race win.
        }
        await recordPaymentReconciliation({
          trigger: 'slip_verify_recovery_failed',
          orderId,
          orderNumber,
          paymentRef: ref,
          paymentAttemptId: attemptId,
          failureReason: 'INSUFFICIENT_STOCK',
          recoveryError: recMsg,
        });
        return { kind: 'reconciliation_failed', stage: 'stock', error: recMsg };
      }
    }

    // Anything else — a transaction that expired even after the retry, a
    // delivery write failure, a serialization conflict — rolled the WHOLE
    // confirmation back. The bank says paid, so the order must not stay
    // pending_payment (it would expire and take the money with it): commit the
    // approval and park the order for the team.
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.paymentAttempt.update({ where: { id: attemptId }, data: settled });
          const claimed = await claimOrderForConfirmation(orderId, tx, { paidExternally: true });
          if (!claimed) throw new Error('ALREADY_CLAIMED');
          await tx.order.update({
            where: { id: orderId },
            data: { status: 'pending_manual_fulfilment', manualFulfilmentReason: 'DELIVERY_PENDING' },
          });
        },
        {
          isolationLevel: 'Serializable',
          timeout: PARK_TX_TIMEOUT_MS,
          maxWait: CONFIRM_TX_MAX_WAIT_MS,
        },
      );
      return { kind: 'parked', reason: 'DELIVERY_PENDING' };
    } catch (parkErr) {
      const parkMsg = parkErr instanceof Error ? parkErr.message : String(parkErr);
      if (parkMsg === 'ALREADY_CLAIMED') {
        const orderStatus = await currentOrderStatus(orderId);
        if (orderStatus !== null && orderStatus !== 'pending_payment') {
          return { kind: 'already_claimed', stage: 'delivery' };
        }
      }
      // Even the parking write failed: the verified payment exists nowhere but
      // the reconciliation trail.
      await recordPaymentReconciliation({
        trigger: 'slip_verify_recovery_failed',
        orderId,
        orderNumber,
        paymentRef: ref,
        paymentAttemptId: attemptId,
        failureReason: msg,
        recoveryError: parkMsg,
      });
      console.error('[slip-confirm] fulfilment failure and recovery failure:', msg, '/', parkMsg);
      return { kind: 'reconciliation_failed', stage: 'delivery', error: parkMsg };
    }
  }
}
