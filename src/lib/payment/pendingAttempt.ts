/**
 * The ONE pending PaymentAttempt for an order: find it, or create it once.
 *
 * Extracted from the slip-verify route (audit 2026-11-24) so a real-database
 * spec can drive it: a `route.ts` may only export handlers, and the guarantee
 * below is about what the ENGINE does when two callers race, so it has to be
 * testable against a real server (`tests/db/slip-attempt-race.test.ts`,
 * `npm run test:db`).
 *
 * Two uploads arriving together used to read "no pending attempt" and BOTH
 * insert, so one order could hold several attempts. Each attempt carries its
 * own paid re-check budget (`SLIP_RECHECK_MAX_ATTEMPTS`), so concurrent delayed
 * uploads multiplied the shop's provider spend for a single order — and a
 * resubmission could start from a fresh budget.
 *
 * The dedupe is a CONDITIONAL WRITE on the parent order, inside the same
 * transaction as the insert: whichever upload wins compare-and-sets
 * `Order.updatedAt`, and a loser's update matches ZERO rows, so the retry
 * reads the winner's pending attempt instead of inserting a twin.
 *
 * That is a positive signal from the row lock itself, not from a driver error.
 * The previous version relied on `isolationLevel: 'Serializable'` deadlocking
 * the second writer through InnoDB gap locks — unverified, engine-specific, and
 * silently absent on any datasource whose driver ignores the option
 * (render/sqlite/proxied MySQL alike), where it would have inserted a twin with
 * no error at all. The conflict-retry path is kept for engines that DO raise
 * instead of returning 0 rows (Postgres REPEATABLE READ 40001, InnoDB 1213,
 * SQLite BUSY → Prisma P2034/P2028).
 *
 * Crash-safe without a new column: the claim marker IS the order's own
 * timestamp, written in the transaction, so a rollback or a dead process takes
 * the bump with it. No marker row exists to leak, and no sweep is needed.
 *
 * No schema change; a partial unique index on (orderId, status='pending') would
 * also work, but that needs a migration and existing rows cannot be back-filled
 * by code.
 */
import { nextCasStamp } from '@/lib/casStamp';
import { prisma } from '@/lib/db';
import { recheckCount } from '@/lib/payment/recheckBudget';

export async function pendingAttemptFor(order: {
  id: string;
  totalAmountThb: number;
  gatewayName: string;
}): Promise<{ id: string; priorRechecks: number }> {
  for (let tries = 1; ; tries += 1) {
    try {
      const found = await prisma.$transaction(async (tx) => {
        // The claim token. `Order.updatedAt` is bookkeeping only — no reader
        // derives state from it (checked: no `order.updatedAt` in src/) — and
        // this route writes the order anyway (slip evidence), so one more bump
        // inside a rollback-safe transaction changes nothing visible.
        const parent = await tx.order.findUnique({
          where: { id: order.id },
          select: { updatedAt: true },
        });
        if (!parent) throw new Error('ORDER_NOT_FOUND');

        const existing = await tx.paymentAttempt.findFirst({
          where: { orderId: order.id, status: 'pending', paymentMethod: 'promptpay' },
          orderBy: { createdAt: 'desc' },
          select: { id: true, gatewayResponse: true },
        });
        if (existing) {
          return { id: existing.id, priorRechecks: recheckCount(existing.gatewayResponse) };
        }

        // Claim the order: compare-and-set on the timestamp read above. A
        // concurrent upload holds this row's lock, so this update either waits
        // and then matches 0 rows (its token is now stale) or the engine aborts
        // it as a serialization failure — both handled below.
        const won = await tx.order.updateMany({
          where: { id: order.id, updatedAt: parent.updatedAt },
          // Strictly-changed stamp: `new Date()` can equal the token it
          // replaces, and then both racers match (audit 2026-11-24).
          data: { updatedAt: nextCasStamp(parent.updatedAt) },
        });
        if (won.count === 0) return null;

        const created = await tx.paymentAttempt.create({
          data: {
            orderId: order.id,
            paymentMethod: 'promptpay',
            gatewayName: order.gatewayName,
            amountThb: order.totalAmountThb,
            status: 'pending',
          },
          select: { id: true },
        });
        return { id: created.id, priorRechecks: 0 };
      });
      if (found) return found;
      // The conditional write matched nothing: another upload won. Re-read —
      // the next pass finds the winner's committed attempt.
      if (tries >= 3) throw new Error('PENDING_ATTEMPT_CLAIM_LOST');
    } catch (err) {
      // Only a lost race is retryable — the transaction rolled back, so the
      // next pass reads whatever the winner committed.
      const code = (err as { code?: unknown } | null)?.code;
      const message = err instanceof Error ? err.message : String(err);
      const raced =
        code === 'P2034' ||
        code === 'P2028' ||
        /deadlock|write conflict|could not serialize|40001|database is locked/i.test(message);
      if (!raced || tries >= 3) throw err;
    }
  }
}
