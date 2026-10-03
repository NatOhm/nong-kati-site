/**
 * Admin refund endpoint — POST /api/v1/admin/orders/[id]/refund (2026-10-03).
 *
 * This is the replacement for a dead mock in api/adminOrders.ts that mutated
 * an in-memory array and then wrote a REAL `refund_issued` audit row for a
 * state change it never persisted. The audit log would have asserted a refund
 * that never happened to the order. Nothing else in the codebase wrote the
 * `Refund` model, so the admin dashboard's refund figure read zero forever
 * while the audit log could show refunds issued.
 *
 * Under test here:
 *  - authorization: no token → 401, missing orders:refund → 403;
 *  - validation: gateway reference required, amount finite and positive,
 *    amount may not exceed the order total;
 *  - the state machine: only `completed` may be refunded (VALID_TRANSITIONS
 *    in api/orders.ts allows completed → refunded and nothing else);
 *  - atomicity: codes voided, Refund row inserted, order flipped and the
 *    audit row written inside ONE serializable transaction, with the audit
 *    write passed `tx` so it rolls back with the mutation;
 *  - double refund: caught by the conditional status guard, and by the
 *    `Refund.orderId` unique constraint (P2002) if two requests pass the
 *    read together;
 *  - write-conflict: a P2034 is retried and the retried attempt's result is
 *    what comes back.
 *
 * The route is record-only by design — it never calls the gateway, so a
 * retry cannot refund twice. That is asserted structurally: there is no
 * gateway import in the route at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMock, rbacMock, auditMock, adminRequestMock } = vi.hoisted(() => {
  const prismaMock = {
    order: {
      findUnique: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    giftCode: { updateMany: vi.fn(async () => ({ count: 2 })) },
    refund: { create: vi.fn(async () => ({ id: 'rfnd_1' })) },
    // Interactive-tx shape: the mock passes ITSELF as the tx client.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };
  const rbacMock = {
    checkPermission: vi.fn(
      async (): Promise<{ allowed: boolean; error?: string }> => ({ allowed: true }),
    ),
  };
  const auditMock = { writeAuditLog: vi.fn(async () => ({ id: 'audit_1' })) };
  const adminRequestMock = { getAdminToken: vi.fn((): string | null => 'tok') };
  return { prismaMock, rbacMock, auditMock, adminRequestMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/rbac', () => rbacMock);
vi.mock('@/lib/auditLog', () => auditMock);
vi.mock('@/lib/adminRequest', () => adminRequestMock);

const routePath = '../src/app/api/v1/admin/orders/[id]/refund/route.ts';

async function call(body: unknown): Promise<Response> {
  const route = (await import(routePath)) as Record<string, unknown>;
  return (route['POST'] as (r: NextRequest, c: unknown) => Promise<Response>)(
    new NextRequest('https://x.test/api/v1/admin/orders/ord-1/refund', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'ord-1' }) },
  );
}

const txOptions = (): { isolationLevel?: string }[] =>
  (prismaMock.$transaction.mock.calls as unknown as [unknown, { isolationLevel?: string }][]).map(
    (c) => c[1] ?? {},
  );

const validBody = { gatewayRefundReference: 're_test_1', refundAmountThb: 100 };

describe('POST /api/v1/admin/orders/[id]/refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prismaMock),
    );
    adminRequestMock.getAdminToken.mockReturnValue('tok');
    rbacMock.checkPermission.mockResolvedValue({ allowed: true });
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'NK-9001',
      status: 'completed',
      totalAmountThb: 214,
    });
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.giftCode.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.refund.create.mockResolvedValue({ id: 'rfnd_1' });
    auditMock.writeAuditLog.mockResolvedValue({ id: 'audit_1' });
  });

  it('rejects a request with no admin token', async () => {
    adminRequestMock.getAdminToken.mockReturnValue(null);
    const res = await call(validBody);
    expect(res.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a caller without orders:refund', async () => {
    rbacMock.checkPermission.mockResolvedValue({
      allowed: false,
      error: 'INSUFFICIENT_PERMISSIONS',
    });
    const res = await call(validBody);
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('checks the orders:refund permission specifically', async () => {
    await call(validBody);
    expect(rbacMock.checkPermission).toHaveBeenCalledWith('tok', 'orders:refund');
  });

  it('requires a gateway refund reference', async () => {
    const res = await call({ refundAmountThb: 100 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('GATEWAY_REF_REQUIRED');
    expect(prismaMock.refund.create).not.toHaveBeenCalled();
  });

  it('rejects a non-positive or non-finite amount', async () => {
    for (const amount of [0, -5, 'abc', null]) {
      const res = await call({ gatewayRefundReference: 're_1', refundAmountThb: amount });
      expect(res.status).toBe(400);
    }
    expect(prismaMock.refund.create).not.toHaveBeenCalled();
  });

  it('refuses to refund more than the order total', async () => {
    const res = await call({ gatewayRefundReference: 're_1', refundAmountThb: 500 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('REFUND_AMOUNT_EXCEEDS_ORDER');
    expect(prismaMock.refund.create).not.toHaveBeenCalled();
  });

  it('404s an unknown order', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    const res = await call(validBody);
    expect(res.status).toBe(404);
  });

  it('refuses an order that is not completed (state machine)', async () => {
    for (const status of ['pending_payment', 'payment_confirmed', 'code_delivered']) {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'NK-9001',
        status,
        totalAmountThb: 214,
      });
      const res = await call(validBody);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('NOT_REFUNDABLE');
    }
    expect(prismaMock.refund.create).not.toHaveBeenCalled();
  });

  it('409s an order that is already refunded', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'NK-9001',
      status: 'refunded',
      totalAmountThb: 214,
    });
    const res = await call(validBody);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ALREADY_REFUNDED');
  });

  it('records the refund, voids codes, flips status and audits — in one serializable tx', async () => {
    const res = await call(validBody);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { codesVoided: number } };
    expect(body.data.codesVoided).toBe(2);

    // Serializable, so two admins cannot both refund the same order.
    expect(txOptions()).toEqual([{ isolationLevel: 'Serializable' }]);

    // Codes voided with the reason and the actor.
    expect(prismaMock.giftCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'ord-1', status: { in: ['reserved', 'delivered'] } },
        data: expect.objectContaining({ status: 'voided', voidedById: expect.any(String) }),
      }),
    );

    // Refund row carries the real void count and the gateway reference.
    expect(prismaMock.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'ord-1',
        amountThb: 100,
        gatewayRefundReference: 're_test_1',
        codesVoidedCount: 2,
      }),
    });

    // Status flip is guarded, not a blind write.
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'ord-1', status: 'completed' },
      data: { status: 'refunded' },
    });

    // The audit row joins the transaction — this is the bug the mock had.
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'refund_issued',
        actorType: 'admin',
        tx: prismaMock,
      }),
    );
  });

  it('never calls the gateway — record-only, so a retry cannot refund twice', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL(routePath, import.meta.url), 'utf8');
    // Assert on IMPORTS, not on the whole file: the prose deliberately talks
    // about the gateway, and a substring scan over comments false-positives
    // ("omise" sits inside "promise"). What matters is that no payment module
    // is reachable from this route.
    const imports = source.match(/^import .*$/gm) ?? [];
    expect(imports.join('\n')).not.toMatch(/payment|omise|gateway/i);
  });

  it('409s when the unique constraint catches a concurrent double refund', async () => {
    prismaMock.$transaction.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    });
    const res = await call(validBody);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ALREADY_REFUNDED');
  });

  it('retries a P2034 write-conflict and returns the retried attempt', async () => {
    prismaMock.$transaction.mockImplementationOnce(async () => {
      throw Object.assign(new Error('write conflict'), { code: 'P2034' });
    });
    const res = await call(validBody);
    expect(res.status).toBe(200);
    expect(txOptions()).toHaveLength(2);
    // The refund must not have been written twice.
    expect(prismaMock.refund.create).toHaveBeenCalledTimes(1);
  });

  it('gives up after three conflicting attempts', async () => {
    prismaMock.$transaction.mockImplementation(async () => {
      throw Object.assign(new Error('write conflict'), { code: 'P2034' });
    });
    const res = await call(validBody);
    expect(res.status).toBe(500);
    expect(txOptions()).toHaveLength(3);
  });

  it('reports 409 when the status flip loses a race', async () => {
    // Conditional update matched 0 rows — a concurrent refund already moved it.
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    const res = await call(validBody);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ALREADY_REFUNDED');
    // In production the thrown error rolls the whole tx back, so the Refund
    // row inserted above never commits. The mock cannot prove the rollback —
    // that needs a real database — so the assertion is on the typed answer.
    expect(prismaMock.refund.create).toHaveBeenCalledTimes(1);
  });
});
