/**
 * Unpaid-order expiry sweep — storefront review finding #2 (2026-10-05).
 *
 * Checkout creates a real `pending_payment` order before the customer
 * commits to any payment action (`src/app/checkout/page.tsx`
 * handleContactSubmit → `createOrder`, `src/api/orders.ts`), so every
 * abandoned checkout leaves a row behind. The state machine has always
 * permitted `pending_payment → expired` (`VALID_TRANSITIONS` in
 * `src/api/orders.ts`) but nothing ever performed the transition:
 * `updateOrderStatus` had no caller anywhere in `src/`, and the inventory
 * queue documented in `src/lib/jobs/mockQueue.ts` ("Reservation sweep
 * (5min), expiry sweep (15min)") had zero registered handlers. Unpaid
 * orders therefore accumulated indefinitely and the admin order list grew
 * a permanent tail of rows that will never be paid.
 *
 * WHY THIS TOUCHES NO STOCK: `createOrder` only *validates* stock
 * (`OUT_OF_STOCK` in `src/api/orders.ts`) — the debit happens in the
 * fulfilment transaction at payment confirmation
 * (`data: { stock: { decrement: needed } }`, `src/lib/fulfilment.ts`).
 * An expired unpaid order therefore holds no inventory to release.
 * `releaseExpiredReservations` in `src/lib/delivery/reservation.ts`
 * walks an in-memory `mockCodeStore` map, which is empty on a serverless
 * cold start; calling it from a cron route would be theatre, so it is
 * deliberately NOT wired in here. Its real replacement is the GiftCode
 * guard inside the fulfilment transaction.
 *
 * WHY `updateMany` AND NOT `updateOrderStatus`: the transition guard in
 * `updateOrderStatus` is a findUnique-then-update pair, so two concurrent
 * callers can both pass the guard. A single `updateMany` whose `where`
 * re-asserts `status: 'pending_payment'` is one atomic CAS — that is what
 * makes it safe to run on a cron tick racing a payment webhook. A webhook
 * that confirms first flips the row and the sweep then matches nothing.
 */

import { prisma } from '@/lib/db';

/**
 * Payment timeout window. 06-database.md `order_payment_timeout_minutes`
 * defaults to 30; the value is overridable per-deployment via the
 * SiteSetting of the same name.
 */
export const DEFAULT_PAYMENT_TIMEOUT_MINUTES = 30;

/** SiteSetting key that overrides {@link DEFAULT_PAYMENT_TIMEOUT_MINUTES}. */
export const PAYMENT_TIMEOUT_SETTING_KEY = 'order_payment_timeout_minutes';

/** Clamp window: 1 minute … 24 hours. A typo'd setting must not park every
 *  order for a week (or expire everything instantly). */
const MIN_TIMEOUT_MINUTES = 1;
const MAX_TIMEOUT_MINUTES = 24 * 60;

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

/**
 * Resolve the payment timeout, preferring the SiteSetting override.
 * Any read failure (missing table, DB down, junk value) falls back to the
 * documented 30 minutes rather than throwing — a sweep that errors out
 * leaves orders unexpired, which is the bug this module exists to fix.
 */
export async function resolvePaymentTimeoutMinutes(): Promise<number> {
  try {
    const row = await prisma.siteSetting.findUnique({
      where: { key: PAYMENT_TIMEOUT_SETTING_KEY },
      select: { value: true },
    });
    const parsed = Number(row?.value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAYMENT_TIMEOUT_MINUTES;
    return Math.min(Math.max(Math.floor(parsed), MIN_TIMEOUT_MINUTES), MAX_TIMEOUT_MINUTES);
  } catch {
    return DEFAULT_PAYMENT_TIMEOUT_MINUTES;
  }
}

export interface ExpireOrdersResult {
  /** Rows examined — `scanned` > `expired` means a webhook won the race. */
  scanned: number;
  /** Rows this run actually flipped to `expired`. */
  expired: number;
  /** ISO timestamp; orders created before it are eligible. */
  cutoff: string;
  timeoutMinutes: number;
  batches: number;
}

export interface ExpireOrdersOptions {
  /** Rows per batch (1…500, default 100). */
  batchSize?: number;
  /** Injectable clock for tests. */
  now?: Date;
  /** Skip the SiteSetting read (tests, explicit override). */
  timeoutMinutes?: number;
}

/**
 * Expire every `pending_payment` order older than the payment window.
 *
 * Idempotent and concurrency-safe: re-running is a no-op, and a tick that
 * overlaps a payment confirmation cannot double-transition an order
 * because the `status: 'pending_payment'` predicate is part of the same
 * atomic update.
 */
export async function expireUnpaidOrders(
  opts: ExpireOrdersOptions = {},
): Promise<ExpireOrdersResult> {
  const batchSize = Math.min(
    Math.max(Math.floor(opts.batchSize ?? DEFAULT_BATCH_SIZE), 1),
    MAX_BATCH_SIZE,
  );
  const now = opts.now ?? new Date();
  const timeoutMinutes = opts.timeoutMinutes ?? (await resolvePaymentTimeoutMinutes());
  const cutoff = new Date(now.getTime() - timeoutMinutes * 60 * 1000);

  let scanned = 0;
  let expired = 0;
  let batches = 0;

  // Batched rather than one unbounded updateMany so a large first-run
  // backlog (every order ever abandoned) cannot blow the serverless
  // statement/lock budget in a single statement.
  for (;;) {
    const stale = await prisma.order.findMany({
      where: { status: 'pending_payment', createdAt: { lt: cutoff } },
      select: { id: true },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });
    if (stale.length === 0) break;

    scanned += stale.length;
    const updated = await prisma.order.updateMany({
      // The status predicate IS the CAS — do not drop it.
      where: { id: { in: stale.map((o) => o.id) }, status: 'pending_payment' },
      data: { status: 'expired', expiredAt: now },
    });
    expired += updated.count;
    batches += 1;

    if (stale.length < batchSize) break;
  }

  return { scanned, expired, cutoff: cutoff.toISOString(), timeoutMinutes, batches };
}