/**
 * Coupon per-customer cap on the wallet pay path (2026-10-03).
 *
 * The cap is a read-then-act check inside claimOrderForConfirmation: count the
 * CouponRedemption rows for (couponId, customerId) and compare that count with
 * the coupon's VARIABLE perCustomerLimit (admin-settable, null = unlimited).
 * Under READ COMMITTED two wallet claims on the same coupon + customer can
 * both read a count under the cap, both insert, and both commit — the cap is
 * silently over-granted.
 *
 * Fix: the pay-wallet transaction runs SERIALIZABLE and retries on P2034,
 * mirroring runStaffMutation (api/adminStaff.ts). The other five
 * claimOrderForConfirmation call sites — verify-payment, slip-verify and
 * omise — already ran Serializable; this was the only STRICT (non-
 * paidExternally) call site still on READ COMMITTED.
 *
 * Why NOT @@unique([couponId, customerId]), which was the first idea:
 *  a) it hard-caps every coupon at ONE redemption per customer, ignoring a
 *     perCustomerLimit of 2, 3, ... or null (unlimited) — a constraint cannot
 *     read a per-row column;
 *  b) the create is wrapped in a try/catch that treats "Unique constraint" as
 *     an already-recorded retry, so the violation would be swallowed: no row
 *     written, the count still reads 1, and `mine > per` stays false — the
 *     race would get quieter, not closed;
 *  c) paidExternally paths (webhook, slip-verify) deliberately record
 *     over-limit usage so a PAID order is never stranded; under a unique
 *     constraint they could not record it at all.
 *
 * HONEST SCOPE: the suite mocks prisma, so it cannot run a real Postgres
 * SERIALIZABLE race and these tests do NOT prove the database actually
 * serialises. They prove the wiring — that the route asks for Serializable,
 * that a P2034 write-conflict is retried and the retried attempt's result is
 * the one returned, that non-conflict failures are not retried, and that the
 * client-facing error codes are unchanged. Closing the last gap needs a
 * real-Postgres integration test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type TxOpts = { isolationLevel?: string };

const { prismaMock, ordersMock, fulfilmentMock, authMock } = vi.hoisted(() => {
  const ordersMock = { claimOrderForConfirmation: vi.fn() };
  const fulfilmentMock = {
    fulfilOrder: vi.fn(async () => ({ success: true })),
    scheduleOutboxDrain: vi.fn(async () => undefined),
  };
  const authMock = { getCustomerFromToken: vi.fn(async () => ({ id: 'cus-1' })) };

  const prismaMock = {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(async () => ({})),
    },
    customer: { updateMany: vi.fn(async () => ({ count: 1 })) },
    topUpLog: { create: vi.fn(async () => ({ id: 'tl-1' })) },
    // Interactive-tx shape: the mock passes ITSELF as the tx client and
    // ignores the options (recorded below by the test through mock.calls).
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };
  return { prismaMock, ordersMock, fulfilmentMock, authMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/api/customerAuth', () => authMock);
vi.mock('@/api/orders', () => ordersMock);
vi.mock('@/lib/fulfilment', () => fulfilmentMock);

/** A prisma write-conflict: the error code Serializable transactions raise. */
const p2034 = (): Error & { code: string } =>
  Object.assign(new Error('Transaction failed due to a write conflict'), { code: 'P2034' });

describe('POST /api/v1/orders/[id]/pay-wallet — coupon per-customer race', () => {
  const routePath = '../src/app/api/v1/orders/[id]/pay-wallet/route.ts';
  const call = async (): Promise<Response> => {
    const route = (await import(routePath)) as Record<string, unknown>;
    return (route['POST'] as (r: NextRequest, c: unknown) => Promise<Response>)(
      new NextRequest('http://localhost/api/v1/orders/ord-1/pay-wallet', {
        method: 'POST',
        headers: { cookie: 'nk_session=tok-1' },
      }),
      { params: Promise.resolve({ id: 'ord-1' }) },
    );
  };

  const txOptions = (): TxOpts[] =>
    (prismaMock.$transaction.mock.calls as unknown as [unknown, TxOpts][]).map((c) => c[1] ?? {});

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prismaMock),
    );
    authMock.getCustomerFromToken.mockResolvedValue({ id: 'cus-1' });
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      customerId: 'cus-1',
      status: 'pending_payment',
      totalAmountThb: 250,
      orderNumber: 'NK-5001',
    });
    prismaMock.customer.updateMany.mockResolvedValue({ count: 1 });
    ordersMock.claimOrderForConfirmation.mockResolvedValue({ id: 'ord-1' });
    fulfilmentMock.fulfilOrder.mockResolvedValue({ success: true });
  });

  it('runs the payment transaction at SERIALIZABLE', async () => {
    const res = await call();

    expect(res.status).toBe(200);
    expect(txOptions()).toEqual([{ isolationLevel: 'Serializable' }]);
  });

  it('retries a P2034 write-conflict and returns the retried attempt', async () => {
    // First attempt loses the Serializable race and aborts; the retry re-reads
    // the winner's redemption row and must be allowed to finish.
    prismaMock.$transaction.mockImplementationOnce(async () => {
      throw p2034();
    });

    const res = await call();

    expect(res.status).toBe(200);
    expect(txOptions()).toHaveLength(2);
    // Every attempt asks for Serializable — the retry must not silently
    // degrade to READ COMMITTED.
    expect(txOptions().every((o) => o.isolationLevel === 'Serializable')).toBe(true);
    // The aborted attempt rolled back, so the customer is charged exactly once.
    expect(prismaMock.customer.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.topUpLog.create).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-conflict failure', async () => {
    prismaMock.$transaction.mockImplementationOnce(async () => {
      throw new Error('COUPON_PER_CUSTOMER_LIMIT');
    });

    const res = await call();

    // Losing a coupon race stays a client-facing 409 so checkout can fall
    // back to PromptPay without the coupon.
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('COUPON_PER_CUSTOMER_LIMIT');
    expect(txOptions()).toHaveLength(1);
  });

  it('gives up after three conflicting attempts instead of looping', async () => {
    prismaMock.$transaction.mockImplementation(async () => {
      throw p2034();
    });

    const res = await call();

    expect(res.status).toBe(500);
    expect(txOptions()).toHaveLength(3);
  });

  it('keeps the typed guards ahead of the coupon check', async () => {
    prismaMock.customer.updateMany.mockResolvedValue({ count: 0 });

    const res = await call();

    // The balance guard fails before any coupon work — no claim, no fulfilment.
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(ordersMock.claimOrderForConfirmation).not.toHaveBeenCalled();
    expect(fulfilmentMock.fulfilOrder).not.toHaveBeenCalled();
  });
});
