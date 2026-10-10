import { describe, expect, it, vi } from 'vitest';

import { resolveOrderPricing } from '@/lib/promotions';

function pricingDb(
  withPromotion: boolean,
  overrides: Partial<{
    scope: 'all' | 'selected';
    discountType: 'percent' | 'amount';
    discountValue: number;
    minSpendThb: number | null;
    startsAt: Date | null;
    expiresAt: Date | null;
    productId: string;
  }> = {},
) {
  const couponFindUnique = vi.fn(async () => ({
    id: 'coupon-1',
    isActive: true,
    startsAt: null,
    expiresAt: null,
    usageLimit: null,
    usageCount: 0,
    minSpendThb: 0,
    discountType: 'amount',
    discountValue: 5,
  }));
  return {
    db: {
      productVariant: {
        findMany: vi.fn(async () => [{
          id: 'variant-1', price: 100, memberPrice: null, dealerPrice: null,
          stock: 10, label: '100 THB', productId: 'product-1', product: { name: 'Test product' },
        }]),
      },
      customer: { findUnique: vi.fn(async () => null) },
      siteSetting: { findUnique: vi.fn(async () => null) },
      promotion: {
        findMany: vi.fn(async () => withPromotion ? [{
          id: 'promotion-1', name: 'Sale', description: null,
          scope: overrides.scope ?? 'all',
          discountType: overrides.discountType ?? 'percent',
          discountValue: overrides.discountValue ?? 10,
          minSpendThb: overrides.minSpendThb ?? null,
          isActive: true,
          startsAt: overrides.startsAt ?? null,
          expiresAt: overrides.expiresAt ?? null,
          createdAt: new Date(),
          products: overrides.scope === 'selected' ? [{ productId: overrides.productId ?? 'product-1' }] : [],
        }] : []),
      },
      coupon: { findUnique: couponFindUnique },
    } as never,
    couponFindUnique,
  };
}

describe('automatic promotions and coupons', () => {
  it('does not stack a coupon with an applied automatic promotion', async () => {
    const { db, couponFindUnique } = pricingDb(true);

    const result = await resolveOrderPricing({
      items: [{ variantId: 'variant-1', quantity: 1 }],
      couponCode: 'SAVE5',
    }, db);

    expect(result.promotionResults.get('variant-1')?.promotion?.id).toBe('promotion-1');
    expect(result.couponCheck).toEqual({ ok: false, discountThb: 0, error: 'PROMOTION_NOT_STACKABLE' });
    expect(result.couponDiscountThb).toBe(0);
    expect(couponFindUnique).not.toHaveBeenCalled();
  });

  it('continues to apply coupon-only discounts when no promotion applies', async () => {
    const { db, couponFindUnique } = pricingDb(false);

    const result = await resolveOrderPricing({
      items: [{ variantId: 'variant-1', quantity: 1 }],
      couponCode: 'SAVE5',
    }, db);

    expect(result.couponCheck).toEqual({ ok: true, discountThb: 5, couponId: 'coupon-1' });
    expect(result.couponDiscountThb).toBe(5);
    expect(couponFindUnique).toHaveBeenCalledOnce();
  });

  it.each([
    { discountType: 'percent' as const, discountValue: 10, expected: 90 },
    { discountType: 'amount' as const, discountValue: 20, expected: 80 },
  ])('computes a valid $discountType promotion against the tier price', async ({ discountType, discountValue, expected }) => {
    const { db } = pricingDb(true, { discountType, discountValue });

    const result = await resolveOrderPricing({ items: [{ variantId: 'variant-1', quantity: 1 }] }, db);

    expect(result.promotionResults.get('variant-1')?.effectivePriceThb).toBe(expected);
    expect(result.promotionResults.get('variant-1')?.promotionDiscountThb).toBe(100 - expected);
  });

  it.each([
    { startsAt: new Date(Date.now() + 60_000), expiresAt: null, minSpendThb: null },
    { startsAt: null, expiresAt: new Date(Date.now() - 60_000), minSpendThb: null },
    { startsAt: null, expiresAt: null, minSpendThb: 101 },
    { startsAt: null, expiresAt: null, minSpendThb: null, scope: 'selected' as const, productId: 'other-product' },
  ])('does not apply a promotion before or after its valid scope/window/conditions', async (overrides) => {
    const { db } = pricingDb(true, overrides);

    const result = await resolveOrderPricing({ items: [{ variantId: 'variant-1', quantity: 1 }] }, db);

    expect(result.promotionResults.get('variant-1')?.promotion).toBeUndefined();
    expect(result.promotionResults.get('variant-1')?.effectivePriceThb).toBe(100);
  });
});
