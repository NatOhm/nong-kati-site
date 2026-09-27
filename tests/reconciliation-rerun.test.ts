/**
 * Reconciliation queue — operator re-run endpoint (audit #4 follow-up).
 *
 * Contract:
 *  - orders:write gate (same as verify-payment confirmations).
 *  - The claim is a CAS on order status → a losing racer can never
 *    double-allocate codes; the outcome is reported from live state.
 *  - Completed/refunded orders answer ALREADY_SETTLED, never silent success.
 *  - INSUFFICIENT_STOCK parks the order again (recovery awaited + verified);
 *    a failed recovery leaves a fresh payment_reconciliation_required row.
 *  - Unexpected failures leave reconciliation evidence and answer 5xx.
 *
 * Fault-injection shape mirrors tests/payment-recovery.test.ts: the prisma
 * mock runs $transaction(fn) with itself as the tx client.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'rerun-test-secret-0123456789abcdef0123456789abcdef';

const { prismaMock, fulfilmentMock, rbacMock, reconMock } = vi.hoisted(() => {
  const fulfilmentMock = {
    fulfilOrder: vi.fn(),
    scheduleOutboxDrain: vi.fn(async () => undefined),
  };
  const rbacMock = {
    checkPermission: vi.fn(
      async (): Promise<{ allowed: boolean; error?: string }> => ({ allowed: true }),
    ),
  };
  const reconMock = { recordPaymentReconciliation: vi.fn(async () => 'rec_row_1') };

  const prismaMock = {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    paymentAttempt: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    // Interactive-tx shape: the mock passes ITSELF as the tx client.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };
  return { prismaMock, fulfilmentMock, rbacMock, reconMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/fulfilment', () => fulfilmentMock);
vi.doMock('@/lib/rbac', () => rbacMock);
vi.doMock('@/lib/paymentReconciliation', () => reconMock);

// Dynamic import: the `[id]` segment is illegal in a static import specifier.
const routePath = '@/app/api/v1/admin/reconciliation/[id]/rerun-fulfilment/route';

function req(): NextRequest {
  return new NextRequest('http://localhost/api/v1/admin/reconciliation/ord-1/rerun-fulfilment', {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
  });
}

function ctx(id = 'ord-1'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  rbacMock.checkPermission.mockResolvedValue({ allowed: true });
  prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.order.update.mockResolvedValue({});
  prismaMock.paymentAttempt.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prismaMock),
  );
});

describe('POST /api/v1/admin/reconciliation/[id]/rerun-fulfilment', () => {
  it('401 without a token', async () => {
    const { POST } = await import(routePath);
    const res = await POST(new NextRequest('http://localhost/x', { method: 'POST' }), ctx());
    expect(res.status).toBe(401);
  });

  it('403 without orders:write', async () => {
    rbacMock.checkPermission.mockResolvedValue({
      allowed: false,
      error: 'INSUFFICIENT_PERMISSIONS',
    });
    const { POST } = await import(routePath);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(403);
  });

  it('404 for an unknown order', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    const { POST } = await import(routePath);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(404);
  });

  it('409 ALREADY_SETTLED for a completed order — no fulfilment attempted', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'NK-1',
      status: 'completed',
    });
    const { POST } = await import(routePath);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('ALREADY_SETTLED');
    expect(fulfilmentMock.fulfilOrder).not.toHaveBeenCalled();
  });

  it('409 UNEXPECTED_STATUS for a state outside the queue contract', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'NK-1',
      status: 'expired',
    });
    const { POST } = await import(routePath);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('UNEXPECTED_STATUS');
  });

  it('re-runs fulfilment for a pending_payment order, settles the attempt, drains the outbox', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'NK-1',
      status: 'pending_payment',
    });
    fulfilmentMock.fulfilOrder.mockResolvedValue({
      success: true,
      codes: [{ code: 'A' }, { code: 'B' }],
    });
    const { POST } = await import(routePath);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; resumed: boolean; codesDelivered: number };
    expect(body).toEqual({ status: 'completed', resumed: false, codesDelivered: 2 });
    expect(fulfilmentMock.fulfilOrder).toHaveBeenCalledWith('ord-1', prismaMock, { strict: true });
    expect(prismaMock.paymentAttempt.updateMany).toHaveBeenCalled();
    expect(fulfilmentMock.scheduleOutboxDrain).toHaveBeenCalled();
  });

  it('resume path (pending_manual_fulfilment) fulfils without re-settling attempts', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'NK-1',
      status: 'pending_manual_fulfilment',
    });
    fulfilmentMock.fulfilOrder.mockResolvedValue({ success: true, codes: [{ code: 'A' }] });
    const { POST } = await import(routePath);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resumed: boolean };
    expect(body.resumed).toBe(true);
    expect(prismaMock.paymentAttempt.updateMany).not.toHaveBeenCalled();
  });

  it('reports the live outcome when a racer wins the claim (ALREADY_CLAIMED)', async () => {
    prismaMock.order.findUnique
      .mockResolvedValueOnce({ id: 'ord-1', orderNumber: 'NK-1', status: 'pending_payment' })
      .mockResolvedValueOnce({ status: 'completed' }); // post-race read
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 }); // lost the CAS
    const { POST } = await import(routePath);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('completed');
    expect(fulfilmentMock.fulfilOrder).not.toHaveBeenCalled();
  });

  it('INSUFFICIENT_STOCK parks the order again (recovery awaited, 200 pending_manual_fulfilment)', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'NK-1',
      status: 'pending_payment',
    });
    fulfilmentMock.fulfilOrder.mockResolvedValue({ success: false, error: 'INSUFFICIENT_STOCK' });
    const { POST } = await import(routePath);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('pending_manual_fulfilment');
    expect(reconMock.recordPaymentReconciliation).not.toHaveBeenCalled();
  });

  it('a failed parking recovery leaves reconciliation evidence and answers 5xx', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'NK-1',
      status: 'pending_payment',
    });
    fulfilmentMock.fulfilOrder.mockResolvedValue({ success: false, error: 'INSUFFICIENT_STOCK' });
    // Recovery unit fails: the FIRST updateMany is the main-tx claim (must
    // succeed so the flow reaches fulfilment); the recovery CAS rejects.
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.order.updateMany.mockRejectedValue(new Error('db gone'));
    const { POST } = await import(routePath);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('RECONCILIATION_REQUIRED');
    expect(reconMock.recordPaymentReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ord-1',
        failureReason: expect.stringContaining('INSUFFICIENT_STOCK'),
      }),
    );
  });

  it('an unexpected failure leaves evidence and answers 500 — never a fake success', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'NK-1',
      status: 'pending_payment',
    });
    prismaMock.$transaction.mockRejectedValue(new Error('serialization deadlock'));
    const { POST } = await import(routePath);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('RERUN_FAILED');
    expect(reconMock.recordPaymentReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ord-1',
        failureReason: 'serialization deadlock',
        recoveryError: 'no_recovery_attempted',
      }),
    );
    expect(fulfilmentMock.scheduleOutboxDrain).not.toHaveBeenCalled();
  });
});
