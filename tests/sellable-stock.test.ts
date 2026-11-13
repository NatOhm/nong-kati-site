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
import { mergeCartPrices } from '@/lib/cartRefresh';
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

/**
 * Cart refresh (client feedback 2026-11-13): a stored cart kept the price it
 * was added at, so an admin price edit never reached it. The refresh asks the
 * shared pricing resolver in tolerant mode — an out-of-stock or deleted line
 * must not blank the whole price list.
 */
describe('resolveOrderPricing — cart-refresh mode', () => {
  it('keeps resolving an out-of-stock line instead of throwing', async () => {
    const db = pricingDb(10, 0);

    const resolved = await resolveOrderPricing(
      { items: [{ variantId: 'variant-1', quantity: 1 }] },
      db,
      { tolerateUnavailable: true },
    );

    expect(resolved.quantityMap.get('variant-1')).toBe(1);
    expect(resolved.sellableByVariant.get('variant-1')).toBe(0);
  });

  it('drops a variant that no longer exists rather than failing the refresh', async () => {
    const db = pricingDb(10, 5);

    const resolved = await resolveOrderPricing(
      {
        items: [
          { variantId: 'variant-1', quantity: 1 },
          { variantId: 'deleted-variant', quantity: 1 },
        ],
      },
      db,
      { tolerateUnavailable: true },
    );

    expect([...resolved.quantityMap.keys()]).toEqual(['variant-1']);
  });

  it('still refuses a missing variant when the caller did not opt in', async () => {
    const db = pricingDb(10, 5);

    await expect(
      resolveOrderPricing({ items: [{ variantId: 'deleted-variant', quantity: 1 }] }, db),
    ).rejects.toThrow('VARIANT_NOT_FOUND');
  });
});

describe('mergeCartPrices', () => {
  const baseItem = {
    id: 'cart-1',
    variantId: 'variant-1',
    skuCode: 'slug-variant-1',
    productNameTh: 'Test product',
    productNameEn: 'Test product',
    productSlug: 'test',
    thumbnailUrl: null,
    denominationThb: 1,
    unitPriceThb: 1,
    vatAmountThb: 0,
    quantity: 2,
    lineTotalThb: 2,
    inStock: true,
    availableQuantity: 5,
    maxQuantity: 5,
  };

  it('replaces the stored price with the current server price', () => {
    const merged = mergeCartPrices([baseItem], [
      { variantId: 'variant-1', unitPriceThb: 50, tierUnitPriceThb: 50, availableQuantity: 5 },
    ]);

    expect(merged[0]?.unitPriceThb).toBe(50);
    expect(merged[0]?.lineTotalThb).toBe(100);
    expect(merged[0]?.denominationThb).toBe(50);
  });

  it('carries the package label so variants are distinguishable', () => {
    const merged = mergeCartPrices([baseItem], [
      {
        variantId: 'variant-1',
        unitPriceThb: 50,
        variantLabel: '1 เดือน',
        availableQuantity: 5,
      },
    ]);

    expect(merged[0]?.variantLabel).toBe('1 เดือน');
  });

  it('marks a line the server no longer returns as unavailable but keeps it', () => {
    const merged = mergeCartPrices([baseItem], []);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.inStock).toBe(false);
    expect(merged[0]?.availableQuantity).toBe(0);
    expect(merged[0]?.productNameTh).toBe('Test product');
  });

  it('returns the same array when nothing changed (no state churn)', () => {
    const items = [baseItem];
    const merged = mergeCartPrices(items, [
      { variantId: 'variant-1', unitPriceThb: 1, tierUnitPriceThb: 1, availableQuantity: 5 },
    ]);

    expect(merged).toBe(items);
  });
});
