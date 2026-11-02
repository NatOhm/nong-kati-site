/**
 * Stock you can sell vs stock you can deliver (audit finding 1, 2026-11-02).
 *
 * `ProductVariant.stock` is a number staff can raise by hand (เติมสต็อก);
 * delivery reads `GiftCode` rows. Nothing kept them equal, so a restock with
 * no code upload let the shop sell units it could not deliver: the customer
 * paid, fulfilment threw INSUFFICIENT_STOCK, and the order parked in
 * pending_manual_fulfilment with the money already taken.
 *
 * `resolveOrderPricing` is the one resolver behind previewOrder AND
 * createOrderInner, so gating there makes the combination unsellable instead
 * of merely unenterable.
 */
import { describe, expect, it, vi } from 'vitest';

import { resolveOrderPricing } from '@/lib/promotions';
import { sellableStock } from '@/lib/stock';

describe('sellableStock', () => {
  it('is the smaller of stock and available codes', () => {
    expect(sellableStock(10, 3)).toBe(3);
    expect(sellableStock(3, 10)).toBe(3);
    expect(sellableStock(10, 10)).toBe(10);
  });

  it('is zero when either side is zero', () => {
    expect(sellableStock(10, 0)).toBe(0);
    expect(sellableStock(0, 5)).toBe(0);
  });

  it('never goes negative', () => {
    expect(sellableStock(-5, 3)).toBe(0);
    expect(sellableStock(5, -3)).toBe(0);
  });
});

/**
 * Minimal db in the shape resolveOrderPricing walks: variants, available code
 * counts, VAT setting and promotions. Coupons are not exercised here.
 */
function pricingDb(stock: number, codes: number) {
  return {
    productVariant: {
      findMany: vi.fn(async () => [
        {
          id: 'variant-1',
          price: 100,
          memberPrice: null,
          dealerPrice: null,
          stock,
          label: '100 THB',
          productId: 'product-1',
          product: { name: 'Test product' },
        },
      ]),
    },
    giftCode: {
      groupBy: vi.fn(async () =>
        codes > 0 ? [{ variantId: 'variant-1', _count: { _all: codes } }] : [],
      ),
    },
    customer: { findUnique: vi.fn(async () => null) },
    siteSetting: { findUnique: vi.fn(async () => null) },
    promotion: { findMany: vi.fn(async () => []) },
  } as never;
}

describe('resolveOrderPricing — deliverable stock', () => {
  it('rejects a purchase when stock exists but no codes do', async () => {
    const db = pricingDb(10, 0);

    await expect(
      resolveOrderPricing({ items: [{ variantId: 'variant-1', quantity: 1 }] }, db),
    ).rejects.toThrow('OUT_OF_STOCK');
  });

  it('rejects a quantity larger than the available codes, even when stock covers it', async () => {
    const db = pricingDb(10, 3);

    await expect(
      resolveOrderPricing({ items: [{ variantId: 'variant-1', quantity: 4 }] }, db),
    ).rejects.toThrow('OUT_OF_STOCK');
  });

  it('accepts a quantity the codes can cover', async () => {
    const db = pricingDb(10, 3);

    const resolved = await resolveOrderPricing(
      { items: [{ variantId: 'variant-1', quantity: 3 }] },
      db,
    );

    expect(resolved.quantityMap.get('variant-1')).toBe(3);
    expect(resolved.itemInputs).toHaveLength(1);
  });

  it('still rejects a quantity larger than the stock number, even with plenty of codes', async () => {
    const db = pricingDb(2, 50);

    await expect(
      resolveOrderPricing({ items: [{ variantId: 'variant-1', quantity: 3 }] }, db),
    ).rejects.toThrow('OUT_OF_STOCK');
  });
});
