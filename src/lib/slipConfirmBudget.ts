/**
 * Budgets for the slip-confirmation transactions (one owner).
 *
 * `slip-verify` ran on Prisma's 5s interactive-transaction default, which this
 * path does not fit: on a cold Passenger worker the whole confirmation measured
 * ~18.6s end to end (order NK-2026-000183, 2026-11-01). The provider had already
 * answered OK, the transaction expired mid-flight (P2028) and the customer got a
 * 500 while the order stayed pending. These are the budgets that replaced it.
 *
 * They live here, not in the route file, for two reasons: a route file in the
 * App Router may only export its handlers and the recognised route fields, and
 * the tests must assert the SAME numbers the handler passes to Prisma instead of
 * re-typing them (a test that hard-codes 30_000 keeps passing after someone
 * tunes the real budget down to 8s and breaks production again).
 */

/** Confirm transaction (attempt → claim → fulfil → outbox). */
export const CONFIRM_TX_TIMEOUT_MS = 30_000;
/** Pool-acquisition budget a cold worker also spends, separate from the timeout. */
export const CONFIRM_TX_MAX_WAIT_MS = 10_000;
/** The parking transaction only writes three rows — it needs far less. */
export const PARK_TX_TIMEOUT_MS = 10_000;
/**
 * One automatic retry. P2028 (transaction expired/closed) and P2034 (write
 * conflict) both mean the transaction rolled back entirely, so running it again
 * cannot double-deliver: the pending→confirmed claim inside it is still the only
 * gate.
 */
export const CONFIRM_TX_ATTEMPTS = 2;
export const CONFIRM_TX_RETRY_DELAY_MS = 250;
