/**
 * Recovery after fulfilment failure — external audit #4 (2026-09-27).
 *
 * Contract after the fix:
 *  1. The recovery transaction (manual-fulfilment parking after
 *     INSUFFICIENT_STOCK) is AWAITED and its outcome verified BEFORE the
 *     route answers. Success-shaped answers only after a real commit.
 *  2. A failed recovery answers 5xx (RECONCILIATION_REQUIRED /
 *     FULFILMENT_FAILED) and leaves a durable
 *     `payment_reconciliation_required` audit row (money was PROVEN
 *     received — SlipOK said so — and must never vanish unrecorded).
 *  3. ALREADY_CLAIMED races are separated from real failures by reading the
 *     live order status, and every stale route still answers honestly.
 *
 * Fault injection mirrors tests/audit-atomicity.test.ts: the prisma mock
 * runs $transaction(fn) with itself as the tx client, individual model
 * calls reject on demand, and the audit write is a spy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'recovery-test-secret-0123456789abcdef0123456789abcdef';

type Recorded = { data: Record<string, unknown> };

const { prismaMock, auditCreate, ordersMock, fulfilmentMock, rbacMock } = vi.hoisted(() => {
  const auditCreate = vi.fn(async () => ({ id: 'rec_1' }));
  const ordersMock = {
    claimOrderForConfirmation: vi.fn(),
    getOrderById: vi.fn(),
  };
  const fulfilmentMock = {
    fulfilOrder: vi.fn(),
    scheduleOutboxDrain: vi.fn(async () => undefined),
  };
  const rbacMock = { checkPermission: vi.fn(async () => ({ allowed: true })) };

  const prismaMock = {
    paymentAttempt: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    order: {
      findUnique: vi.fn(),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    productVariant: { findMany: vi.fn(async () => []) },
    // Interactive-tx shape: the mock passes ITSELF as the tx client.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
    auditLog: { create: auditCreate, findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
  };
  return { prismaMock, auditCreate, ordersMock, fulfilmentMock, rbacMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => ({
  writeAuditLog: vi.fn(async () => ({})),
}));
vi.mock('@/api/orders', () => ordersMock);
vi.mock('@/lib/fulfilment', () => fulfilmentMock);
vi.doMock('@/lib/rbac', () => rbacMock);
vi.mock('@/lib/notify', () => ({
  getNotificationSettings: vi.fn(async () => ({})),
  notifyPaymentConfirmed: vi.fn(async () => undefined),
  notifyStockLow: vi.fn(async () => undefined),
}));

// SlipOK + upload-token mocks for the slip-verify route (top level —
// vi.hoisted/doMock must live at the module's top scope).
const { verifySlipMock, tokenMock } = vi.hoisted(() => {
  const verifySlipMock = {
    isSlipVerificationEnabled: vi.fn(() => true),
    verifySlip: vi.fn(),
  };
  const tokenMock = { isValidSlipUploadToken: vi.fn(() => true) };
  return { verifySlipMock, tokenMock };
});
vi.doMock('@/lib/payment/slipok', () => verifySlipMock);
vi.doMock('@/lib/slipSecurity', () => tokenMock);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.paymentAttempt.updateMany.mockResolvedValue({ count: 1 });
});

import { recordPaymentReconciliation } from '@/lib/paymentReconciliation';

const reconCalls = (): Recorded[] =>
  (auditCreate.mock.calls as unknown as Recorded[][])
    .map((c) => c[0]!)
    .filter((d) => d.data['action'] === 'payment_reconciliation_required');

describe('recordPaymentReconciliation', () => {
  it('writes a durable audit row with action, order id, ref and recovery error', async () => {
    const id = await recordPaymentReconciliation({
      trigger: 'slip_verify_recovery_failed',
      orderId: 'ord-1',
      orderNumber: 'NK-2001',
      paymentRef: 'slip-ref-1',
      paymentAttemptId: 'att-1',
      failureReason: 'INSUFFICIENT_STOCK',
      recoveryError: 'db down',
    });
    expect(id).toBe('rec_1');
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const arg = (auditCreate.mock.calls as unknown as Recorded[][])[0]![0]!;
    expect(arg.data['action']).toBe('payment_reconciliation_required');
    expect(arg.data['tableName']).toBe('Order');
    expect(arg.data['recordId']).toBe('ord-1');
    const meta = arg.data['metadata'] as Record<string, unknown>;
    expect(meta['trigger']).toBe('slip_verify_recovery_failed');
    expect(meta['paymentRef']).toBe('slip-ref-1');
    expect(meta['recoveryError']).toBe('db down');
  });

  it('never throws when the audit write itself fails (console trail)', async () => {
    auditCreate.mockRejectedValueOnce(new Error('audit db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = await recordPaymentReconciliation({
      trigger: 'webhook_recovery_failed',
      orderId: 'ord-2',
      failureReason: 'x',
      recoveryError: 'y',
    });
    expect(id).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('POST /api/v1/payments/slip-verify — recovery honesty (audit #4)', () => {
  const routePath = '../src/app/api/v1/payments/slip-verify/route.ts';
  const call = async (req: NextRequest): Promise<Response> => {
    const route = (await import(routePath)) as Record<string, unknown>;
    return (route['POST'] as (r: NextRequest) => Promise<Response>)(req);
  };

  const ORDER = {
    id: 'ord-sv',
    orderNumber: 'NK-3001',
    customerEmail: 'c@test.local',
    status: 'pending_payment',
    totalAmountThb: 107,
    confirmationUuid: 'cu-1',
    items: [{ variantId: 'v1' }],
  };

  function seedHappyDb(): void {
    ordersMock.getOrderById.mockResolvedValue({ ...ORDER });
    prismaMock.paymentAttempt.findFirst.mockResolvedValue({ id: 'att-sv' });
  }

  function post(): NextRequest {
    // slipok + token verify are mocked at the module level (top of file).
    return new NextRequest('http://localhost/api/v1/payments/slip-verify', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'ord-sv', token: 'tok', imageBase64: 'aGk=' }),
      headers: { 'content-type': 'application/json' },
    });
  }

  it('recovery commits → 200 pending_manual_fulfilment (success only after commit)', async () => {
    seedHappyDb();
    verifySlipMock.verifySlip.mockResolvedValue({
      ok: true,
      ref: 'ref-1',
      amountThb: 107,
      receiverAccount: 'x',
      raw: {},
    });
    ordersMock.claimOrderForConfirmation.mockResolvedValue({ id: 'ord-sv' });
    fulfilmentMock.fulfilOrder.mockResolvedValue({ success: false, error: 'INSUFFICIENT_STOCK' });

    const res = await call(post());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('pending_manual_fulfilment');
    // The recovery wrote the parking state through a real transaction.
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ord-sv', status: 'pending_payment' },
      }),
    );
    // And no reconciliation evidence was needed.
    expect(reconCalls()).toHaveLength(0);
  });

  it('ALREADY_CLAIMED race → 409, no reconciliation row (payment being handled)', async () => {
    seedHappyDb();
    verifySlipMock.verifySlip.mockResolvedValue({
      ok: true,
      ref: 'ref-race',
      amountThb: 107,
      receiverAccount: 'x',
      raw: {},
    });
    ordersMock.claimOrderForConfirmation.mockResolvedValue(null);

    const res = await call(post());
    expect(res.status).toBe(409);
    expect(reconCalls()).toHaveLength(0);
  });

  it('recovery FAILS → 500 RECONCILIATION_REQUIRED + durable evidence row', async () => {
    seedHappyDb();
    verifySlipMock.verifySlip.mockResolvedValue({
      ok: true,
      ref: 'ref-2',
      amountThb: 107,
      receiverAccount: 'x',
      raw: {},
    });
    ordersMock.claimOrderForConfirmation.mockResolvedValue({ id: 'ord-sv' });
    fulfilmentMock.fulfilOrder.mockResolvedValue({ success: false, error: 'INSUFFICIENT_STOCK' });
    prismaMock.order.updateMany.mockRejectedValue(new Error('db down'));

    const res = await call(post());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('RECONCILIATION_REQUIRED');
    expect(reconCalls()).toHaveLength(1);
  });

  it('unexpected fulfilment failure → 5xx + reconciliation (money never unrecorded)', async () => {
    seedHappyDb();
    verifySlipMock.verifySlip.mockResolvedValue({
      ok: true,
      ref: 'ref-3',
      amountThb: 107,
      receiverAccount: 'x',
      raw: {},
    });
    ordersMock.claimOrderForConfirmation.mockResolvedValue({ id: 'ord-sv' });
    // Any unexpected fulfilment error (not INSUFFICIENT_STOCK).
    fulfilmentMock.fulfilOrder.mockRejectedValue(new Error('write conflict'));

    const res = await call(post());
    expect([500, 502]).toContain(res.status);
    expect(res.status).not.toBe(200);
    expect(reconCalls()).toHaveLength(1);
  });
});

describe('POST /api/v1/admin/orders/[id]/verify-payment — recovery honesty (audit #4)', () => {
  const routePath = '../src/app/api/v1/admin/orders/[id]/verify-payment/route.ts';
  const call = async (req: NextRequest): Promise<Response> => {
    const route = (await import(routePath)) as Record<string, unknown>;
    return (route['POST'] as (r: NextRequest, c: unknown) => Promise<Response>)(req, {
      params: Promise.resolve({ id: 'ord-adm' }),
    });
  };

  function post(): NextRequest {
    return new NextRequest('http://localhost/api/v1/admin/orders/ord-adm/verify-payment', {
      method: 'POST',
      headers: { authorization: 'Bearer admin-token' },
    });
  }

  beforeEach(() => {
    ordersMock.getOrderById.mockResolvedValue({
      id: 'ord-adm',
      orderNumber: 'NK-4001',
      status: 'pending_payment',
    });
    ordersMock.claimOrderForConfirmation.mockResolvedValue({
      id: 'ord-adm',
      orderNumber: 'NK-4001',
      totalAmountThb: 107,
      items: [],
    });
  });

  it('shortage + recovery commits → 200 pending_manual_fulfilment, no evidence row', async () => {
    fulfilmentMock.fulfilOrder.mockResolvedValue({
      success: false,
      error: 'INSUFFICIENT_STOCK',
    });

    const res = await call(post());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('pending_manual_fulfilment');
    expect(reconCalls()).toHaveLength(0);
  });

  it('shortage + recovery FAILS → 500 RECONCILIATION_REQUIRED + evidence row', async () => {
    fulfilmentMock.fulfilOrder.mockResolvedValue({
      success: false,
      error: 'INSUFFICIENT_STOCK',
    });
    prismaMock.order.update.mockRejectedValue(new Error('db gone'));

    const res = await call(post());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('RECONCILIATION_REQUIRED');
    expect(reconCalls()).toHaveLength(1);
  });
});
