/**
 * Real-engine proof for the slip-verify find-or-create (audit 2026-11-24).
 *
 * Why this file exists: every other suite mocks Prisma, so none of them can
 * show what the DATABASE does when two uploads of one order arrive together.
 * The previous guard claimed `isolationLevel: 'Serializable'` deadlocked the
 * second writer through InnoDB gap locks — a real engine claim that was only
 * ever asserted against a fake transaction. This spec races genuine
 * transactions against the engine production runs (MariaDB 10.11, InnoDB) and
 * asserts the outcome the customer path depends on: ONE pending attempt, one
 * paid re-check budget, and the same row reused afterwards.
 *
 * It is excluded from `npm test` (see `exclude` in vitest.config.ts) because it
 * needs a server; run it with `npm run test:db`, as the CI
 * `Concurrency (MariaDB)` job does. It refuses a non-loopback host, so a stray
 * shell cannot run it against production.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { nextCasStamp } from '@/lib/casStamp';
import { pendingAttemptFor } from '@/lib/payment/pendingAttempt';

const url = process.env['DATABASE_URL'] ?? '';
const loopback = /@(127\.0\.0\.1|localhost)[:/]/.test(url);

const prisma = new PrismaClient();
const orderIds: string[] = [];

async function makeOrder(): Promise<string> {
  const order = await prisma.order.create({
    data: {
      // `confirmationUuid` is unique-but-defaulted to '' — a fixed '' on two
      // rows would violate it, so every audit order gets its own.
      orderNumber: `NK-AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      confirmationUuid: crypto.randomUUID(),
      customerEmail: 'audit@example.test',
      subtotalThb: 9,
      vatAmountThb: 0,
      totalAmountThb: 9,
      tosAcceptedAt: new Date(),
    },
    select: { id: true },
  });
  orderIds.push(order.id);
  return order.id;
}

describe.skipIf(!loopback)('slip-verify find-or-create on the real engine', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (orderIds.length > 0) {
      // PaymentAttempt → Order is `onDelete: Restrict`, so children first.
      await prisma.paymentAttempt.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await prisma.$disconnect();
  });

  it('leaves exactly ONE pending attempt when five uploads race the same order', async () => {
    const orderId = await makeOrder();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        pendingAttemptFor({ id: orderId, totalAmountThb: 9, gatewayName: 'slip2go' }),
      ),
    );

    // Every caller — winner and losers alike — comes back with the same row.
    expect(new Set(results.map((r) => r.id)).size).toBe(1);

    const rows = await prisma.paymentAttempt.findMany({ where: { orderId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('pending');
    expect(rows[0]!.id).toBe(results[0]!.id);
  });

  it('reuses the pending row on a later upload, so the paid budget continues', async () => {
    const orderId = await makeOrder();

    const first = await pendingAttemptFor({
      id: orderId,
      totalAmountThb: 9,
      gatewayName: 'slip2go',
    });
    expect(first.priorRechecks).toBe(0);

    // The re-check sweep spends two provider calls on that row.
    await prisma.paymentAttempt.update({
      where: { id: first.id },
      data: { gatewayResponse: { rechecks: 2 } },
    });

    const retry = await pendingAttemptFor({ id: orderId, totalAmountThb: 9, gatewayName: 'slip2go' });
    expect(retry.id).toBe(first.id);
    // A customer tap must not hand out a fresh budget.
    expect(retry.priorRechecks).toBe(2);
    expect(await prisma.paymentAttempt.count({ where: { orderId } })).toBe(1);
  });

  it('is crash-safe: a failed claim leaves no marker and no attempt behind', async () => {
    const orderId = await makeOrder();
    const before = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { updatedAt: true },
    });

    // A transaction that claims the order and then dies must take the bump
    // with it — that is why the marker is the order's own timestamp and not a
    // row someone would have to clean up.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.order.updateMany({
          where: { id: orderId, updatedAt: before.updatedAt },
          data: { updatedAt: new Date() },
        });
        await tx.paymentAttempt.create({
          data: {
            orderId,
            paymentMethod: 'promptpay',
            gatewayName: 'slip2go',
            amountThb: 9,
            status: 'pending',
          },
        });
        throw new Error('SIMULATED_CRASH');
      }),
    ).rejects.toThrow('SIMULATED_CRASH');

    const after = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { updatedAt: true },
    });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(await prisma.paymentAttempt.count({ where: { orderId } })).toBe(0);

    // And the row is still claimable afterwards.
    const claim = await pendingAttemptFor({
      id: orderId,
      totalAmountThb: 9,
      gatewayName: 'slip2go',
    });
    expect(claim.priorRechecks).toBe(0);
    expect(await prisma.paymentAttempt.count({ where: { orderId } })).toBe(1);
  });

  it('moves the claim token FORWARD even when the stored token is in the future', async () => {
    // Two app servers, one clock ahead: a stamp of `new Date()` can land BEFORE
    // the token it replaces, which leaves that token valid and lets the other
    // upload match the row this one already claimed. The stamp must always be
    // strictly greater, so the token can never be replayed.
    const orderId = await makeOrder();
    const future = new Date(Date.now() + 60_000);
    await prisma.order.update({ where: { id: orderId }, data: { updatedAt: future } });

    const [first, second] = await Promise.all([
      pendingAttemptFor({ id: orderId, totalAmountThb: 9, gatewayName: 'slip2go' }),
      pendingAttemptFor({ id: orderId, totalAmountThb: 9, gatewayName: 'slip2go' }),
    ]);
    expect(first.id).toBe(second.id);
    expect(await prisma.paymentAttempt.count({ where: { orderId } })).toBe(1);

    const after = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { updatedAt: true },
    });
    expect(after.updatedAt.getTime()).toBeGreaterThan(future.getTime());
  });

  it('survives a writer that keeps touching the order: no twins, and a lost claim is recoverable', async () => {
    // Another writer (an evidence write, an admin edit, a second server) keeps
    // bumping the claim token while five uploads race. Whatever the interleaving
    // and whatever the retry budget does, two pending attempts must never exist
    // — and the order must stay claimable afterwards.
    const orderId = await makeOrder();

    let churn = true;
    const churner = (async () => {
      while (churn) {
        await prisma.order.update({
          where: { id: orderId },
          data: { updatedAt: nextCasStamp(new Date()) },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    })();

    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        pendingAttemptFor({ id: orderId, totalAmountThb: 9, gatewayName: 'slip2go' }),
      ),
    );
    churn = false;
    await churner;

    const fulfilled = settled.filter((s) => s.status === 'fulfilled');
    expect(new Set(fulfilled.map((s) => (s as PromiseFulfilledResult<{ id: string }>).value.id)).size).toBeLessThanOrEqual(1);
    expect(await prisma.paymentAttempt.count({ where: { orderId } })).toBeLessThanOrEqual(1);

    // Recovery: an exhausted retry is not a sticky failure.
    const later = await pendingAttemptFor({ id: orderId, totalAmountThb: 9, gatewayName: 'slip2go' });
    expect(later.priorRechecks).toBe(0);
    expect(await prisma.paymentAttempt.count({ where: { orderId } })).toBe(1);
  });

  it('lets exactly one order hold a bank reference, even when two confirm concurrently', async () => {
    // The unique `slipVerifiedRef` is the last line of defence against replaying
    // one real transfer across two orders. Two concurrent inserts must not both
    // land.
    const first = await makeOrder();
    const second = await makeOrder();
    const ref = `AUDIT-REF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const data = (orderId: string) => ({
      orderId,
      paymentMethod: 'promptpay',
      gatewayName: 'slip2go',
      amountThb: 9,
      status: 'pending',
      slipVerifiedRef: ref,
    });

    const settled = await Promise.allSettled([
      prisma.paymentAttempt.create({ data: data(first) }),
      prisma.paymentAttempt.create({ data: data(second) }),
    ]);

    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.paymentAttempt.count({ where: { slipVerifiedRef: ref } })).toBe(1);
  });

  it('serializes the confirmation claim: one runner settles an order, the rest lose', async () => {
    // The ordering guarantee for a slow provider that answers AFTER the sweep
    // already wrote a verdict: both runners reach the claim, only one may move
    // the order (the production helper uses this compare-and-set plus an
    // item check, which needs a product fixture and is covered in the unit
    // suites).
    const orderId = await makeOrder();
    const claim = () =>
      prisma.order.updateMany({
        where: { id: orderId, status: { in: ['pending_payment', 'expired'] } },
        data: { status: 'payment_confirmed' },
      });

    const counts = (await Promise.all([claim(), claim(), claim()])).map((r) => r.count).sort();
    expect(counts).toEqual([0, 0, 1]);
  });

  it('refuses to re-claim a delayed attempt that another runner already took', async () => {
    // What makes a re-check cheap: the sweep's claim is a CAS on the row's own
    // updatedAt and failureReason, so a closed or already-claimed attempt buys
    // no second provider call.
    const orderId = await makeOrder();
    const attempt = await prisma.paymentAttempt.create({
      data: {
        orderId,
        paymentMethod: 'promptpay',
        gatewayName: 'slip2go',
        amountThb: 9,
        status: 'pending',
        failureReason: 'SLIP_DELAYED',
      },
    });
    const claim = (token: Date) =>
      prisma.paymentAttempt.updateMany({
        where: { id: attempt.id, failureReason: 'SLIP_DELAYED', updatedAt: token },
        data: { updatedAt: nextCasStamp(token) },
      });

    expect((await claim(attempt.updatedAt)).count).toBe(1);
    // The second runner read the same row before the first wrote: stale token.
    expect((await claim(attempt.updatedAt)).count).toBe(0);

    // Once the sweep closes the attempt, even the current token cannot claim it.
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'failed', failureReason: null },
    });
    const current = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
      select: { updatedAt: true },
    });
    expect((await claim(current.updatedAt)).count).toBe(0);
  });
});
