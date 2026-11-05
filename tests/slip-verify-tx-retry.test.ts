/**
 * The confirmation transaction must survive its own timeout (2026-11-05).
 *
 * Production lesson (order NK-2026-000183, 2026-11-01): the provider said the
 * slip was genuine, the confirmation transaction ran on Prisma's 5s default,
 * a cold Passenger worker needed ~18.6s, the transaction expired mid-flight
 * (P2028) and the customer got a 500 while the order stayed `pending_payment`.
 * The fix was a 30s budget plus ONE automatic retry — and neither branch had
 * ever been exercised, because proving it "for real" was believed to need a
 * live slip and a slow database.
 *
 * It does not. What gets faked here is the slow boundary (the database
 * transaction) and only that:
 *
 * - `$transaction` runs the caller's work against a throwaway draft and then
 *   refuses to commit, throwing a P2028-shaped error — exactly the "transaction
 *   expired under us" semantics, including the rollback.
 * - The clock is real; the route's retry decision, its 30s/10s/timeout
 *   arguments, the claim/fail/park handling and the response bodies are the
 *   production code path.
 *
 * Pinned:
 *   R1  first attempt expires, retry commits → 200 `confirmed`, the slip is
 *       verified with the provider exactly ONCE (no second charge) and the
 *       attempt is recorded exactly once (no duplicate rows from the lost
 *       transaction).
 *   R2  both attempts expire → the verified payment is not thrown away: a
 *       clean 200 `pending_manual_fulfilment` (never a 500 to a customer whose
 *       money moved), order parked, attempt recorded once, no codes claimed.
 *   R3  even the parking write fails → 500 `RECONCILIATION_REQUIRED` is the
 *       honest answer, but a reconciliation row is written and no partial
 *       state survives (order still pending, attempt still pending, no claim).
 *   R4  a NON-retryable failure inside the transaction is not retried at all —
 *       only P2028/P2034 mean "the transaction was lost, run it again".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;

type AttemptRow = { id: string; status: string; slipVerifiedRef?: string };

type Store = {
  order: {
    id: string;
    status: string;
    manualFulfilmentReason: string | null;
    slipImageUrl: string | null;
  };
  attempts: AttemptRow[];
  settings: Row[];
  reconciliations: Row[];
  /** Committed writes only — a rolled-back transaction must not add to these. */
  writes: { attemptSucceeded: number; claim: number; fulfil: number };
  transactions: number;
  txOptions: Array<{ timeout?: number; maxWait?: number } | undefined>;
  /** What the next confirmation transactions do, in order. */
  confirmQueue: Array<'timeout' | 'generic'>;
  /** Make the parking transaction fail as well. */
  parkFails: boolean;
};

type Tx = {
  paymentAttempt: { update: (args: Row) => Promise<Row> };
  order: {
    update: (args: Row) => Promise<Row>;
    updateMany: (args: Row) => Promise<{ count: number }>;
  };
};

const h = vi.hoisted(() => ({
  prisma: {} as Row,
  state: {
    order: {
      id: 'ord-tx',
      status: 'pending_payment',
      manualFulfilmentReason: null as string | null,
      slipImageUrl: null as string | null,
    },
    attempts: [] as AttemptRow[],
    settings: [] as Row[],
    reconciliations: [] as Row[],
    writes: { attemptSucceeded: 0, claim: 0, fulfil: 0 },
    transactions: 0,
    txOptions: [] as Array<{ timeout?: number; maxWait?: number } | undefined>,
    confirmQueue: [] as Array<'timeout' | 'generic'>,
    parkFails: false,
  },
  verify: vi.fn(),
  fulfil: vi.fn(),
  claim: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: h.prisma }));
vi.mock('@/api/orders', () => ({
  getOrderById: vi.fn(async () => ORDER),
  claimOrderForConfirmation: h.claim,
}));
vi.mock('@/lib/fulfilment', () => ({
  fulfilOrder: h.fulfil,
  scheduleOutboxDrain: vi.fn(async () => undefined),
}));
vi.mock('@/lib/notify', () => ({
  notifyPaymentConfirmed: vi.fn(async () => undefined),
  notifyPaymentPending: vi.fn(async () => undefined),
  notifyStockAlertsForVariants: vi.fn(async () => undefined),
}));
vi.mock('@/lib/delivery/customerCodes', () => ({ getDeliveredCodes: vi.fn(async () => []) }));
vi.mock('@/lib/slipSecurity', () => ({
  isValidSlipUploadToken: () => true,
  mintSlipStorageKey: () => 'slip:tx-test',
  slipImageRoute: (key: string) => `/api/v1/payments/slip-download/${key.slice(5)}`,
}));
vi.mock('@/lib/rateLimit', () => ({
  getClientIp: () => '203.0.113.44',
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/data', () => ({
  getManualTransferInfo: vi.fn(async () => ({
    enabled: true,
    accountName: 'ร้านนกกะทา',
    accountNumber: '199-1-73578-6',
    accountType: 'bank',
    bankName: null,
    qrImageUrl: null,
  })),
}));
vi.mock('@/lib/payment/slip2go', () => ({
  isSlip2GoEnabled: () => true,
  verifySlip2Go: h.verify,
}));
vi.mock('@/lib/payment/slipok', () => ({
  isSlipVerificationEnabled: () => false,
  verifySlip: vi.fn(),
}));
vi.mock('@/lib/paymentReconciliation', () => ({ recordPaymentReconciliation: h.reconcile }));

import { POST } from '@/app/api/v1/payments/slip-verify/route';

const CONFIRM_TIMEOUT_MS = 30_000;
const PARK_TIMEOUT_MS = 10_000;

const ORDER = {
  id: 'ord-tx',
  orderNumber: 'NK-2026-000183',
  customerEmail: 'buyer@example.test',
  status: 'pending_payment',
  totalAmountThb: 9,
  confirmationUuid: 'cu-tx',
  items: [{ variantId: 'v1' }],
};

/** The genuine slip's masked receiver for store account 199-1-73578-6. */
const VERIFIED = {
  ok: true as const,
  ref: '016301135420CTF09818',
  amountThb: 9,
  receiverAccount: 'xxx-x-x3578-x',
  receiverName: 'ร้านนกกะทา',
  transferAt: null,
  raw: {},
};

const PNG_B64 = 'iVBORw0KGgo=';

/** Prisma's shape for a transaction that expired mid-flight. */
function p2028(): Error {
  const err = new Error(
    'Transaction already closed: A query cannot be executed on an expired transaction. (P2028)',
  );
  return Object.assign(err, { code: 'P2028' });
}

/** Prisma args are loose here on purpose — only `where`/`data` are read. */
function pick(args: Row): { where: Row; data: Row } {
  return {
    where: (args['where'] ?? {}) as Row,
    data: (args['data'] ?? {}) as Row,
  };
}

function makeTx(draft: Store): Tx {
  return {
    paymentAttempt: {
      update: async (args: Row) => {
        const { where, data } = pick(args);
        const row = draft.attempts.find((a) => a.id === where['id']);
        if (row) Object.assign(row, data);
        if (data['status'] === 'succeeded') draft.writes.attemptSucceeded += 1;
        return {};
      },
    },
    order: {
      update: async (args: Row) => {
        const { data } = pick(args);
        Object.assign(draft.order, data);
        if (data['status'] === 'fulfilled') draft.writes.fulfil += 1;
        return {};
      },
      updateMany: async (args: Row) => {
        const { where, data } = pick(args);
        const wanted = (where['status'] as { in?: string[] } | undefined)?.in ?? [];
        const hit = wanted.includes(draft.order.status) && draft.order.id === where['id'];
        if (!hit) return { count: 0 };
        Object.assign(draft.order, data);
        draft.writes.claim += 1;
        return { count: 1 };
      },
    },
  };
}

function copy(state: Store): Store {
  return JSON.parse(JSON.stringify(state)) as Store;
}

/**
 * The database, with ONE deliberate defect: a confirmation transaction can
 * "expire" after doing its work. The work is applied to a draft that is then
 * thrown away, so the visible state is exactly what a real rollback leaves.
 */
function installDb(): void {
  const s = h.state;
  Object.assign(h.prisma, {
    siteSetting: {
      create: async (args: Row) => {
        s.settings.push(pick(args).data);
        return {};
      },
    },
    order: {
      update: async (args: Row) => {
        Object.assign(s.order, pick(args).data);
        return {};
      },
      findUnique: async () => ({ status: s.order.status }),
    },
    paymentAttempt: {
      findFirst: async () => s.attempts.find((a) => a.status === 'pending') ?? null,
      create: async (args: Row) => {
        const { data } = pick(args);
        const row: AttemptRow = {
          id: `att-${s.attempts.length + 1}`,
          status: String(data['status'] ?? 'pending'),
        };
        s.attempts.push(row);
        return { id: row.id };
      },
      update: async (args: Row) => {
        const { where, data } = pick(args);
        const row = s.attempts.find((a) => a.id === where['id']);
        if (row) Object.assign(row, data);
        return {};
      },
    },
    $transaction: async (
      fn: (tx: Tx) => Promise<unknown>,
      opts?: { timeout?: number; maxWait?: number },
    ) => {
      s.transactions += 1;
      s.txOptions.push(opts);
      const isConfirm = opts?.timeout === CONFIRM_TIMEOUT_MS;
      const isPark = opts?.timeout === PARK_TIMEOUT_MS;
      if (isPark && s.parkFails) throw p2028();

      const next = isConfirm ? s.confirmQueue.shift() : undefined;
      if (next === 'timeout' || next === 'generic') {
        // The transaction does its work, then cannot commit.
        await fn(makeTx(copy(s)));
        throw next === 'timeout' ? p2028() : new Error('boom');
      }
      return fn(makeTx(s));
    },
  });
}

function postVerify(): NextRequest {
  return new NextRequest('http://localhost/api/v1/payments/slip-verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orderId: ORDER.id, token: 'tok', imageBase64: PNG_B64 }),
  });
}

type Body = { status?: string; paymentVerified?: boolean; error?: string; codes?: unknown[] };

async function call(): Promise<{ res: Response; body: Body }> {
  const res = await POST(postVerify());
  return { res, body: (await res.json()) as Body };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.order.status = 'pending_payment';
  h.state.order.manualFulfilmentReason = null;
  h.state.order.slipImageUrl = null;
  h.state.attempts.length = 0;
  h.state.settings.length = 0;
  h.state.reconciliations.length = 0;
  h.state.writes = { attemptSucceeded: 0, claim: 0, fulfil: 0 };
  h.state.transactions = 0;
  h.state.txOptions.length = 0;
  h.state.confirmQueue = [];
  h.state.parkFails = false;
  installDb();

  h.verify.mockResolvedValue(VERIFIED);
  h.claim.mockImplementation(async (orderId: string, tx: Tx) => {
    const r = await tx.order.updateMany({
      where: { id: orderId, status: { in: ['pending_payment', 'expired'] } },
      data: { status: 'paid' },
    });
    return r.count > 0 ? { id: orderId } : null;
  });
  h.fulfil.mockImplementation(async (orderId: string, tx: Tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: 'fulfilled' } });
    return { success: true };
  });
  h.reconcile.mockImplementation(async (row: Row) => {
    h.state.reconciliations.push(row);
    return 'rec-1';
  });
});

describe('POST /api/v1/payments/slip-verify — confirmation transaction expiry', () => {
  it('R1: a timeout the retry rescues confirms once, without re-charging or double-recording', async () => {
    h.state.confirmQueue = ['timeout'];

    const { res, body } = await call();

    expect(res.status).toBe(200);
    expect(body.status).toBe('confirmed');
    // Two confirmation attempts (the expired one + the retry), and the
    // production budget is still 30s — the timeout was faked, not loosened.
    expect(h.state.transactions).toBe(2);
    expect(h.state.txOptions[0]?.timeout).toBe(CONFIRM_TIMEOUT_MS);

    // The provider was asked exactly once: a retry must never re-verify (and
    // never re-charge) the same slip.
    expect(h.verify).toHaveBeenCalledTimes(1);

    // Only the committed attempt is visible: the lost transaction left nothing
    // behind, so there is one attempt row, recorded succeeded exactly once.
    expect(h.state.attempts).toHaveLength(1);
    expect(h.state.attempts[0]?.status).toBe('succeeded');
    expect(h.state.attempts[0]?.slipVerifiedRef).toBe(VERIFIED.ref);
    expect(h.state.writes).toEqual({ attemptSucceeded: 1, claim: 1, fulfil: 1 });
    expect(h.state.order.status).toBe('fulfilled');
    expect(h.state.reconciliations).toHaveLength(0);
  });

  it('R2: exhausting the retry keeps the verified payment and parks the order, never a 500', async () => {
    h.state.confirmQueue = ['timeout', 'timeout'];

    const { res, body } = await call();

    // The customer's money moved; the answer says so. No 500, no "failed".
    expect(res.status).toBe(200);
    expect(body.status).toBe('pending_manual_fulfilment');
    expect(body.paymentVerified).toBe(true);
    expect(body.codes).toEqual([]);
    expect(h.verify).toHaveBeenCalledTimes(1);

    // The parking transaction committed the payment exactly once — the two
    // expired attempts contributed nothing.
    expect(h.state.transactions).toBe(3); // confirm, confirm, park
    expect(h.state.writes.attemptSucceeded).toBe(1);
    expect(h.state.writes.claim).toBe(1);
    expect(h.state.writes.fulfil).toBe(0);
    expect(h.state.attempts).toHaveLength(1);
    expect(h.state.attempts[0]?.status).toBe('succeeded');
    expect(h.state.order.status).toBe('pending_manual_fulfilment');
    expect(h.state.order.manualFulfilmentReason).toBe('DELIVERY_PENDING');
    expect(h.state.reconciliations).toHaveLength(0);
  });

  it('R3: when even parking fails the answer is honest and no partial state survives', async () => {
    h.state.confirmQueue = ['timeout', 'timeout'];
    h.state.parkFails = true;

    const { res, body } = await call();

    expect(res.status).toBe(500);
    expect(body.error).toBe('RECONCILIATION_REQUIRED');
    // A human is told, with the reference, instead of the payment vanishing.
    expect(h.reconcile).toHaveBeenCalledTimes(1);
    expect(h.state.reconciliations[0]).toMatchObject({
      trigger: 'slip_verify_recovery_failed',
      paymentRef: VERIFIED.ref,
    });
    // Nothing half-written: the order is still pending and payable, the
    // attempt is still pending, and no claim/fulfilment counts were committed.
    expect(h.state.order.status).toBe('pending_payment');
    expect(h.state.attempts).toHaveLength(1);
    expect(h.state.attempts[0]?.status).toBe('pending');
    expect(h.state.writes).toEqual({ attemptSucceeded: 0, claim: 0, fulfil: 0 });
  });

  it('R4: a non-timeout failure is not retried — only a lost transaction is', async () => {
    h.state.confirmQueue = ['generic'];

    const { res, body } = await call();

    // One confirmation attempt (no retry) + the parking transaction.
    expect(h.state.transactions).toBe(2);
    expect(h.state.txOptions).toHaveLength(2);
    expect(h.state.txOptions[0]?.timeout).toBe(CONFIRM_TIMEOUT_MS);
    expect(h.state.txOptions[1]?.timeout).toBe(PARK_TIMEOUT_MS);
    expect(res.status).toBe(200);
    expect(body.status).toBe('pending_manual_fulfilment');
    expect(h.state.writes.attemptSucceeded).toBe(1);
  });
});
