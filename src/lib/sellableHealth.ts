import { sellableStock } from '@/lib/stock';

/**
 * "Is anything actually for sale?" — the arithmetic behind
 * `GET /api/v1/internal/sellable-health`.
 *
 * WHY IT IS A LIB AND NOT PART OF THE ROUTE
 * App Router `route.ts` files may only export handlers, so the part worth
 * pinning in a test (the per-variant `min(stock, codes)` and the once-per-
 * product counting) lives here where a unit test can call it directly, with no
 * database and no HTTP.
 *
 * WHAT THE NUMBER MEANS
 * `sellableStock(stock, codesAvailable)` is the same function the catalog badge
 * and the pricing resolver use (`src/lib/stock.ts`), so `sellableUnits` is
 * exactly "what a customer could buy right now, if every published product were
 * viewed". It is deliberately GROSS: units held by a `pending_payment` order
 * are not subtracted, because a hold lasts minutes while this check asks
 * whether the catalog can sell at all. The public API's per-variant `stock`
 * already nets out holds for the customer-facing view.
 */
export interface SellableVariantRow {
  productId: string;
  stock: number;
  codesAvailable: number;
}

export interface SellableSummary {
  /** Σ min(stock, available codes) over active variants of published products. */
  sellableUnits: number;
  /** Published products with at least one sellable unit. */
  sellableProducts: number;
  /** Published products, whether or not anything in them can be sold. */
  publishedProducts: number;
  /**
   * `available` GiftCodes whose `variantId` is NULL. They count as inventory
   * but belong to no product row, so they can never be delivered. Production
   * held 13 of these on 2026-11-19 (see `tests/giftcode-available-invariant`).
   */
  detachedAvailableCodes: number;
  /**
   * Informational only. The scheduled checker recomputes this rule from the
   * numbers, so a bug here cannot silence the check.
   */
  ok: boolean;
}

export function summarizeSellable(input: {
  variants: SellableVariantRow[];
  publishedProducts: number;
  detachedAvailableCodes: number;
}): SellableSummary {
  let sellableUnits = 0;
  const productsWithStock = new Set<string>();

  for (const row of input.variants) {
    const units = sellableStock(row.stock, row.codesAvailable);
    sellableUnits += units;
    if (units > 0) productsWithStock.add(row.productId);
  }

  return {
    sellableUnits,
    sellableProducts: productsWithStock.size,
    publishedProducts: input.publishedProducts,
    detachedAvailableCodes: input.detachedAvailableCodes,
    ok: sellableUnits > 0 && input.detachedAvailableCodes === 0,
  };
}
