/** Promotion Application Library — automatic discount application. */

import { prisma } from '@/lib/db';
import { calculateVat, calculateTotal } from '@/lib/pricing';

/** A promotion that applies to a specific variant. */
export interface AppliedPromotion {
  id: string;
  name: string;
  description: string | null;
  discountType: 'percent' | 'amount';
  discountValue: number;
  minSpendThb: number | null;
  expiresAt: string | null;
  originalPriceThb: number;
  discountedPriceThb: number;
  discountAmountThb: number;
}

/**
 * Check if a promotion is currently active.
 * - isActive must be true
 * - startsAt must be in the past (or null)
 * - expiresAt must be in the future (or null)
 */
function isPromotionActive(p: {
  isActive: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
}): boolean {
  if (!p.isActive) return false;
  const now = new Date();
  if (p.startsAt && p.startsAt > now) return false;
  if (p.expiresAt && p.expiresAt <= now) return false;
  return true;
}

/**
 * Get all active promotions that apply to a given variant.
 * - "all" scope: applies to all products
 * - "selected" scope: applies only to specified product IDs
 */
export async function getActivePromotionsForVariant(
  variantId: string,
): Promise<AppliedPromotion[]> {
  const now = new Date();

  const promotions = await prisma.promotion.findMany({
    where: {
      isActive: true,
      OR: [
        { startsAt: null },
        { startsAt: { lte: now } },
      ],
      AND: [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });

  if (!variant) return [];

  const applicable: AppliedPromotion[] = [];

  for (const promo of promotions) {
    // Check scope
    if (promo.scope === 'selected') {
      const productIds: string[] =
        promo.productIds && promo.productIds.trim()
          ? JSON.parse(promo.productIds)
          : [];
      if (!productIds.includes(variant.productId)) continue;
    }

    // Check minimum spend (for cart-level promotions, this is checked at cart level)
    // For single item, we check if the item price meets the minimum
    const itemPrice = Number(variant.price);
    if (promo.minSpendThb !== null && itemPrice < Number(promo.minSpendThb)) {
      continue;
    }

    // Calculate discounted price
    const discountValue = Number(promo.discountValue);
    let discountedPrice: number;

    if (promo.discountType === 'percent') {
      discountedPrice = Math.round(itemPrice * (1 - discountValue / 100) * 100) / 100;
    } else {
      discountedPrice = Math.max(0, Math.round(itemPrice - discountValue * 100) / 100);
    }

    // Prevent negative or zero prices
    if (discountedPrice <= 0) continue;

    applicable.push({
      id: promo.id,
      name: promo.name,
      description: promo.description,
      discountType: promo.discountType as 'percent' | 'amount',
      discountValue,
      minSpendThb:
        promo.minSpendThb !== null ? Number(promo.minSpendThb) : null,
      expiresAt: promo.expiresAt?.toISOString() ?? null,
      originalPriceThb: itemPrice,
      discountedPriceThb: discountedPrice,
      discountAmountThb: Math.round(
        (itemPrice - discountedPrice) * 100,
      ) / 100,
    });
  }

  return applicable;
}

/**
 * Apply promotions to cart items and calculate final prices.
 * Returns cart items with promotion info attached.
 */
export async function applyPromotionsToCart(
  items: Array<{
    variantId: string;
    quantity: number;
    unitPriceThb: number;
    productNameTh: string;
    productNameEn: string;
  }>,
): Promise<
  Array<
    {
      variantId: string;
      quantity: number;
      unitPriceThb: number;
      productNameTh: string;
      productNameEn: string;
    } & {
      promotion?: AppliedPromotion;
      effectivePriceThb: number;
      lineTotalThb: number;
    }
  >
> {
  const results: Array<
    {
      promotion?: AppliedPromotion;
      effectivePriceThb: number;
      lineTotalThb: number;
    } & (
      | { variantId: string; quantity: number; unitPriceThb: number; productNameTh: string; productNameEn: string }
    )
  > = [];

  for (const item of items) {
    const promotions = await getActivePromotionsForVariant(item.variantId);

    // Use the best promotion (highest discount)
    let bestPromotion: AppliedPromotion | undefined;
    let bestPrice = item.unitPriceThb;

    for (const promo of promotions) {
      if (promo.discountedPriceThb < bestPrice) {
        bestPrice = promo.discountedPriceThb;
        bestPromotion = promo;
      }
    }

    results.push({
      variantId: item.variantId,
      quantity: item.quantity,
      unitPriceThb: item.unitPriceThb,
      productNameTh: item.productNameTh,
      productNameEn: item.productNameEn,
      ...(bestPromotion ? { promotion: bestPromotion } : {}),
      effectivePriceThb: bestPrice,
      lineTotalThb: Math.round(bestPrice * item.quantity * 100) / 100,
    });
  }

  return results;
}

/**
 * Calculate order totals with promotions applied.
 * Returns authoritative totals for checkout and order creation.
 */
export interface OrderTotals {
  subtotalThb: number;
  discountThb: number;
  vatThb: number;
  totalThb: number;
  itemCount: number;
}

export async function calculateOrderTotals(
  items: Array<{
    variantId: string;
    quantity: number;
    unitPriceThb: number;
    productNameTh: string;
    productNameEn: string;
  }>,
): Promise<OrderTotals> {
  const promotedItems = await applyPromotionsToCart(items);

  let subtotal = 0;
  let discount = 0;
  let itemCount = 0;

  for (const item of promotedItems) {
    subtotal += item.lineTotalThb;
    if (item.promotion) {
      discount += item.promotion.discountAmountThb * item.quantity;
    }
    itemCount += item.quantity;
  }

  subtotal = Math.round(subtotal * 100) / 100;
  discount = Math.round(discount * 100) / 100;

  // VAT is calculated on the discounted subtotal
  const vat = calculateVat(subtotal);
  const total = calculateTotal(subtotal, vat);

  return {
    subtotalThb: subtotal,
    discountThb: discount,
    vatThb: vat,
    totalThb: total,
    itemCount,
  };
}

// Get all active promotions for customer display (bell notification, etc.)
export async function getActivePromotions(): Promise<Array<{
  id: string;
  name: string;
  description: string | null;
  discountType: 'percent' | 'amount';
  discountValue: number;
  scope: 'all' | 'selected';
  productIds: string[];
  expiresAt: string | null;
}>> {
  const now = new Date();

  const promotions = await prisma.promotion.findMany({
    where: {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'desc' },
  });

  return promotions.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    discountType: p.discountType as 'percent' | 'amount',
    discountValue: Number(p.discountValue),
    scope: p.scope as 'all' | 'selected',
    productIds:
      p.productIds && p.productIds.trim()
        ? JSON.parse(p.productIds)
        : [],
    expiresAt: p.expiresAt?.toISOString() ?? null,
  }));
}
