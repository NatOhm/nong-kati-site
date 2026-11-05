/**
 * Order guards — the two edges the 2026-11-05 audit found open.
 *
 * G1 · Unpaid-order hold (`src/api/orders.ts` `createOrderInner`):
 *   Stock used to be checked at creation and taken at confirmation, so an
 *   unpaid order held nothing: two customers could each create an order for
 *   the last unit, both transfer money, and the second slip verified against
 *   stock that was already gone (order parked in pending_manual_fulfilment,
 *   refund by hand). The hold subtracts what `pending_payment` orders already
 *   hold, inside the SAME Serializable transaction as the insert, so two
 *   concurrent checkouts cannot both pass.
 *
 *   The release is the status filter itself: `expired` rows (the 30-minute
 *   sweep, tests/order-expiry-sweep.test.ts) are not `pending_payment`, so
 *   they stop counting the moment the sweep flips them. Both directions are
 *   asserted below, and so is the filter — a `where` without the status would
 *   hold stock forever, which is the failure mode that matters.
 *
 * G2 · Guest lookup limiter (`src/app/api/v1/orders/lookup/route.ts`):
 *   The lookup returns the `confirmationUuid` that opens `/orders/<uuid>`,
 *   where delivered codes are printed, and order numbers are sequential — so
 *   unthrottled guessing was a code-harvesting path. Both buckets must count
 *   MISSES: a bucket consumed only on a match never fires during the guessing
 *   it exists to stop (2026-11-05: the peek was removed for that reason).
 *
 * G3 · Expired orders stay payable (`claimOrderForConfirmation`):
 *   A transfer made at minute 29 can be uploaded at minute 31, after the sweep
 *   flipped the row to `expired`. Refusing the claim stranded money that had
 *   already left the customer's account, so the CAS accepts both statuses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const realFetch = globalThis.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const ORDER_INPUT = {
  customerEmail: 'buyer@example.com',
  paymentMethod: 'promptpay' as const,
  tosAccepted: true,
  tosVersion: '1.0',
  lineOptIn: false,
  marketingOptIn: false,
  requiresTaxInvoice: false,
  items: [{ variantId: 'v1', quantity: 1 }],
};

/** The minimal created-order row mapOrder() reads back. */
function createdOrderRow() {
  return {
    id: 'o1',
    orderNumber: 'NK-2026-000001',
    confirmationUuid: 'u1',
    customerEmail: 'buyer@example.com',
    customerPhone: null,
    status: 'pending_payment',
    paymentMethod: 'promptpay',
    subtotalThb: 100,
    vatAmountThb: 6.54,
    discountThb: 0,
    couponId: null,
    totalAmountThb: 100,
    requiresTaxInvoice: false,
    taxInvoiceName: null,
    taxInvoiceTaxId: null,
    manualFulfilmentReason: null,
    createdAt: new Date('2026-11-05T00:00:00Z'),
    items: [
      {
        id: 'i1',
        variantId: 'v1',
        productNameTh: 'Test Product',
        productNameEn: 'Test Product',
        skuCode: 'D1',
        denominationThb: 100,
        quantity: 1,
        unitPriceThb: 100,
        unitPriceExVat: 93.46,
        unitVatAmount: 6.54,
        lineTotalThb: 100,
        deliveryStatus: 'pending',
      },
    ],
  };
}

/**
 * One variant, one sellable unit (stock 1, one available code), and `held`
 * units claimed by other unpaid orders.
 */
async function loadCreateOrderWith(held: number): Promise<{
  createOrder: (input: typeof ORDER_INPUT) => Promise<unknown>;
  groupBy: ReturnType<typeof vi.fn>;
}> {
  const groupBy = vi.fn(async () =>
    held > 0 ? [{ variantId: 'v1', _sum: { quantity: held } }] : [],
  );
  vi.doMock('@/lib/db', () => ({
    prisma: {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) => {
        const tx = {
          productVariant: {
            findMany: vi.fn(async () => [
              {
                id: 'v1',
                stock: 1,
                isActive: true,
                price: 100,
                memberPrice: null,
                dealerPrice: null,
                label: 'D1',
                productId: 'p1',
                product: { name: 'Test Product' },
              },
            ]),
          },
          customer: { findUnique: vi.fn(async () => null) },
          siteSetting: { findUnique: vi.fn(async () => null) },
          promotion: { findMany: vi.fn(async () => []) },
          // Exactly one unit can be handed over.
          giftCode: {
            groupBy: vi.fn(async () => [{ variantId: 'v1', _count: { _all: 1 } }]),
          },
          orderItem: { groupBy },
          order: {
            count: vi.fn(async () => 0),
            findMany: vi.fn(async () => []),
            create: vi.fn(async () => createdOrderRow()),
          },
        };
        return typeof fn === 'function' ? await fn(tx) : null;
      }),
      order: { count: vi.fn(async () => 0), create: vi.fn(async () => createdOrderRow()) },
    },
  }));
  vi.doMock('@/lib/slipSecurity', () => ({ mintSlipUploadToken: vi.fn(() => 'tok') }));
  const { createOrder } = (await import('@/api/orders')) as {
    createOrder: (input: typeof ORDER_INPUT) => Promise<unknown>;
  };
  return { createOrder, groupBy };
}

describe('G1 · unpaid-order hold', () => {
  it('refuses the second order for the last unit while an unpaid order holds it', async () => {
    const { createOrder, groupBy } = await loadCreateOrderWith(1);
    await expect(createOrder(ORDER_INPUT)).rejects.toThrow('OUT_OF_STOCK');
    // The hold must be scoped to unpaid orders: counting `expired` rows would
    // hold the unit forever once the sweep flipped them.
    expect(groupBy).toHaveBeenCalledTimes(1);
    const args = groupBy.mock.calls[0]?.[0] as {
      where: {
        order: { status: string; createdAt?: { gt: Date } };
        variantId: { in: string[] };
      };
    };
    expect(args.where.order.status).toBe('pending_payment');
    expect(args.where.variantId.in).toEqual(['v1']);
    // The hold must expire on its own clock, not on the sweep's: the GitHub
    // cron has run hours apart, and without this filter a unit stayed held all
    // morning. Default window is 30 minutes.
    const cutoff = args.where.order.createdAt?.gt;
    expect(cutoff).toBeInstanceOf(Date);
    const ageMinutes = (Date.now() - (cutoff as Date).getTime()) / 60_000;
    expect(ageMinutes).toBeGreaterThan(29);
    expect(ageMinutes).toBeLessThan(31);
  });

  it('accepts the order once nothing is held (the expired row no longer matches)', async () => {
    const { createOrder, groupBy } = await loadCreateOrderWith(0);
    const result = (await createOrder(ORDER_INPUT)) as { order: { status: string } };
    expect(result.order.status).toBe('pending_payment');
    expect(groupBy).toHaveBeenCalledTimes(1);
  });
});

describe('G2 · guest lookup limiter', () => {
  const lookupPath = '../src/app/api/v1/orders/lookup/route';

  interface LookupRoute {
    POST: (req: NextRequest) => Promise<Response>;
  }

  async function loadRoute(): Promise<LookupRoute> {
    const lookupOrder = vi.fn(async (email: string, orderNumber: string) =>
      orderNumber === 'NK-2026-000999'
        ? { success: true, order: { confirmationUuid: 'u-ok', email } }
        : { success: false },
    );
    vi.doMock('@/api/orderLookup', () => ({ lookupOrder }));
    return (await import(lookupPath)) as unknown as LookupRoute;
  }

  function post(ip: string, orderNumber: string): NextRequest {
    return new NextRequest('http://localhost/api/v1/orders/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email: 'buyer@example.com', orderNumber }),
    });
  }

  it('answers 429 on the 11th lookup from one IP', async () => {
    const route = await loadRoute();
    const ip = '198.51.100.11';
    for (let i = 0; i < 10; i += 1) {
      const res = await route.POST(post(ip, `NK-2026-00090${i}`));
      expect(res.status).toBe(404);
    }
    const blocked = await route.POST(post(ip, 'NK-2026-000999'));
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe(
      'RATE_LIMIT_EXCEEDED',
    );
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it('misses spend the per-email quota, so guessing an address is bounded', async () => {
    const route = await loadRoute();
    // Ten misses for one address, one per IP: the per-IP bucket (10/15 min)
    // must not be the thing that fires — this proves the EMAIL bucket does.
    for (let i = 0; i < 10; i += 1) {
      const res = await route.POST(post(`198.51.100.${20 + i}`, `NK-2026-0007${i}`));
      expect(res.status).toBe(404);
    }
    const blocked = await route.POST(post('198.51.100.40', 'NK-2026-000999'));
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe(
      'RATE_LIMIT_EXCEEDED',
    );
    // A different address from a fresh IP is unaffected.
    const other = new NextRequest('http://localhost/api/v1/orders/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.41' },
      body: JSON.stringify({ email: 'someone-else@example.com', orderNumber: 'NK-2026-000999' }),
    });
    expect((await route.POST(other)).status).toBe(200);
  });
});

describe('G3 · expired orders stay payable', () => {
  async function loadClaim(): Promise<{
    claim: (id: string) => Promise<unknown>;
    updateMany: ReturnType<typeof vi.fn>;
  }> {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    vi.doMock('@/lib/db', () => ({ prisma: { order: { updateMany } } }));
    vi.doMock('@/lib/slipSecurity', () => ({ mintSlipUploadToken: vi.fn(() => 'tok') }));
    const { claimOrderForConfirmation } = (await import('@/api/orders')) as {
      claimOrderForConfirmation: (id: string) => Promise<unknown>;
    };
    return { claim: claimOrderForConfirmation, updateMany };
  }

  it('claims a pending_payment OR expired order in one CAS', async () => {
    const { claim, updateMany } = await loadClaim();
    expect(await claim('o1')).toBeNull(); // count 0 → not claimed
    const args = updateMany.mock.calls[0]?.[0] as {
      where: { status: unknown; items: unknown };
      data: unknown;
    };
    expect(args.where.status).toEqual({ in: ['pending_payment', 'expired'] });
    // The itemless guard rides in the same CAS, not a separate read.
    expect(args.where.items).toEqual({ some: {} });
    expect(args.data).toEqual({ status: 'payment_confirmed' });
  });
});
