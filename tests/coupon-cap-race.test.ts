/**
 * Coupon per-customer cap LOGIC on the real claim helper (audit fix 3).
 *
 * The W gate (`tests/wallet-coupon-race.test.ts`) proves the pay-wallet
 * wiring — Serializable requested, P2034 retried — with a mocked claim. It
 * never executes `claimOrderForConfirmation` itself, so nothing there fails
 * if the `mine > per` guard is deleted. These three tests run the real
 * helper against a controllable tx mock:
 *
 *  1. over-cap strict claim throws COUPON_PER_CUSTOMER_LIMIT;
 *  2. at-cap strict claim succeeds and records exactly one redemption;
 *  3. two concurrent strict claims on the same order row confirm exactly
 *     once (conditional claim = first-wins, loser returns null).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NK_JWT_SECRET'] = 'couponrace-test-secret-0123456789abcdef0123456789abcdef';

const { txMock } = vi.hoisted(() => {
  const txMock = {
    order: { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    coupon: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    couponRedemption: { create: vi.fn(), count: vi.fn() },
  };
  return { txMock };
});

vi.mock('@/lib/db', () => ({ prisma: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  txMock.order.updateMany.mockResolvedValue({ count: 1 });
  txMock.order.update.mockResolvedValue({});
  txMock.coupon.update.mockResolvedValue({});
  txMock.coupon.updateMany.mockResolvedValue({ count: 1 });
});

import type { Prisma } from '@prisma/client';

import { claimOrderForConfirmation } from '@/api/orders';

/** The mock as the Prisma interactive-transaction client type. */
const TX = txMock as unknown as Prisma.TransactionClient;

function fullOrder(orderId: string) {
  return {
    id: orderId,
    orderNumber: 'NK-9001',
    confirmationUuid: 'uuid-1',
    customerEmail: 'a@b.co',
    customerPhone: null,
    status: 'payment_confirmed',
    paymentMethod: 'wallet',
    items: [],
    subtotalThb: 100,
    promotionDiscountThb: 0,
    vatAmountThb: 7,
    vatEnabled: false,
    vatRate: 0,
    discountThb: 10,
    totalAmountThb: 90,
    requiresTaxInvoice: false,
    taxInvoiceName: null,
    taxInvoiceTaxId: null,
    manualFulfilmentReason: null,
    createdAt: new Date(),
  };
}

function seedClaimOrder(orderId: string, couponId: string | null, customerId: string | null): void {
  // Told apart by args (ref read uses select, final read uses include) so
  // interleaved concurrent calls each get the right shape.
  txMock.order.findUnique.mockImplementation(async (args: { select?: unknown }) =>
    args?.select ? { couponId, customerId } : fullOrder(orderId),
  );
}

function seedCoupon(perCustomerLimit: number, usageLimit: number | null = null): void {
  txMock.coupon.findUnique.mockResolvedValue({
    usageLimit,
    perCustomerLimit,
    isActive: true,
  });
}

describe('per-customer coupon cap', () => {
  it('strict claim reading over-cap throws COUPON_PER_CUSTOMER_LIMIT', async () => {
    seedClaimOrder('ord-1', 'cpn-1', 'cust-1');
    seedCoupon(1);
    txMock.couponRedemption.create.mockResolvedValue({});
    txMock.couponRedemption.count.mockResolvedValue(2); // another order already used it

    await expect(claimOrderForConfirmation('ord-1', TX)).rejects.toThrow(
      'COUPON_PER_CUSTOMER_LIMIT',
    );
  });

  it('strict claim at exactly the cap succeeds and records one redemption', async () => {
    seedClaimOrder('ord-1', 'cpn-1', 'cust-1');
    seedCoupon(1);
    txMock.couponRedemption.create.mockResolvedValue({});
    txMock.couponRedemption.count.mockResolvedValue(1); // this claim is the one use

    const claimed = await claimOrderForConfirmation('ord-1', TX);
    expect(claimed).not.toBeNull();
    expect(txMock.couponRedemption.create).toHaveBeenCalledTimes(1);
  });

  it('two concurrent strict claims on the same order row confirm exactly once', async () => {
    // Same order row raced twice (double-click / two tabs on one checkout):
    // the conditional claim lets exactly one through; the loser returns null.
    const seen = new Set<string>();
    txMock.order.updateMany.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (seen.has(where.id)) return { count: 0 };
      seen.add(where.id);
      return { count: 1 };
    });
    seedClaimOrder('ord-1', 'cpn-1', 'cust-1');
    seedCoupon(1);
    txMock.couponRedemption.create.mockResolvedValue({});
    txMock.couponRedemption.count.mockResolvedValue(1);

    const results = await Promise.allSettled([
      claimOrderForConfirmation('ord-1', TX),
      claimOrderForConfirmation('ord-1', TX),
    ]);
    const confirmed = results.filter((r) => r.status === 'fulfilled' && r.value !== null);
    expect(confirmed).toHaveLength(1);
  });
});
