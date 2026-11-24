/**
 * Omise webhook wiring — LD-10 (the approved plan's named coverage gap).
 *
 * This route was the only confirmation path whose post-commit stock block had
 * zero test coverage: it sits inside handleChargeSucceeded's try, whose catch
 * rethrows unknown errors into POST — so a notification-layer failure escaping
 * there is a non-200 to the Opn gateway, violating LD-10 (always 200) and
 * triggering redelivery storms.
 *
 * Pinned here, each case driving a real charge.complete event through the
 * REAL route:
 *  1. success → the helper is called exactly once with the order's variant
 *     ids (deduped, null-filtered), and the ONLY productVariant.findMany on
 *     the notification path is the helper's own — an inline copy re-added to
 *     the route would make it two.
 *  2. the stock query rejecting → the real helper swallows it → gateway still
 *     gets 200 (exercised through the route via a call-through spy).
 *  3. the helper ITSELF rejecting → gateway still gets 200, so LD-10 does not
 *     rest on the helper's no-throw contract holding forever.
 *
 * @/lib/notify is a PARTIAL mock: everything real except the payment ping
 * (no Discord traffic) and the helper, which is wrapped in a spy that calls
 * through to the real implementation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMock, ordersMock, fulfilMock, adapterMock, event } = vi.hoisted(() => {
  const prismaMock = {
    paymentAttempt: { findUnique: vi.fn(), update: vi.fn() },
    order: { findUnique: vi.fn() },
    siteSetting: { findUnique: vi.fn() },
    productVariant: { findMany: vi.fn() },
    // Interactive-tx shape: the mock passes ITSELF as the tx client.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };
  const ordersMock = { getOrderById: vi.fn(), claimOrderForConfirmation: vi.fn() };
  const fulfilMock = { fulfilOrder: vi.fn(), scheduleOutboxDrain: vi.fn() };
  // The event parseWebhookEvent hands the route; signature verifies as valid
  // so the authenticated-retrieval fallback branch never runs.
  const EVENT = {
    key: 'charge.complete',
    status: 'successful',
    chargeId: 'chrg_test_1',
    amount: 10700, // ฿107.00 in satang — must equal round(order.total * 100)
  };
  const adapterMock = {
    // `new OmiseAdapter()` must work — an arrow impl in vi.fn() is not
    // constructible, so the mock adapter is a real class.
    OmiseAdapter: class {
      parseWebhookEvent = vi.fn(() => EVENT);
      verifyWebhookSignature = vi.fn(() => true);
      retrieveCharge = vi.fn();
    },
  };
  // Exposed so a test can make the payload say "failed" or a different
  // amount without rebuilding the adapter mock.
  return { prismaMock, ordersMock, fulfilMock, adapterMock, event: EVENT };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/api/orders', () => ordersMock);
vi.mock('@/lib/fulfilment', () => fulfilMock);
vi.mock('@/lib/paymentReconciliation', () => ({
  recordPaymentReconciliation: vi.fn(async () => 'rec-1'),
}));
vi.mock('@/lib/payment/omise', () => adapterMock);
vi.mock('@/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notify')>();
  return {
    ...actual,
    // Silence the payment pings (no Discord traffic in tests).
    notifyPaymentConfirmed: vi.fn(async () => undefined),
    notifyPaymentPending: vi.fn(async () => undefined),
    // Call-through spy: the route gets the REAL helper, so its swallow of a
    // failing stock query is exercised end-to-end here.
    notifyStockAlertsForVariants: vi.fn(actual.notifyStockAlertsForVariants),
  };
});

import { notifyPaymentPending, notifyStockAlertsForVariants } from '@/lib/notify';
import { recordPaymentReconciliation } from '@/lib/paymentReconciliation';

const helperSpy = vi.mocked(notifyStockAlertsForVariants);
const pendingSpy = vi.mocked(notifyPaymentPending);
const reconciliationSpy = vi.mocked(recordPaymentReconciliation);

const ORDER = {
  id: 'ord-om',
  orderNumber: 'NK-OM-1',
  status: 'pending_payment',
  totalAmountThb: 107,
};

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env['NK_DISCORD_WEBHOOK_URL'];
  // The shared payload the adapter mock hands every request.
  event.key = 'charge.complete';
  event.status = 'successful';
  event.amount = 10700;

  // Restore the call-through impl — a prior test may have replaced it.
  const actual = await vi.importActual<typeof import('@/lib/notify')>('@/lib/notify');
  helperSpy.mockImplementation(actual.notifyStockAlertsForVariants);

  prismaMock.paymentAttempt.findUnique.mockResolvedValue({
    id: 'att-om',
    orderId: ORDER.id,
    status: 'pending',
  });
  prismaMock.paymentAttempt.update.mockResolvedValue({});
  prismaMock.order.findUnique.mockResolvedValue(null);
  prismaMock.siteSetting.findUnique.mockResolvedValue(null);
  prismaMock.productVariant.findMany.mockResolvedValue([]);
  ordersMock.getOrderById.mockResolvedValue({ ...ORDER });
  ordersMock.claimOrderForConfirmation.mockResolvedValue({
    id: ORDER.id,
    orderNumber: ORDER.orderNumber,
    totalAmountThb: 107,
    items: [{ variantId: 'vA' }, { variantId: 'vA' }, { variantId: 'vB' }, { variantId: null }],
  });
  fulfilMock.fulfilOrder.mockResolvedValue({ success: true, codes: ['c1'] });
  fulfilMock.scheduleOutboxDrain.mockResolvedValue(undefined);
});

function post(): NextRequest {
  return new NextRequest('http://localhost/api/v1/webhooks/omise', {
    method: 'POST',
    body: JSON.stringify({ id: 'evt_test_1', key: 'charge.complete' }),
    headers: { 'content-type': 'application/json', 'x-omise-signature': 'sha256=deadbeef' },
  });
}

async function call(): Promise<Response> {
  const route = (await import('@/app/api/v1/webhooks/omise/route')) as Record<string, unknown>;
  return (route['POST'] as (r: NextRequest) => Promise<Response>)(post());
}

async function expectGatewayOk(res: Response): Promise<void> {
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ received: true });
}

describe('POST /api/v1/webhooks/omise — notification wiring + LD-10', () => {
  it('success → helper once with filtered ids; the only variant query is the helper’s', async () => {
    const res = await call();

    await expectGatewayOk(res);
    expect(helperSpy).toHaveBeenCalledTimes(1);
    // Deduped and null-filtered — a detached line must not abort the batch.
    expect(helperSpy).toHaveBeenCalledWith(['vA', 'vB']);

    // Exactly one findMany, issued with the helper's filtered id set: an
    // inline policy re-added to the route would make this two (and an
    // unfiltered one would carry the null).
    expect(prismaMock.productVariant.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.productVariant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['vA', 'vB'] } }) }),
    );
  });

  it('stock query rejects → the real helper swallows it → gateway still gets 200', async () => {
    prismaMock.productVariant.findMany.mockRejectedValue(
      new Error('Connection terminated unexpectedly'),
    );

    await expectGatewayOk(await call());
  });

  it('the helper itself rejects → gateway still gets 200 (LD-10 does not rest on the contract)', async () => {
    helperSpy.mockRejectedValue(new Error('notification layer exploded'));

    await expectGatewayOk(await call());
  });

  it('a failure event never downgrades a payment the bank already settled', async () => {
    // Out-of-order delivery: `charge.complete` arrived, the order was fulfilled
    // and the attempt is `succeeded`; a late/duplicate `charge.failed` for the
    // same charge must not rewrite that record. It did — the attempt became
    // `failed` with its slip/charge evidence still attached, so
    // /api/v1/payments/[id]/status (the checkout poller) and the admin order
    // screen reported a FAILED payment on a completed, paid order.
    prismaMock.paymentAttempt.findUnique.mockResolvedValue({
      id: 'att-om',
      orderId: ORDER.id,
      status: 'succeeded',
      failureReason: null,
    });
    event.status = 'failed';

    await expectGatewayOk(await call());

    expect(prismaMock.paymentAttempt.update).not.toHaveBeenCalled();
    expect(ordersMock.claimOrderForConfirmation).not.toHaveBeenCalled();
  });

  it('a charge settled at the wrong amount reaches a human, not only a log line', async () => {
    // The gateway says this charge SUCCEEDED, so the money exists — but for
    // ฿99.00 against a ฿107.00 order. Refusing to apply it is right; leaving no
    // evidence row and no ping is not: the order expires unpaid, the customer
    // is told to pay again, and the captured charge is discoverable only by
    // reading the server log. Every other verified-but-unrecorded path writes
    // `payment_reconciliation_required` and pings the ops channel.
    event.amount = 9900;

    await expectGatewayOk(await call());

    expect(prismaMock.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', failureReason: 'AMOUNT_MISMATCH' }),
      }),
    );
    expect(reconciliationSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER.id,
        paymentRef: 'chrg_test_1',
        paymentAttemptId: 'att-om',
        failureReason: 'AMOUNT_MISMATCH',
      }),
    );
    expect(pendingSpy).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: ORDER.orderNumber, totalThb: 107 }),
    );
    expect(ordersMock.claimOrderForConfirmation).not.toHaveBeenCalled();
  });
});
