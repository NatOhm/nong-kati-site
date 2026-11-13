/**
 * Cart price refresh — server-priced lines merged back into a stored cart.
 *
 * A cart persists 24h in localStorage with the price captured at add time, so
 * when staff edited a price (฿1 → ฿50) the drawer and the checkout summary
 * kept showing ฿1 until the item was removed and added again (client feedback
 * 2026-11-13). The provider re-asks the pricing endpoint and patches the
 * stored lines through this helper.
 *
 * Pure and dependency-free on purpose: the merge rules are the part worth
 * testing, and they must never invent a price. A line the server no longer
 * returns is kept (so the customer sees what is in the cart) but marked
 * unavailable instead of being silently deleted.
 */

import type { CartItemData } from './cart';
import { calculateCartSummary, type CartSummary } from './cart';

/** One line as returned by POST /api/v1/orders/preview. */
export interface ServerPricedLine {
  variantId: string;
  /** What the customer pays now (tier price after promotion). */
  unitPriceThb: number;
  /** Pre-promotion tier price. */
  tierUnitPriceThb?: number;
  /** Pre-promotion price when a promotion applies. */
  originalUnitPriceThb?: number;
  promotionName?: string | null;
  variantLabel?: string | null;
  /** Units that can actually be delivered right now. */
  availableQuantity?: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Patch the stored cart with current server prices/stock.
 * Returns the SAME array reference when nothing changed, so the provider can
 * skip a state update (and the re-render/persist that follows it).
 */
export function mergeCartPrices(
  items: CartItemData[],
  lines: ServerPricedLine[] | undefined,
): CartItemData[] {
  const byVariant = new Map((lines ?? []).map((line) => [line.variantId, line]));
  let changed = false;

  const next = items.map((item) => {
    const line = byVariant.get(item.variantId);

    if (!line) {
      // Variant deleted or deactivated since it was added.
      if (!item.inStock && item.availableQuantity === 0) return item;
      changed = true;
      return { ...item, inStock: false, availableQuantity: 0 };
    }

    const unit = round2(Number(line.unitPriceThb));
    if (!Number.isFinite(unit) || unit <= 0) return item;

    const availableRaw =
      line.availableQuantity !== undefined
        ? Math.max(0, Math.trunc(line.availableQuantity))
        : item.availableQuantity;

    const label =
      line.variantLabel && line.variantLabel !== 'default' ? line.variantLabel : item.variantLabel;

    const merged: CartItemData = {
      ...item,
      unitPriceThb: unit,
      denominationThb:
        line.tierUnitPriceThb !== undefined && Number.isFinite(Number(line.tierUnitPriceThb))
          ? round2(Number(line.tierUnitPriceThb))
          : item.denominationThb,
      lineTotalThb: round2(unit * item.quantity),
      availableQuantity: availableRaw,
      maxQuantity: Math.max(1, Math.min(10, availableRaw)),
      inStock: availableRaw >= item.quantity,
    };

    const original =
      line.originalUnitPriceThb !== undefined ? round2(Number(line.originalUnitPriceThb)) : null;
    if (original !== null && Number.isFinite(original) && original > unit) {
      merged.originalUnitPriceThb = original;
    } else {
      delete merged.originalUnitPriceThb;
    }

    if (line.promotionName) merged.promotionName = line.promotionName;
    else delete merged.promotionName;

    if (label) merged.variantLabel = label;

    if (
      merged.unitPriceThb !== item.unitPriceThb ||
      merged.lineTotalThb !== item.lineTotalThb ||
      merged.denominationThb !== item.denominationThb ||
      merged.inStock !== item.inStock ||
      merged.availableQuantity !== item.availableQuantity ||
      merged.maxQuantity !== item.maxQuantity ||
      merged.originalUnitPriceThb !== item.originalUnitPriceThb ||
      merged.promotionName !== item.promotionName ||
      merged.variantLabel !== item.variantLabel
    ) {
      changed = true;
    }

    return merged;
  });

  return changed ? next : items;
}

/** Summary is derived data — recomputed after any merge. */
export function summaryFor(items: CartItemData[]): CartSummary {
  return calculateCartSummary(items);
}
