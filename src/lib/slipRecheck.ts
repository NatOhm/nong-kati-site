/**
 * Re-check a slip the bank had not published yet (`SLIP_DELAYED`).
 *
 * Bangkok Bank and GSB publish a transfer only 2–3 minutes after it happens,
 * so the FIRST answer for a genuine กรุงเทพ slip is "not found". The panel
 * offers ตรวจสลิปอีกครั้ง, but that only works while the customer keeps the tab
 * open: close it and a paid order sits unpaid until an admin notices.
 *
 * Two triggers, same code path:
 *   · `scheduleSlipRecheck()` — an unref'd timer for the attempt that just got
 *     the delayed verdict, RE-ARMED after every still-delayed retry while the
 *     budget lasts, so the tries happen at ~2.5/5/7.5 minutes. This is the
 *     only trigger that runs on time: the housekeeping cron asks for every 10
 *     minutes but lands hours apart (measured in prod-health-monitor.yml), and
 *     the sweep's 20-minute window is closed by then.
 *   · `recheckDelayedSlips()` — a sweep for anything the timer lost (process
 *     restart, deploy). Wired to the 10-minute housekeeping tick.
 *
 * Durable state, no schema change: the attempt keeps `failureReason =
 * 'SLIP_DELAYED'` while retries remain, `updatedAt` doubles as the next-try
 * clock (so the sweep backs off ~2.5 minutes on its own), and
 * `gatewayResponse.rechecks` counts the extra calls. When the budget is spent
 * the attempt is marked `failed`, which takes it out of the sweep and tells
 * the truth: this auto-check never confirmed.
 *
 * Money rules: every re-check spends a real provider credit, so attempts run
 * sequentially, at most `SLIP_RECHECK_MAX_ATTEMPTS` times, and only while the
 * order is still payable. A claim CAS on `updatedAt` stops the timer and the
 * sweep from both paying for the same check.
 */
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import {
  notifyPaymentConfirmed,
  notifyPaymentPending,
  notifyStockAlertsForVariants,
} from '@/lib/notify';
import { scheduleOutboxDrain } from '@/lib/fulfilment';
import { confirmVerifiedSlip } from '@/lib/payment/slipConfirmation';
import { verifySlipImage } from '@/lib/payment/slipVerifyFlow';
import { nextCasStamp } from '@/lib/casStamp';
import { getManualTransferInfo } from '@/lib/data';
import { recheckCount } from '@/lib/payment/recheckBudget';
import { readSlip, slipKeyFromImageUrl, sniffSlipMime } from '@/lib/slipStore';

/** 2.5 minutes: the window the banks themselves quote, plus a small margin. */
export const SLIP_RECHECK_DELAY_MS = 150_000;
/** Extra provider calls per slip. Four answers total is plenty for a delay. */
export const SLIP_RECHECK_MAX_ATTEMPTS = 3;
/** Stop chasing after this long; by then a human owns the order. */
export const SLIP_RECHECK_WINDOW_MS = 20 * 60_000;
export const SLIP_RECHECK_BATCH = 20;

const PAYABLE_STATUSES = ['pending_payment', 'expired'];

export type RecheckOutcome =
  | { kind: 'confirmed' }
  | { kind: 'parked'; reason: string }
  | { kind: 'delayed'; rechecks: number }
  | { kind: 'closed'; detail: string }
  | { kind: 'skipped'; reason: string };

// Lives in `@/lib/payment/recheckBudget` so payment code (the slip-verify
// find-or-create) can read the budget without importing this sweep's
// Next-request dependencies. Re-exported because every existing caller and
// test expects it here.
export { recheckCount };

function stamp(args: {
  provider: string | null;
  error: string;
  detail: string | null;
  rechecks: number;
  /** Raw provider code — the same evidence the live route keeps. */
  providerCode?: string | undefined;
}): Prisma.InputJsonValue {
  return {
    provider: args.provider,
    error: args.error,
    detail: args.detail,
    ...(args.providerCode ? { providerCode: args.providerCode } : {}),
    checkedAt: new Date().toISOString(),
    rechecks: args.rechecks,
  };
}

/**
 * Tell the admin a paid slip's auto-check stopped without confirming.
 *
 * A close marks the attempt `failed`, which is what takes it out of the sweep:
 * from that moment nobody is looking. The order is still payable and the money
 * may well be real, so the same Discord ping the failing live route sends is
 * the only thing standing between this and a silent unpaid order.
 */
function notifyRecheckClosed(order: {
  orderNumber: string;
  customerEmail: string | null;
  totalAmountThb: unknown;
}): void {
  void notifyPaymentPending({
    orderNumber: order.orderNumber,
    totalThb: Number(order.totalAmountThb),
    customerEmail: order.customerEmail ?? '',
  });
}

/**
 * Re-check ONE attempt. Safe to call twice: the CAS below means only the first
 * caller spends a credit, and an attempt that is no longer `SLIP_DELAYED` (the
 * customer's own retry confirmed it, an admin acted) is skipped untouched.
 */
export async function recheckDelayedAttempt(attemptId: string): Promise<RecheckOutcome> {
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      failureReason: true,
      gatewayResponse: true,
      updatedAt: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          customerEmail: true,
          status: true,
          totalAmountThb: true,
          slipImageUrl: true,
          items: { select: { variantId: true } },
        },
      },
    },
  });
  if (!attempt) return { kind: 'skipped', reason: 'attempt-not-found' };
  if (attempt.failureReason !== 'SLIP_DELAYED') {
    return { kind: 'skipped', reason: `verdict-is-${attempt.failureReason ?? 'none'}` };
  }
  const order = attempt.order;
  if (!PAYABLE_STATUSES.includes(order.status)) {
    return { kind: 'skipped', reason: `order-${order.status}` };
  }

  const rechecks = recheckCount(attempt.gatewayResponse);
  if (rechecks >= SLIP_RECHECK_MAX_ATTEMPTS) {
    // Already exhausted; the sweep query excludes failed attempts, so this is
    // only reachable from a stale timer.
    return { kind: 'skipped', reason: 'budget-spent' };
  }

  // Claim this check before spending a credit: the timer and the sweep can
  // fire together, and the `where` pins the row's previous `updatedAt`.
  const claimed = await prisma.paymentAttempt.updateMany({
    where: { id: attempt.id, failureReason: 'SLIP_DELAYED', updatedAt: attempt.updatedAt },
    // Strictly-changed stamp (see casStamp.ts): with `new Date()` the timer and
    // the sweep could both match this token inside one millisecond and BOTH buy
    // a provider call for the same delayed slip.
    data: { updatedAt: nextCasStamp(attempt.updatedAt) },
  });
  if (claimed.count === 0) return { kind: 'skipped', reason: 'claimed-by-another-run' };

  const nextCount = rechecks + 1;

  // No stored image → nothing to show the bank. Close the auto-check and let
  // the admin (who only has the order row) decide.
  const key = slipKeyFromImageUrl(order.slipImageUrl);
  const bytes = key ? await readSlip(key).catch(() => null) : null;
  if (!bytes) {
    // Nothing left to check automatically — a human owns this order now.
    notifyRecheckClosed(order);
    await prisma.paymentAttempt
      .update({
        where: { id: attempt.id },
        data: {
          status: 'failed',
          gatewayResponse: stamp({
            provider: null,
            error: 'SLIP_DELAYED',
            detail: 'stored slip unavailable — cannot re-check',
            rechecks: nextCount,
          }),
        },
      })
      .catch(() => undefined);
    return { kind: 'closed', detail: 'slip-unavailable' };
  }

  let verification: Awaited<ReturnType<typeof verifySlipImage>>;
  try {
    const manualInfo = await getManualTransferInfo();
    verification = await verifySlipImage({
      imageBase64: bytes.toString('base64'),
      // The stored bytes' real type, not a hardcoded PNG (a re-check must send
      // the provider the same declaration the live route made).
      imageMime: sniffSlipMime(bytes),
      expectedAmountThb: Number(order.totalAmountThb),
      storeAccountNumber: manualInfo.accountNumber,
      // Same proof requirement as the live route: a re-check that only fits the
      // mask must not settle money an admin has not looked at.
      storeAccountName: manualInfo.accountName,
    });
  } catch (err) {
    // A provider/network throw is not a verdict; count it as a failed retry so
    // the loop stays bounded, and let the sweep try again after the backoff.
    const stillDue = nextCount < SLIP_RECHECK_MAX_ATTEMPTS;
    const stamped = await prisma.paymentAttempt
      .update({
        where: { id: attempt.id },
        data: {
          ...(stillDue ? {} : { status: 'failed' }),
          gatewayResponse: stamp({
            provider: null,
            error: 'SLIP_DELAYED',
            detail: 're-check could not reach the provider',
            rechecks: nextCount,
          }),
        },
      })
      .catch(() => undefined);
    console.error('[slip-recheck] provider call failed:', err);
    if (!stillDue) {
      notifyRecheckClosed(order);
      return { kind: 'closed', detail: 'provider-unreachable' };
    }
    if (stamped) scheduleSlipRecheck(attempt.id);
    return { kind: 'delayed', rechecks: nextCount };
  }

  if (!verification.ok) {
    const stillDelayed = verification.code === 'SLIP_DELAYED';
    const stillDue = stillDelayed && nextCount < SLIP_RECHECK_MAX_ATTEMPTS;
    const stamped = await prisma.paymentAttempt
      .update({
        where: { id: attempt.id },
        data: {
          // Anything but another delay is terminal for this attempt: the real
          // verdict (amount, receiver, duplicate) must reach the admin.
          ...(stillDue ? {} : { status: 'failed' }),
          failureReason: stillDelayed ? 'SLIP_DELAYED' : verification.code,
          gatewayStatusCode: verification.provider,
          // Same evidence the live route keeps: the account the bank named is
          // what an admin needs before confirming by hand, and without it a
          // delayed slip that later says RECEIVER_MISMATCH reaches the queue
          // with no receiver at all — the one screen this guard exists for.
          ...(verification.receiverAccount
            ? { slipReceiverAccount: verification.receiverAccount }
            : {}),
          gatewayResponse: stamp({
            provider: verification.provider,
            error: verification.code,
            detail: verification.detail ?? null,
            rechecks: nextCount,
            ...(verification.providerCode ? { providerCode: verification.providerCode } : {}),
            // Why the first provider was abandoned, same as the live route.
            ...(verification.fallback ? { fallback: verification.fallback } : {}),
          }),
        },
      })
      .catch(() => null);
    if (stillDue) {
      // Re-arm only once the spent credit is ON THE ROW (`rechecks` advanced):
      // with a failed stamp the budget never moves, and an armed timer would
      // pay the provider again every 2.5 minutes until the order expired.
      if (stamped) scheduleSlipRecheck(attempt.id);
      return { kind: 'delayed', rechecks: nextCount };
    }
    // Budget spent, or the bank gave a terminal verdict (amount, receiver,
    // duplicate): the attempt leaves the sweep here, so an admin has to be
    // told — otherwise a paid slip sits in the queue with nobody aware.
    notifyRecheckClosed(order);
    return { kind: 'closed', detail: stillDelayed ? 'budget-spent' : verification.code };
  }

  const outcome = await confirmVerifiedSlip({
    orderId: order.id,
    orderNumber: order.orderNumber,
    attemptId: attempt.id,
    ref: verification.ref,
    receiverAccount: verification.receiverAccount,
    verifiedBy: verification.verifiedBy,
    raw: verification.raw,
  });

  if (outcome.kind === 'confirmed' || outcome.kind === 'parked') {
    // Same post-commit tail the customer-facing route runs: the queue drains
    // and the ops channel learns who paid, without a customer on the page.
    await scheduleOutboxDrain();
    void notifyPaymentConfirmed({
      orderNumber: order.orderNumber,
      totalThb: Number(order.totalAmountThb),
      customerEmail: order.customerEmail,
    });
    const variantIds = [...new Set(order.items.map((i) => i.variantId))].filter(
      (v): v is string => v !== null,
    );
    await notifyStockAlertsForVariants(variantIds);
  }

  if (outcome.kind === 'confirmed') return { kind: 'confirmed' };
  if (outcome.kind === 'parked') return { kind: 'parked', reason: outcome.reason };

  if (outcome.kind === 'reconciliation_failed') {
    // The bank verified the money but neither the confirmation nor the parking
    // write recorded it. That is not a verdict, so the attempt stays in the
    // sweep for another try — but this check DID spend a credit, and the only
    // record of it is this stamp. Without it the sweep re-verified the same slip
    // (and re-pinged) every 2.5 minutes until the 20-minute window aged the row
    // out, so the 3-call cap never applied to the one branch that keeps failing.
    const stillDue = nextCount < SLIP_RECHECK_MAX_ATTEMPTS;
    const stamped = await prisma.paymentAttempt
      .update({
        where: { id: attempt.id },
        data: {
          // `failureReason` stays SLIP_DELAYED while retries remain: the sweep
          // selects on it. At the cap `failed` is what takes the row out.
          ...(stillDue ? {} : { status: 'failed' }),
          gatewayResponse: stamp({
            // No failure code here to name the provider with — the verification
            // succeeded, so the successful answer's own attribution says who.
            provider: verification.verifiedBy,
            error: 'RECONCILIATION_FAILED',
            detail: outcome.error,
            rechecks: nextCount,
          }),
        },
      })
      .catch(() => undefined);
    if (stillDue) {
      if (stamped) scheduleSlipRecheck(attempt.id);
      return { kind: 'delayed', rechecks: nextCount };
    }
    // The budget is spent, so the auto-check is over — the reconciliation trail
    // is all that exists and the admin must be told, not just a log line.
    notifyRecheckClosed(order);
    return { kind: 'closed', detail: 'reconciliation_failed' };
  }

  // duplicate / already_claimed: another writer owns this payment. Nothing
  // left to retry and nothing to escalate — but the attempt MUST leave the
  // re-check loop. `failureReason` stays SLIP_DELAYED (the delay was real)
  // while `status: failed` is the selector that stops it, and the stamp puts
  // the spent credit on the record. Without this write the row looked
  // untouched, so every later timer or sweep tick paid the provider again for
  // a payment that was already settled — and since `rechecks` never advanced,
  // the 3-call cap could never end it.
  await prisma.paymentAttempt
    .update({
      where: { id: attempt.id },
      data: {
        status: 'failed',
        gatewayResponse: stamp({
          provider: verification.verifiedBy,
          error: outcome.kind.toUpperCase(),
          detail: 'payment already recorded by another writer',
          rechecks: nextCount,
        }),
      },
    })
    .catch(() => undefined);
  return { kind: 'closed', detail: outcome.kind };
}

/**
 * Sweep: re-check every delayed slip whose backoff has elapsed. Sequential on
 * purpose — each one is a paid provider call.
 */
export async function recheckDelayedSlips(
  options: { batchSize?: number; now?: Date } = {},
): Promise<{
  scanned: number;
  confirmed: number;
  parked: number;
  delayed: number;
  closed: number;
  skipped: number;
}> {
  const now = options.now ?? new Date();
  const batchSize = Math.min(Math.max(1, options.batchSize ?? SLIP_RECHECK_BATCH), 100);
  const due = await prisma.paymentAttempt.findMany({
    where: {
      paymentMethod: 'promptpay',
      status: 'pending',
      failureReason: 'SLIP_DELAYED',
      updatedAt: {
        lte: new Date(now.getTime() - SLIP_RECHECK_DELAY_MS),
        gte: new Date(now.getTime() - SLIP_RECHECK_WINDOW_MS),
      },
      order: { status: { in: PAYABLE_STATUSES }, slipImageUrl: { not: null } },
    },
    select: { id: true },
    orderBy: { updatedAt: 'asc' },
    take: batchSize,
  });

  const tally = { scanned: due.length, confirmed: 0, parked: 0, delayed: 0, closed: 0, skipped: 0 };
  for (const row of due) {
    const outcome = await recheckDelayedAttempt(row.id).catch((err): RecheckOutcome => {
      console.error('[slip-recheck] attempt failed:', row.id, err);
      return { kind: 'skipped', reason: 'error' };
    });
    if (outcome.kind === 'confirmed') tally.confirmed += 1;
    else if (outcome.kind === 'parked') tally.parked += 1;
    else if (outcome.kind === 'delayed') tally.delayed += 1;
    else if (outcome.kind === 'closed') tally.closed += 1;
    else tally.skipped += 1;
  }
  return tally;
}

/**
 * Re-check this attempt shortly after the delayed verdict — the fast path that
 * makes a closed tab irrelevant. Never throws, never blocks the response, and
 * never keeps the process alive: if the timer is lost to a restart the sweep
 * picks the attempt up instead.
 */
export function scheduleSlipRecheck(
  attemptId: string,
  delayMs: number = SLIP_RECHECK_DELAY_MS,
): void {
  try {
    const timer = setTimeout(() => {
      void recheckDelayedAttempt(attemptId).catch((err) => {
        console.error('[slip-recheck] scheduled re-check failed:', attemptId, err);
      });
    }, delayMs) as unknown as { unref?: () => void };
    timer.unref?.();
  } catch (err) {
    console.error('[slip-recheck] could not schedule the re-check:', err);
  }
}
