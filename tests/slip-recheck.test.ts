/**
 * Background re-check of `SLIP_DELAYED` slips (2026-11-22).
 *
 * Bangkok Bank / GSB publish a transfer 2–3 minutes after it happens, so a
 * genuine กรุงเทพ slip answers "not found" first. Until now the only retry was
 * the customer tapping ตรวจสลิปอีกครั้ง — close the tab and a paid order sat
 * unpaid until an admin noticed.
 *
 * What these tests pin:
 *   · a delayed slip that the bank has since published CONFIRMS through the
 *     same settlement transaction as the customer-facing route;
 *   · another "not found" costs one retry, not an infinite loop (`rechecks`
 *     counter + the attempt marked `failed` when the budget is spent);
 *   · nothing spends a provider credit for an order that is no longer
 *     payable, for a slip whose file is gone, or when another runner already
 *     claimed the check (the timer and the sweep can fire together);
 *   · the sweep's query only ever selects delayed, payable, stored slips;
 *   · the internal endpoint keeps the sibling sweeps' fail-closed auth.
 *
 * The real `verifySlipImage` and `confirmVerifiedSlip` run here — only the
 * provider, prisma and delivery edges are mocked — so the receiver rule and
 * the settlement branches are exercised, not stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'recheck-test-secret-0123456789abcdef0123456789ab';

const STORE_ACCOUNT = '199-1-73578-6';
/** The bank's own mask for that account — the slip this feature exists for. */
const BBL_MASK = '199-1-xxx786';

const { prismaMock, provider, ordersMock, fulfilmentMock, notifyMock, storeMock, dataMock } =
  vi.hoisted(() => {
    const prismaMock = {
      paymentAttempt: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
      },
      order: { findUnique: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
    };
    const provider = { verifySlip2Go: vi.fn(), verifySlip: vi.fn() };
    const ordersMock = { claimOrderForConfirmation: vi.fn() };
    const fulfilmentMock = {
      fulfilOrder: vi.fn(),
      scheduleOutboxDrain: vi.fn(async () => undefined),
    };
    const notifyMock = {
      notifyPaymentConfirmed: vi.fn(),
      notifyPaymentPending: vi.fn(),
      notifyStockAlertsForVariants: vi.fn(async () => undefined),
    };
    const storeMock = {
      readSlip: vi.fn(),
      normalizeSlipKey: vi.fn((k: string) => k),
      // Shared URL→key helper (one owner, src/lib/slipStore.ts): the re-check
      // and the admin "read the receiver" action both need it.
      slipKeyFromImageUrl: vi.fn((url: string | null | undefined) =>
        url ? (url.split('/').pop() ?? null) : null,
      ),
    };
    const dataMock = {
      getManualTransferInfo: vi.fn(async () => ({ accountNumber: STORE_ACCOUNT })),
    };
    return { prismaMock, provider, ordersMock, fulfilmentMock, notifyMock, storeMock, dataMock };
  });

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/api/orders', () => ordersMock);
vi.mock('@/lib/fulfilment', () => fulfilmentMock);
vi.mock('@/lib/notify', () => notifyMock);
vi.mock('@/lib/slipStore', () => storeMock);
vi.mock('@/lib/data', () => dataMock);
vi.mock('@/lib/paymentReconciliation', () => ({ recordPaymentReconciliation: vi.fn(async () => 'rec') }));
vi.mock('@/lib/payment/slip2go', () => ({
  isSlip2GoEnabled: () => true,
  isSlipVerificationEnabled: () => false,
  verifySlip2Go: provider.verifySlip2Go,
}));
vi.mock('@/lib/payment/slipok', () => ({
  isSlipVerificationEnabled: () => false,
  verifySlip: provider.verifySlip,
}));

import {
  recheckDelayedAttempt,
  recheckDelayedSlips,
  SLIP_RECHECK_DELAY_MS,
  SLIP_RECHECK_MAX_ATTEMPTS,
} from '@/lib/slipRecheck';

const CHECKED_AT = new Date('2026-11-22T05:00:00Z');

function attemptRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'att-1',
    status: 'pending',
    failureReason: 'SLIP_DELAYED',
    gatewayResponse: { error: 'SLIP_DELAYED', rechecks: 0 },
    updatedAt: CHECKED_AT,
    order: {
      id: 'ord-1',
      orderNumber: 'NK-2026-000735',
      customerEmail: 'buyer@example.com',
      status: 'pending_payment',
      totalAmountThb: '735',
      slipImageUrl: '/api/v1/payments/slip-download/0123456789abcdef0123456789abcdef',
      items: [{ variantId: 'v-1' }],
    },
    ...over,
  };
}

function seededVerify(): void {
  // What the bank reports for this account, BBL middle-mask included.
  provider.verifySlip2Go.mockResolvedValue({
    ok: true,
    ref: 'ref-735',
    amountThb: 735,
    receiverAccount: BBL_MASK,
    receiverName: null,
    transferAt: null,
    raw: { ok: true },
  });
  ordersMock.claimOrderForConfirmation.mockResolvedValue({ id: 'ord-1' });
  fulfilmentMock.fulfilOrder.mockResolvedValue({ success: true, codes: ['c1'] });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.paymentAttempt.findUnique.mockResolvedValue(attemptRow());
  prismaMock.paymentAttempt.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.paymentAttempt.update.mockResolvedValue({});
  prismaMock.paymentAttempt.findMany.mockResolvedValue([]);
  prismaMock.order.findUnique.mockResolvedValue({ status: 'pending_payment' });
  prismaMock.order.update.mockResolvedValue({});
  storeMock.readSlip.mockResolvedValue(Buffer.from('slip-bytes'));
  dataMock.getManualTransferInfo.mockResolvedValue({ accountNumber: STORE_ACCOUNT });
});

describe('recheckDelayedAttempt — a Bangkok Bank slip the bank has since published', () => {
  it('confirms through the same settlement transaction as the customer route', async () => {
    seededVerify();

    const outcome = await recheckDelayedAttempt('att-1');

    expect(outcome).toEqual({ kind: 'confirmed' });
    expect(provider.verifySlip2Go).toHaveBeenCalledTimes(1);
    // The stored image, not the customer's file, is what was re-checked.
    expect(storeMock.readSlip).toHaveBeenCalledWith('0123456789abcdef0123456789abcdef');
    // Settled + claimed + delivered in one transaction.
    expect(prismaMock.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'succeeded', slipVerifiedRef: 'ref-735' }) }),
    );
    expect(fulfilmentMock.fulfilOrder).toHaveBeenCalledWith('ord-1', prismaMock);
    // The customer is not on the page, so the ops channel and the outbox
    // carry the result instead.
    expect(notifyMock.notifyPaymentConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: 'NK-2026-000735', totalThb: 735 }),
    );
    expect(fulfilmentMock.scheduleOutboxDrain).toHaveBeenCalled();
  });
});

describe('recheckDelayedAttempt — still delayed', () => {
  it('costs one retry and keeps the attempt queued', async () => {
    provider.verifySlip2Go.mockResolvedValue({
      ok: false,
      code: 'SLIP_DELAYED',
      detail: 'not found yet',
    });

    const outcome = await recheckDelayedAttempt('att-1');

    expect(outcome).toEqual({ kind: 'delayed', rechecks: 1 });
    const update = prismaMock.paymentAttempt.update.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(update.data['failureReason']).toBe('SLIP_DELAYED');
    expect(update.data['status']).toBeUndefined();
    expect(update.data['gatewayResponse']).toMatchObject({ error: 'SLIP_DELAYED', rechecks: 1 });
  });

  it('marks the attempt failed once the retry budget is spent', async () => {
    prismaMock.paymentAttempt.findUnique.mockResolvedValue(
      attemptRow({
        gatewayResponse: { error: 'SLIP_DELAYED', rechecks: SLIP_RECHECK_MAX_ATTEMPTS - 1 },
      }),
    );
    provider.verifySlip2Go.mockResolvedValue({ ok: false, code: 'SLIP_DELAYED' });

    const outcome = await recheckDelayedAttempt('att-1');

    expect(outcome).toEqual({ kind: 'closed', detail: 'budget-spent' });
    const update = prismaMock.paymentAttempt.update.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    // `failed` is what takes it out of the sweep — the verdict stays readable.
    expect(update.data['status']).toBe('failed');
    expect(update.data['failureReason']).toBe('SLIP_DELAYED');
  });

  it('a real verdict on the retry replaces the delay, so the admin sees it', async () => {
    provider.verifySlip2Go.mockResolvedValue({
      ok: false,
      code: 'AMOUNT_MISMATCH',
      detail: 'amount 700 vs order 735',
    });

    const outcome = await recheckDelayedAttempt('att-1');

    expect(outcome).toEqual({ kind: 'closed', detail: 'AMOUNT_MISMATCH' });
    const update = prismaMock.paymentAttempt.update.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(update.data).toMatchObject({
      status: 'failed',
      failureReason: 'AMOUNT_MISMATCH',
      gatewayStatusCode: 'slip2go',
    });
  });
});

describe('recheckDelayedAttempt — never spends a credit it cannot use', () => {
  it('skips an order that is no longer payable', async () => {
    prismaMock.paymentAttempt.findUnique.mockResolvedValue(
      attemptRow({
        order: { ...(attemptRow()['order'] as Record<string, unknown>), status: 'completed' },
      }),
    );

    const outcome = await recheckDelayedAttempt('att-1');

    expect(outcome).toEqual({ kind: 'skipped', reason: 'order-completed' });
    expect(provider.verifySlip2Go).not.toHaveBeenCalled();
    expect(storeMock.readSlip).not.toHaveBeenCalled();
  });

  it('skips an attempt whose verdict already moved on (the customer retried)', async () => {
    prismaMock.paymentAttempt.findUnique.mockResolvedValue(attemptRow({ failureReason: null }));

    const outcome = await recheckDelayedAttempt('att-1');

    expect(outcome.kind).toBe('skipped');
    expect(provider.verifySlip2Go).not.toHaveBeenCalled();
  });

  it('loses the claim when another runner took this check', async () => {
    prismaMock.paymentAttempt.updateMany.mockResolvedValue({ count: 0 });

    const outcome = await recheckDelayedAttempt('att-1');

    expect(outcome).toEqual({ kind: 'skipped', reason: 'claimed-by-another-run' });
    expect(provider.verifySlip2Go).not.toHaveBeenCalled();
  });

  it('closes the auto-check when the stored slip file is gone', async () => {
    storeMock.readSlip.mockResolvedValue(null);

    const outcome = await recheckDelayedAttempt('att-1');

    expect(outcome).toEqual({ kind: 'closed', detail: 'slip-unavailable' });
    expect(provider.verifySlip2Go).not.toHaveBeenCalled();
    expect(prismaMock.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });
});

describe('recheckDelayedSlips — the sweep', () => {
  it('queries only delayed, payable, stored, backed-off attempts and tallies outcomes', async () => {
    const now = new Date('2026-11-22T06:00:00Z');
    prismaMock.paymentAttempt.findMany.mockResolvedValue([{ id: 'att-1' }, { id: 'att-2' }]);
    seededVerify();
    prismaMock.paymentAttempt.findUnique
      .mockResolvedValueOnce(attemptRow())
      .mockResolvedValueOnce(attemptRow({ id: 'att-2' }));
    // Second order's provider answer stays delayed.
    provider.verifySlip2Go
      .mockResolvedValueOnce({
        ok: true,
        ref: 'ref-735',
        amountThb: 735,
        receiverAccount: BBL_MASK,
        receiverName: null,
        transferAt: null,
        raw: {},
      })
      .mockResolvedValueOnce({ ok: false, code: 'SLIP_DELAYED' });

    const tally = await recheckDelayedSlips({ now, batchSize: 10 });

    const query = prismaMock.paymentAttempt.findMany.mock.calls[0]![0] as {
      where: {
        status: string;
        failureReason: string;
        updatedAt: { lte: Date; gte: Date };
        order: { status: { in: string[] }; slipImageUrl: { not: null } };
      };
      take: number;
    };
    expect(query.where.status).toBe('pending');
    expect(query.where.failureReason).toBe('SLIP_DELAYED');
    expect(query.where.order.status.in).toEqual(['pending_payment', 'expired']);
    expect(query.where.order.slipImageUrl).toEqual({ not: null });
    expect(query.where.updatedAt.lte.toISOString()).toBe(
      new Date(now.getTime() - SLIP_RECHECK_DELAY_MS).toISOString(),
    );
    expect(query.where.updatedAt.gte.getTime()).toBeLessThan(query.where.updatedAt.lte.getTime());
    expect(query.take).toBe(10);

    expect(tally).toEqual({ scanned: 2, confirmed: 1, parked: 0, delayed: 1, closed: 0, skipped: 0 });
  });
});

describe('POST /api/v1/internal/orders/slip-recheck — cron auth', () => {
  const routePath = '../src/app/api/v1/internal/orders/slip-recheck/route.ts';
  const call = async (headers: Record<string, string>): Promise<Response> => {
    const mod = (await import(routePath)) as Record<string, unknown>;
    return (mod['POST'] as (req: NextRequest) => Promise<Response>)(
      new NextRequest('http://localhost/api/v1/internal/orders/slip-recheck', {
        method: 'POST',
        headers,
      }),
    );
  };

  it('fails closed with 503 when NK_CRON_SECRET is unset', async () => {
    vi.stubEnv('NK_CRON_SECRET', '');
    const res = await call({ 'x-cron-token': 'anything' });
    expect(res.status).toBe(503);
    vi.unstubAllEnvs();
  });

  it('401s a wrong token and runs the sweep for the right one', async () => {
    vi.stubEnv('NK_CRON_SECRET', 'cron-secret-value');
    expect((await call({ 'x-cron-token': 'wrong' })).status).toBe(401);

    const ok = await call({ 'x-cron-token': 'cron-secret-value' });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { ok: boolean; scanned: number };
    expect(body.ok).toBe(true);
    expect(body.scanned).toBe(0);
    vi.unstubAllEnvs();
  });
});
