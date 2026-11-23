/**
 * Is the receiver rule rejecting real money?
 *
 * `checkReceiverMatch` fails CLOSED: a mask format it has not seen, or a store
 * account changed in settings, turns genuine slips into `RECEIVER_MISMATCH`.
 * The only detector so far has been a customer complaining — and the two
 * corrections on record (2026-10-30 and the Bangkok Bank middle-mask on
 * 2026-11-22) both arrived that way.
 *
 * Two numbers, one window:
 *   · `autoFails` — `RECEIVER_MISMATCH` verdicts (the rule refused).
 *   · `confirmedAfterFail` — admin confirmations on an order whose slip had
 *     already been refused by the rule. This is the false-reject signal: a
 *     human looked at the same transfer and accepted it.
 *
 * Surfaced on the admin dashboard (above the fold) and on
 * `/api/v1/internal/ops-health` so a monitor can watch it. Deliberately NOT
 * sampled into logs or Discord per event: one row is noise, a day's count is
 * a signal, and the existing per-order ping still names the order.
 */
import { prisma } from '@/lib/db';

/** Rolling window. A Bangkok day boundary would make the 00:00–08:00 dip look like a fix. */
export const RECEIVER_RULE_WINDOW_HOURS = 24;

/**
 * "Spike" needs a shape, not just a number: one refusal is a customer paying
 * from the wrong account; three more than yesterday is the rule drifting.
 */
export const RECEIVER_RULE_SPIKE_MIN_FAILS = 3;

/** Audit action the admin confirm route writes (PaymentAttempt → Order). */
const MANUAL_CONFIRM_ACTION = 'order.payment_verified';

/** A day's confirmations are tens, not thousands; bound the second query. */
const MAX_CONFIRMATIONS = 500;

export interface ReceiverRuleCounts {
  autoFails: number;
  confirmedAfterFail: number;
}

export interface ReceiverRuleSummary {
  windowHours: number;
  current: ReceiverRuleCounts;
  previous: ReceiverRuleCounts;
  /** True when the window looks like a rule problem, not a wrong-account payer. */
  spike: boolean;
}

/**
 * Count one window. `to` is exclusive so two adjacent windows never count the
 * same row twice.
 */
export async function receiverRuleCounts(from: Date, to: Date): Promise<ReceiverRuleCounts> {
  const [autoFails, confirmations] = await Promise.all([
    prisma.paymentAttempt.count({
      where: { failureReason: 'RECEIVER_MISMATCH', updatedAt: { gte: from, lt: to } },
    }),
    prisma.auditLog.findMany({
      where: { action: MANUAL_CONFIRM_ACTION, createdAt: { gte: from, lt: to } },
      select: { recordId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_CONFIRMATIONS,
    }),
  ]);

  const orderIds = [...new Set(confirmations.map((c) => c.recordId).filter(Boolean))];
  if (orderIds.length === 0) return { autoFails, confirmedAfterFail: 0 };

  // The rule refused THIS order's slip; a human then confirmed it anyway.
  // A confirmation that predates the refusal (the customer retried and it
  // passed) is not an override, so the timestamps are compared.
  const mismatches = await prisma.paymentAttempt.findMany({
    where: { orderId: { in: orderIds }, failureReason: 'RECEIVER_MISMATCH' },
    select: { orderId: true, updatedAt: true },
  });
  const refusedAt = new Map<string, number>();
  for (const row of mismatches) {
    const at = row.updatedAt.getTime();
    const seen = refusedAt.get(row.orderId);
    if (seen === undefined || at < seen) refusedAt.set(row.orderId, at);
  }
  const confirmedAfterFail = confirmations.filter((c) => {
    const firstRefusal = c.recordId ? refusedAt.get(c.recordId) : undefined;
    return firstRefusal !== undefined && firstRefusal <= c.createdAt.getTime();
  }).length;

  return { autoFails, confirmedAfterFail };
}

/** Current window vs the one before it, with the spike verdict. */
export async function receiverRuleSummary(now: Date = new Date()): Promise<ReceiverRuleSummary> {
  const windowMs = RECEIVER_RULE_WINDOW_HOURS * 60 * 60_000;
  const currentFrom = new Date(now.getTime() - windowMs);
  const previousFrom = new Date(now.getTime() - windowMs * 2);

  const [current, previous] = await Promise.all([
    receiverRuleCounts(currentFrom, now),
    receiverRuleCounts(previousFrom, currentFrom),
  ]);

  return {
    windowHours: RECEIVER_RULE_WINDOW_HOURS,
    current,
    previous,
    spike:
      current.confirmedAfterFail > 0 ||
      (current.autoFails >= RECEIVER_RULE_SPIKE_MIN_FAILS && current.autoFails > previous.autoFails),
  };
}

/**
 * The dashboard/ops-health form: `null` instead of throwing.
 *
 * A monitoring read must never take down the admin landing page or the health
 * endpoint, so a DB hiccup degrades to "no signal" with a console trail.
 */
export async function receiverRuleSignalOrNull(
  now: Date = new Date(),
): Promise<ReceiverRuleSummary | null> {
  try {
    return await receiverRuleSummary(now);
  } catch (err) {
    console.error('[slip-rule-signal] could not read receiver-mismatch counts:', err);
    return null;
  }
}
