/**
 * Receiver-rule watch (2026-11-22).
 *
 * `checkReceiverMatch` fails closed, so a bank mask the rule cannot read and a
 * customer who really paid the wrong account look identical: both become
 * `RECEIVER_MISMATCH`. Both corrections on record (2026-10-30, and the Bangkok
 * Bank middle-mask on 2026-11-22) were found because a customer complained —
 * this signal exists so the shop sees the count first.
 *
 * What is pinned here:
 *   · the two numbers and their windows (current 24 h vs the 24 h before, `to`
 *     exclusive so no row is counted twice);
 *   · `confirmedAfterFail` only counts a MANUAL confirmation that happened
 *     AFTER the rule refused that order's slip — a customer retry that passed
 *     is not an override;
 *   · the spike rule (any override, or ≥3 refusals and more than yesterday);
 *   · a DB failure degrades to `null` instead of taking down the dashboard or
 *     the health endpoint it feeds.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    paymentAttempt: { count: vi.fn(), findMany: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn() },
    order: { count: vi.fn() },
    emailOutbox: { count: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

import {
  receiverRuleCounts,
  receiverRuleSignalOrNull,
  receiverRuleSummary,
  RECEIVER_RULE_SPIKE_MIN_FAILS,
  RECEIVER_RULE_WINDOW_HOURS,
} from '@/lib/slipRuleSignals';

const NOW = new Date('2026-11-22T12:00:00Z');
const HOUR = 60 * 60_000;
const at = (hoursAgo: number): Date => new Date(NOW.getTime() - hoursAgo * HOUR);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.paymentAttempt.count.mockResolvedValue(0);
  prismaMock.paymentAttempt.findMany.mockResolvedValue([]);
  prismaMock.auditLog.findMany.mockResolvedValue([]);
});

describe('receiverRuleCounts', () => {
  it('counts RECEIVER_MISMATCH verdicts in the window and asks for the right range', async () => {
    prismaMock.paymentAttempt.count.mockResolvedValue(4);

    const counts = await receiverRuleCounts(at(24), NOW);

    expect(counts).toEqual({ autoFails: 4, confirmedAfterFail: 0 });
    const where = prismaMock.paymentAttempt.count.mock.calls[0]![0] as {
      where: { failureReason: string; updatedAt: { gte: Date; lt: Date } };
    };
    expect(where.where.failureReason).toBe('RECEIVER_MISMATCH');
    // `lt` (not `lte`) is what keeps two adjacent windows from double-counting.
    expect(where.where.updatedAt.lt).toEqual(NOW);
    expect(where.where.updatedAt.gte).toEqual(at(24));
  });

  it('counts an admin override, and only when it came after the refusal', async () => {
    prismaMock.paymentAttempt.count.mockResolvedValue(2);
    prismaMock.auditLog.findMany.mockResolvedValue([
      // Confirmed after the rule refused this order's slip → an override.
      { recordId: 'ord-refused', createdAt: at(1) },
      // Confirmed BEFORE the refusal (the customer retried and it passed) → not.
      { recordId: 'ord-retried', createdAt: at(5) },
      // Confirmed for an order with no refusal at all → not.
      { recordId: 'ord-clean', createdAt: at(2) },
    ]);
    prismaMock.paymentAttempt.findMany.mockResolvedValue([
      { orderId: 'ord-refused', updatedAt: at(3) },
      { orderId: 'ord-retried', updatedAt: at(4) },
    ]);

    const counts = await receiverRuleCounts(at(24), NOW);

    expect(counts.confirmedAfterFail).toBe(1);
    const query = prismaMock.paymentAttempt.findMany.mock.calls[0]![0] as {
      where: { orderId: { in: string[] }; failureReason: string };
    };
    // One query for every confirmed order in the window, scoped to the
    // mismatch verdict — the timestamp comparison happens in JS because
    // "confirmed after ITS OWN refusal" is not expressible as a row filter.
    expect(query.where.orderId.in.sort()).toEqual(['ord-clean', 'ord-refused', 'ord-retried']);
    expect(query.where.failureReason).toBe('RECEIVER_MISMATCH');
  });

  it('uses the EARLIEST refusal when an order was refused more than once', async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([{ recordId: 'ord-1', createdAt: at(2) }]);
    prismaMock.paymentAttempt.findMany.mockResolvedValue([
      { orderId: 'ord-1', updatedAt: at(1) }, // refusal AFTER the confirmation
      { orderId: 'ord-1', updatedAt: at(6) }, // the refusal that preceded it
    ]);

    expect((await receiverRuleCounts(at(24), NOW)).confirmedAfterFail).toBe(1);
  });

  it('skips the second query entirely when nobody confirmed anything', async () => {
    await receiverRuleCounts(at(24), NOW);
    expect(prismaMock.paymentAttempt.findMany).not.toHaveBeenCalled();
  });
});

describe('receiverRuleSummary', () => {
  it('compares the rolling 24 h against the 24 h before it', async () => {
    prismaMock.paymentAttempt.count
      .mockResolvedValueOnce(1) // current window
      .mockResolvedValueOnce(5); // previous window

    const summary = await receiverRuleSummary(NOW);

    expect(summary.windowHours).toBe(RECEIVER_RULE_WINDOW_HOURS);
    expect(summary.current.autoFails).toBe(1);
    expect(summary.previous.autoFails).toBe(5);
    expect(summary.spike).toBe(false);
    const ranges = prismaMock.paymentAttempt.count.mock.calls.map(
      (c) => (c[0] as { where: { updatedAt: { gte: Date; lt: Date } } }).where.updatedAt,
    );
    expect(ranges[0]!.gte).toEqual(at(24));
    expect(ranges[0]!.lt).toEqual(NOW);
    expect(ranges[1]!.gte).toEqual(at(48));
    expect(ranges[1]!.lt).toEqual(at(24));
  });

  it('flags a single admin override as a spike on its own', async () => {
    prismaMock.paymentAttempt.count.mockResolvedValue(1);
    prismaMock.auditLog.findMany.mockResolvedValue([{ recordId: 'ord-1', createdAt: at(1) }]);
    prismaMock.paymentAttempt.findMany.mockResolvedValue([{ orderId: 'ord-1', updatedAt: at(2) }]);

    const summary = await receiverRuleSummary(NOW);

    expect(summary.current).toEqual({ autoFails: 1, confirmedAfterFail: 1 });
    expect(summary.spike).toBe(true);
  });

  it('flags a jump in refusals, but not a steady or tiny number', async () => {
    // 3 refused today vs 1 yesterday → volume spike.
    prismaMock.paymentAttempt.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    expect((await receiverRuleSummary(NOW)).spike).toBe(true);

    // 3 vs 3 → no drift.
    prismaMock.paymentAttempt.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);
    expect((await receiverRuleSummary(NOW)).spike).toBe(false);

    // 2 vs 0 → below the floor, one unhappy payer is not a rule problem.
    prismaMock.paymentAttempt.count
      .mockResolvedValueOnce(RECEIVER_RULE_SPIKE_MIN_FAILS - 1)
      .mockResolvedValueOnce(0);
    expect((await receiverRuleSummary(NOW)).spike).toBe(false);
  });
});

describe('receiverRuleSignalOrNull', () => {
  it('degrades to null instead of failing the dashboard or health payload', async () => {
    prismaMock.paymentAttempt.count.mockRejectedValue(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await receiverRuleSignalOrNull(NOW)).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('ops-health exposes the signal', () => {
  it('returns slipRule alongside the other monitored numbers', async () => {
    vi.stubEnv('NK_INTERNAL_TOKEN', 'ops-token');
    prismaMock.order.count.mockResolvedValue(2);
    prismaMock.emailOutbox.count.mockResolvedValue(1);
    prismaMock.auditLog.count.mockResolvedValue(0);
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ count: 9n }]);
    prismaMock.paymentAttempt.count.mockResolvedValue(3);

    try {
      const { GET } = await import('@/app/api/v1/internal/ops-health/route');
      const res = await GET(
        new Request('https://x.test/api', { headers: { authorization: 'Bearer ops-token' } }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body['paidUnfulfilledOrders']).toBe(2);
      expect(body['slipRule']).toMatchObject({
        windowHours: RECEIVER_RULE_WINDOW_HOURS,
        current: { autoFails: 3, confirmedAfterFail: 0 },
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
