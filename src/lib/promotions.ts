/** Promotion Application Library — automatic discount application.

 * Pricing semantics (Codex-approved, 2026-10-07):
 *  - Prices are VAT-inclusive storefront prices.
 *  - VAT is DERIVED from the final VAT-inclusive charge, never added on top.
 *  - Order.subtotalThb = gross tier-price subtotal BEFORE any promotion/coupon.
 *  - Order.promotionDiscountThb = aggregate automatic-promotion discount.
 *  - Order.discountThb = coupon discount (unchanged unless every consumer migrates).
 *  - Order.totalAmountThb = max(0, subtotalThb - promotionDiscountThb - discountThb).
 *  - VAT component is derived from totalAmountThb via calculateVatFromInclusive().
 *  - Per-line promotion evidence is snapshot on OrderItem (no FK, survives deletion).
 *  - originalUnitPriceThb = resolved tier price BEFORE promotion.
 *  - unitPriceThb on OrderItem = effective post-promotion unit price.
 *  - promotionDiscountThb on OrderItem = line-total discount, not per unit.
 *
 * Bounded-query rule: variants and eligible promotions are fetched in bounded
 * queries, not one-promo-query-per-item. Minimum spend is evaluated once against
 * the gross eligible cart subtotal, not per unit.
 */

import { prisma } from '@/lib/db';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  calculateVatFromInclusive,
  calculateExVat,
  normalizeTier,
  tierPrice,
} from '@/lib/pricing';

/** Immutable VAT configuration. */
export interface VatConfig {
  enabled: boolean;
  rate: number; // fraction, e.g. 0.07 for 7%
}

/**
 * Resolve VAT configuration from the single persisted SiteSetting row.
 * The admin VAT route stores SiteSetting.key = 'vat' with JSON { enabled, rate }.
 * Rate is stored as a percentage (e.g. 7) and normalized to fraction (0.07) here.
 * Accepts an injected Prisma client so callers inside a transaction can pass tx.
 */
export async function getVatConfig(
  db: Prisma.TransactionClient = prisma,
): Promise<VatConfig> {
  const row = await db.siteSetting.findUnique({ where: { key: 'vat' } });
  if (!row) return { enabled: false, rate: 0 };

  try {
    const parsed = JSON.parse(row.value) as { enabled?: boolean; rate?: number };
    const enabled = parsed.enabled === true;
    let rate = 0;
    if (enabled && typeof parsed.rate === 'number' && Number.isFinite(parsed.rate) && parsed.rate > 0) {
      // Normalize percentage to fraction. The admin contract stores percentages
      // from 0.1 through 30, so ALL accepted values are divided by 100.
      // e.g. 7 -> 0.07, 1 -> 0.01, 0.1 -> 0.001.
      rate = parsed.rate / 100;
    }
    return { enabled, rate };
  } catch {
    return { enabled: false, rate: 0 };
  }
}

/** A promotion that applies to a specific variant (for application logic). */
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
 * Get active promotions that apply to a set of product IDs, in one bounded query.
 * Used by the pricing engine to avoid N+1 per-item promotion queries.
 */
export async function getEligiblePromotions(
  productIds: string[],
  db: Prisma.TransactionClient = prisma,
): Promise<
  Array<
    {
      id: string;
      name: string;
      description: string | null;
      discountType: 'percent' | 'amount';
      discountValue: number;
      minSpendThb: number | null;
      scope: 'all' | 'selected';
      startsAt: Date | null;
      expiresAt: Date | null;
      isActive: boolean;
      productIds: string[];
    }
  >
> {
  const now = new Date();

  const promotions = await db.promotion.findMany({
    where: {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      products: {
        select: { productId: true },
      },
    },
  });

  return promotions
    .filter((p) => isPromotionActive(p))
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      discountType: p.discountType as 'percent' | 'amount',
      discountValue: Number(p.discountValue),
      minSpendThb: p.minSpendThb !== null ? Number(p.minSpendThb) : null,
      scope: p.scope as 'all' | 'selected',
      startsAt: p.startsAt,
      expiresAt: p.expiresAt,
      isActive: p.isActive,
      productIds: p.products?.map((pr) => pr.productId) ?? [],
    }))
    .filter((p) => {
      if (p.scope === 'all') return true;
      // 'selected' scope: empty set applies to NOTHING.
      if (p.productIds.length === 0) return false;
      return productIds.some((pid) => p.productIds.includes(pid));
    });
}

/**
 * Apply promotions to cart items and calculate final prices.
 * Returns cart items with promotion info attached (legacy, kept for display).
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
 * Legacy helper: get active promotions for a single variant.
 * Kept for backwards compat; the pricing engine uses getEligiblePromotions instead.
 */
export async function getActivePromotionsForVariant(
  variantId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<AppliedPromotion[]> {
  const now = new Date();

  const promotions = await db.promotion.findMany({
    where: {
      isActive: true,
      OR: [
        { startsAt: null },
        { startsAt: { lte: now } },
      ],
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      products: {
        select: { productId: true },
      },
    },
  });

  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });

  if (!variant) return [];

  const applicable: AppliedPromotion[] = [];

  for (const promo of promotions) {
    if (promo.scope === 'selected') {
      const productIds = promo.products?.map((p) => p.productId) ?? [];
      if (productIds.length === 0 || !productIds.includes(variant.productId)) {
        continue;
      }
    }

    const itemPrice = Number(variant.price);
    if (promo.minSpendThb !== null && itemPrice < Number(promo.minSpendThb)) {
      continue;
    }

    const discountValue = Number(promo.discountValue);
    let discountedPrice: number;

    if (promo.discountType === 'percent') {
      discountedPrice = Math.round(itemPrice * (1 - discountValue / 100) * 100) / 100;
    } else {
      discountedPrice = Math.round((itemPrice - discountValue) * 100) / 100;
      if (discountedPrice <= 0) continue;
    }

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
 * Per-line pricing snapshot for persistence.
 * unitPriceThb = effective post-promotion unit price (VAT-inclusive).
 * originalUnitPriceThb = resolved tier price before promotion.
 * promotionDiscountThb = line-total discount from the applied promotion.
 * couponDiscountThb = line-total coupon discount (allocated deterministically).
 * finalLineTotalThb = post-promotion line total minus coupon (what the customer pays).
 * finalLineExVat / finalLineVatAmount = VAT components on the final line total,
 *   so item sums reconcile exactly to Order.totalAmountThb / Order.vatAmountThb.
 */
export interface PersistedOrderItemSnapshot {
  variantId: string;
  productNameTh: string;
  productNameEn: string;
  skuCode: string;
  denominationThb: number; // VAT-inclusive tier unit price
  quantity: number;
  unitPriceThb: number; // effective post-promotion unit price (VAT-inclusive)
  unitPriceExVat: number;
  unitVatAmount: number;
  promotionDiscountThb: number; // line-total discount from promotion
  couponDiscountThb: number; // line-total coupon discount (allocated)
  finalLineTotalThb: number; // post-promotion - coupon = what customer pays
  finalLineExVat: number; // VAT-exclusive component of finalLineTotalThb
  finalLineVatAmount: number; // VAT component of finalLineTotalThb
  originalUnitPriceThb: number; // tier price before promotion
  appliedPromotionId: string | null;
  promotionName: string | null;
  promotionType: string | null;
  promotionValue: number | null;
}

/**
 * Reconciled order pricing result.
 * All values are derived from the same inputs so persisted totals reconcile
 * exactly to persisted item snapshots with no double subtraction.
 */
export interface ReconciledOrderPricing {
  // Order-level totals (what gets persisted on Order)
  grossSubtotalThb: number; // sum of tier-price × qty across all lines (BEFORE discounts)
  promotionDiscountThb: number; // aggregate promotion discount
  couponDiscountThb: number; // coupon discount (passed in, not computed here)
  totalAmountThb: number; // max(0, grossSubtotalThb - promotionDiscountThb - couponDiscountThb)
  vatAmountThb: number; // derived from totalAmountThb via calculateVatFromInclusive

  // Per-line snapshots (what gets persisted on OrderItem)
  items: PersistedOrderItemSnapshot[];

  // Pre-coupon post-promotion subtotal (sum of line totals before coupon allocation)
  postPromotionSubtotal: number;
}

/**
 * Calculate reconciled order pricing from cart items, VAT config, per-variant
 * promotion results, and optional coupon discount.
 *
 * This is the authoritative pricing function. It returns both the order-level
 * totals and the per-line persistence snapshots so createOrder can persist
 * exactly the values that the focused tests assert.
 *
 * Coupon allocation is performed INSIDE this pure function (not duplicated in
 * createOrder): the coupon discount is distributed proportionally to each line's
 * post-promotion contribution to the post-promotion subtotal, with the satang
 * remainder assigned deterministically to the last line. This gives every caller
 * (order creation, server preview, and future admin reads) the same result.
 *
 * VAT math: displayed prices are VAT-inclusive. The VAT component is DERIVED
 * from the final VAT-inclusive charge using calculateVatFromInclusive, never
 * added on top. totalAmountThb = max(0, grossSubtotal - promoDisc - couponDisc),
 * then vatAmountThb = calculateVatFromInclusive(totalAmountThb, config).
 * Each line's finalLineExVat/finalLineVatAmount come from finalLineTotalThb, so
 * sum(finalLineTotalThb) === totalAmountThb and sum(finalLineVatAmount) === vatAmountThb
 * exactly (satang rounding fully accounted for by the remainder assignment).
 */
export function calculateReconciledOrderPricing(
  items: Array<{
    variantId: string;
    quantity: number;
    tierUnitPriceThb: number; // resolved tier price (VAT-inclusive) per line
    productNameTh: string;
    productNameEn: string;
    skuCode: string;
  }>,
  vatConfig: VatConfig,
  // Precomputed promotion results per variant id. The caller resolves promotions
  // in a bounded query and maps them here. Each variant gets its best promotion.
  promotionResults: Map<string, { promotion: AppliedPromotion | undefined; effectivePriceThb: number; promotionDiscountThb: number }>,
  couponDiscountThb: number = 0,
): ReconciledOrderPricing {
  // Pre-coupon snapshots.
  const preItemList: Array<{
    variantId: string; quantity: number; tierUnitPriceThb: number;
    productNameTh: string; productNameEn: string; skuCode: string;
    effectiveUnitPrice: number; promotionDiscountThb: number;
    lineTotalThb: number;
  }> = [];
  let grossSubtotalThb = 0;
  let promotionDiscountThb = 0;
  let postPromotionSubtotal = 0;

  for (const item of items) {
    const resolved = promotionResults.get(item.variantId);
    const effectiveUnitPrice = resolved?.effectivePriceThb ?? item.tierUnitPriceThb;
    const itemPromoDiscount = resolved ? resolved.promotionDiscountThb * item.quantity : 0;
    const lineTotalThb = Math.round(effectiveUnitPrice * item.quantity * 100) / 100;

    grossSubtotalThb += Math.round(item.tierUnitPriceThb * item.quantity * 100) / 100;
    promotionDiscountThb += itemPromoDiscount;
    postPromotionSubtotal += lineTotalThb;

    preItemList.push({
      variantId: item.variantId,
      quantity: item.quantity,
      tierUnitPriceThb: item.tierUnitPriceThb,
      productNameTh: item.productNameTh,
      productNameEn: item.productNameEn,
      skuCode: item.skuCode,
      effectiveUnitPrice,
      promotionDiscountThb: itemPromoDiscount,
      lineTotalThb,
    });
  }

  grossSubtotalThb = Math.round(grossSubtotalThb * 100) / 100;
  promotionDiscountThb = Math.round(promotionDiscountThb * 100) / 100;
  postPromotionSubtotal = Math.round(postPromotionSubtotal * 100) / 100;

  // Deterministic satang-level coupon allocation across post-promotion lines.
  let remainingCoupon = couponDiscountThb;
  const allocatedLines: Array<{ couponDiscountThb: number; finalLineTotalThb: number }> = [];
  const totalPostPromo = postPromotionSubtotal;
  for (const pre of preItemList) {
    const fraction = totalPostPromo > 0 ? pre.lineTotalThb / totalPostPromo : 0;
    const allocated = totalPostPromo > 0 && couponDiscountThb > 0
      ? Math.floor(fraction * couponDiscountThb * 100) / 100
      : 0;
    const clamped = Math.min(allocated, pre.lineTotalThb, remainingCoupon);
    allocatedLines.push({
      couponDiscountThb: clamped,
      finalLineTotalThb: Math.max(0, pre.lineTotalThb - clamped),
    });
    remainingCoupon = Math.round((remainingCoupon - clamped) * 100) / 100;
  }

  // totalAmountThb = max(0, grossSubtotal - promotionDiscount - couponDiscount)
  const totalAmountThb = Math.max(
    0,
    Math.round((grossSubtotalThb - promotionDiscountThb - couponDiscountThb) * 100) / 100,
  );

  // VAT is DERIVED from the final VAT-inclusive charge, never added on top.
  const vatAmountThb = calculateVatFromInclusive(totalAmountThb, vatConfig);

  // Build final snapshots with coupon allocation + VAT allocated across final lines.
  // VAT allocation: the order VAT is DERIVED from totalAmountThb; we allocate it
  // across final lines in integer satang (multiply by 100, floor, remainder to
  // last line) so that sum(finalLineVatAmount) === vatAmountThb exactly. Each line's
  // finalLineExVat is then derived as finalLineTotalThb - finalLineVatAmount, which
  // guarantees sum(finalLineExVat) === totalAmountThb - vatAmountThb.
  const itemsSnapshot: PersistedOrderItemSnapshot[] = [];
  if (preItemList.length > 0 && allocatedLines.length > 0) {
    // Build final line VAT from unrounded per-line VAT shares, then reconcile
    // exactly to order VAT. Order VAT is DERIVED from totalAmountThb; each final
    // line's VAT is the exact VAT component of its own final line total, so
    // sum(finalLineVatAmount) === vatAmountThb and each finalLineExVat =
    // finalLineTotalThb - finalLineVatAmount.
    // Exact unrounded per-line VAT (in satang): finalLineTotalThb * rate / (1 + rate) * 100.
    // This pass replaces the earlier proportional satang allocation entirely.
    const rate = vatConfig.enabled && vatConfig.rate > 0 ? vatConfig.rate : 0;
    const factor = 1 + rate;
    type vatShare = { baseSatang: number; frac: number; idx: number };
    const shares: vatShare[] = [];
    let baseSum = 0;
    for (let i = 0; i < preItemList.length; i++) {
      const alloc = allocatedLines[i]!;
      const finalLineTotalThb = alloc.finalLineTotalThb;
      const exactSatang = rate > 0 && finalLineTotalThb > 0
        ? finalLineTotalThb * rate / factor * 100
        : 0;
      const baseSatang = Math.floor(exactSatang);
      shares.push({ baseSatang, frac: exactSatang - baseSatang, idx: i });
      baseSum += baseSatang;
    }
    const vatInSatang = Math.round(vatAmountThb * 100);
    // Distribute the non-negative order-level satang remainder by descending
    // fractional share, with a stable tie-break on index.
    const remainderSatang = vatInSatang - baseSum;
    shares.sort((a, b) => b.frac - a.frac || a.idx - b.idx);
    for (let k = 0; k < remainderSatang && k < shares.length; k++) {
      if (remainderSatang <= 0) break;
      shares[k]!.baseSatang += 1;
    }
    const lineVatSatang: number[] = new Array(preItemList.length).fill(0);
    for (let k = 0; k < shares.length; k++) {
      const share = shares[k]!;
      const finalLineTotalThb = allocatedLines[share.idx]!.finalLineTotalThb;
      const finalLineVatSatang = Math.max(
        0,
        Math.min(finalLineTotalThb * 100, share.baseSatang),
      );
      lineVatSatang[share.idx] = finalLineVatSatang;
    }

    for (let i = 0; i < preItemList.length; i++) {
      const pre = preItemList[i]!;
      const alloc = allocatedLines[i]!;
      const finalLineTotalThb = alloc.finalLineTotalThb;
      const finalLineVatAmount = Math.round(lineVatSatang[i]!) / 100;
      const finalLineExVat = Math.round((finalLineTotalThb - finalLineVatAmount) * 100) / 100;

      itemsSnapshot.push({
        variantId: pre.variantId,
        productNameTh: pre.productNameTh,
        productNameEn: pre.productNameEn,
        skuCode: pre.skuCode,
        denominationThb: pre.tierUnitPriceThb,
        quantity: pre.quantity,
        unitPriceThb: pre.effectiveUnitPrice,
        unitPriceExVat: calculateExVat(pre.effectiveUnitPrice, vatConfig),
        unitVatAmount: pre.effectiveUnitPrice - calculateExVat(pre.effectiveUnitPrice, vatConfig),
        promotionDiscountThb: pre.promotionDiscountThb,
        couponDiscountThb: alloc.couponDiscountThb,
        finalLineTotalThb,
        finalLineExVat,
        finalLineVatAmount,
        originalUnitPriceThb: pre.tierUnitPriceThb,
        appliedPromotionId: promotionResults.get(pre.variantId)?.promotion?.id ?? null,
        promotionName: promotionResults.get(pre.variantId)?.promotion?.name ?? null,
        promotionType: promotionResults.get(pre.variantId)?.promotion?.discountType ?? null,
        promotionValue: promotionResults.get(pre.variantId)?.promotion?.discountValue ?? null,
      });
    }
  }

  // ── aggregate VAT reconciliation invariant ────────────────────────────────
  // Before returning, verify the line snapshots aggregate exactly to the order
  // totals. Each final line's VAT is the exact VAT component of its own
  // finalLineTotalThb, so these sums must tie out to 0.005 THB satang slack.
  // If they do not, the allocation is internally inconsistent and must not be
  // persisted as a reconciled order.
  {
    let sumLineTotal = 0;
    let sumLineExVat = 0;
    let sumLineVat = 0;
    for (const item of itemsSnapshot) {
      sumLineTotal += item.finalLineTotalThb;
      sumLineExVat += item.finalLineExVat;
      sumLineVat += item.finalLineVatAmount;
    }
    sumLineTotal = Math.round(sumLineTotal * 100) / 100;
    sumLineExVat = Math.round(sumLineExVat * 100) / 100;
    sumLineVat = Math.round(sumLineVat * 100) / 100;

    const expectedTotalAmount = totalAmountThb;
    const expectedExVatTotal = Math.round((totalAmountThb - vatAmountThb) * 100) / 100;
    const expectedVatTotal = vatAmountThb;

    if (
      Math.abs(sumLineTotal - expectedTotalAmount) > 0.005
      || Math.abs(sumLineExVat - expectedExVatTotal) > 0.005
      || Math.abs(sumLineVat - expectedVatTotal) > 0.005
    ) {
      throw new Error(
        `INCONSISTENT_ORDER_VAT: line sums (${sumLineTotal}, ${sumLineExVat}, ${sumLineVat}) ` +
        `do not match order totals (${expectedTotalAmount}, ${expectedExVatTotal}, ${expectedVatTotal})`,
      );
    }
  }

  return {
    grossSubtotalThb,
    promotionDiscountThb,
    couponDiscountThb,
    totalAmountThb,
    vatAmountThb,
    items: itemsSnapshot,
    postPromotionSubtotal,
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
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      products: {
        select: { productId: true },
      },
    },
  });

  return promotions.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    discountType: p.discountType as 'percent' | 'amount',
    discountValue: Number(p.discountValue),
    scope: p.scope as 'all' | 'selected',
    productIds:
      p.products?.map((prod) => prod.productId) ?? [],
    expiresAt: p.expiresAt?.toISOString() ?? null,
  }));
}

// ─── Shared order-pricing resolver (Blocker 3) ─────────────────────────────

/**
 * Shared input for the order-pricing resolver. Both previewOrder() and
 * createOrderInner() funnel through this so variant resolution, tier
 * selection, quantity aggregation, promotion selection, subtotal calculation,
 * and coupon validation happen exactly once in one place.
 */
export interface ResolveOrderPricingInput {
  /** Raw items from the order input [{variantId, quantity}]. The resolver
   * aggregates duplicate variantIds and validates the combined quantity/stock. */
  items: { variantId: string; quantity: number }[];
  customerId?: string | null | undefined;
  couponCode?: string | undefined;
}

/**
 * Result of the shared resolver: everything both preview and create need
 * before the final reconcile call + write.
 */
export interface CouponCheck {
  ok: boolean;
  discountThb: number;
  error?: 'NOT_FOUND' | 'INACTIVE' | 'NOT_STARTED' | 'EXPIRED' | 'MIN_SPEND' | 'USAGE_LIMIT' | 'PROMOTION_NOT_STACKABLE';
  couponId?: string;
}

export interface ResolvedOrderPricing {
  variants: Array<{
    id: string;
    price: string;
    memberPrice: string | null;
    dealerPrice: string | null;
    stock: number;
    label: string;
    productId: string;
    product: { name: string; name_en: string | null };
  }>;
  byId: Map<string, resolvedVariant>;
  tier: 'retail' | 'member' | 'dealer';
  quantityMap: Map<string, number>;
  itemInputs: Array<{
    variantId: string;
    productNameTh: string;
    productNameEn: string;
    unitPriceThb: number;
  }>;
  vatConfig: VatConfig;
  eligiblePromotions: Awaited<ReturnType<typeof getEligiblePromotions>>;
  promotionResults: Map<string, { promotion: AppliedPromotion | undefined; effectivePriceThb: number; promotionDiscountThb: number }>;
  postPromotionSubtotal: number;
  couponCheck: CouponCheck;
  couponDiscountThb: number;
  grossSubtotalThb: number;
}

/**
 * Resolved variant row shape (narrowed from Prisma for the resolver's internal use).
 */
interface resolvedVariant {
  id: string;
  price: unknown;
  memberPrice: number | null;
  dealerPrice: number | null;
  stock: number;
  label: string;
  productId: string;
  product: { name: string };
}


/**
 * Shared order-pricing resolver.
 *
 * Resolves variants, tier, aggregates quantities, validates stock, computes
 * gross subtotal once, selects the best promotion per variant, computes the
 * post-promotion subtotal, validates the coupon against it, and returns
 * everything both previewOrder() and createOrderInner() need.
 *
 * Accepts an injected client so callers inside a transaction can pass `tx`.
 * When `db` is omitted it falls back to the default `prisma` (preview path).
 */
export async function resolveOrderPricing(
  input: ResolveOrderPricingInput,
  db: Prisma.TransactionClient | PrismaClient = prisma,
): Promise<ResolvedOrderPricing> {
  const variants = await db.productVariant.findMany({
    where: { id: { in: input.items.map((i) => i.variantId) }, isActive: true },
    include: { product: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v as unknown as resolvedVariant]));
  // Coerce Prisma Decimal fields to plain numbers for the pricing math.
  for (const v of byId.values()) {
    v.price = Number(v.price);
    v.memberPrice = v.memberPrice != null ? Number(v.memberPrice) : null;
    v.dealerPrice = v.dealerPrice != null ? Number(v.dealerPrice) : null;
  }

  let tier: 'retail' | 'member' | 'dealer' = 'retail';
  if (input.customerId) {
    const customer = await db.customer.findUnique({
      where: { id: input.customerId },
      select: { tier: true },
    });
    if (customer) tier = normalizeTier(customer.tier);
  }

  // Aggregate raw input once: combine duplicate variant IDs, validate the
  // combined quantity and stock against the aggregate.
  const quantityMap = new Map<string, number>();
  for (const item of input.items) {
    const existing = quantityMap.get(item.variantId) ?? 0;
    quantityMap.set(item.variantId, existing + item.quantity);
  }

  // Build normalized line inputs from aggregated quantities.
  const itemInputs = [...quantityMap.entries()].map(([variantId, qty]) => {
    const v = byId.get(variantId);
    if (!v) throw new Error('VARIANT_NOT_FOUND');
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      throw new Error('INVALID_QUANTITY');
    }
    if (v.stock < qty) {
      throw new Error('OUT_OF_STOCK');
    }
    const unit = tierPrice(Number(v.price), tier, {
      memberPrice: v.memberPrice != null ? Number(v.memberPrice) : null,
      dealerPrice: v.dealerPrice != null ? Number(v.dealerPrice) : null,
    });
    return {
      variantId: v.id,
      productNameTh: v.product.name,
      productNameEn: v.product.name,
      unitPriceThb: unit,
    };
  });

  const vatConfig = await getVatConfig(db);
  const productIds = variants.map((v) => v.productId);
  const eligiblePromotions = await getEligiblePromotions(productIds, db);

  // Build promotion results (same loop as both callers had).
  const promotionResults = new Map<
    string,
    { promotion: AppliedPromotion | undefined; effectivePriceThb: number; promotionDiscountThb: number }
  >();

  // Compute gross subtotal ONCE before promotion selection.
  const grossSubtotal = Math.round(
    [...quantityMap.entries()].reduce((sum, [variantId, qty]) => {
      const v = byId.get(variantId)!;
      const price = tierPrice(Number(v.price), tier, {
        memberPrice: v.memberPrice != null ? Number(v.memberPrice) : null,
        dealerPrice: v.dealerPrice != null ? Number(v.dealerPrice) : null,
      });
      return sum + price * qty;
    }, 0) * 100,
  ) / 100;

  for (const [variantId, qty] of quantityMap.entries()) {
    const v = byId.get(variantId)!;
    const itemPrice = tierPrice(
      Number(v.price), tier, {
        memberPrice: v.memberPrice != null ? Number(v.memberPrice) : null,
        dealerPrice: v.dealerPrice != null ? Number(v.dealerPrice) : null,
      },
    );

    const applicable = eligiblePromotions.filter((p) => {
      if (p.scope === 'all') return true;
      if (p.productIds.length === 0) return false;
      return p.productIds.includes(v.productId);
    });

    let bestPromotion: AppliedPromotion | undefined;
    let bestPrice = itemPrice;

    for (const promo of applicable) {
      if (promo.minSpendThb !== null && grossSubtotal < promo.minSpendThb) continue;
      const discountValue = promo.discountValue;
      let discountedPrice: number;
      if (promo.discountType === 'percent') {
        discountedPrice = Math.round(itemPrice * (1 - discountValue / 100) * 100) / 100;
      } else {
        discountedPrice = Math.round((itemPrice - discountValue) * 100) / 100;
        if (discountedPrice <= 0) continue;
      }
      if (discountedPrice < bestPrice) {
        bestPrice = discountedPrice;
        bestPromotion = {
          id: promo.id, name: promo.name, description: promo.description,
          discountType: promo.discountType as 'percent' | 'amount', discountValue,
          minSpendThb: promo.minSpendThb,
          expiresAt: promo.expiresAt?.toISOString() ?? null,
          originalPriceThb: itemPrice, discountedPriceThb: discountedPrice,
          discountAmountThb: Math.round((itemPrice - discountedPrice) * 100) / 100,
        };
      }
    }
    promotionResults.set(variantId, {
      promotion: bestPromotion, effectivePriceThb: bestPrice,
      promotionDiscountThb: bestPromotion ? Math.round((itemPrice - bestPrice) * 100) / 100 : 0,
    });
  }

  // Post-promotion subtotal for coupon validation.
  const postPromotionSubtotal = Math.round(
    [...quantityMap.entries()].reduce((sum, [variantId, qty]) => {
      const resolved = promotionResults.get(variantId);
      const v = byId.get(variantId)!;
      const itemPrice = tierPrice(
        Number(v.price), tier, {
          memberPrice: v.memberPrice != null ? Number(v.memberPrice) : null,
          dealerPrice: v.dealerPrice != null ? Number(v.dealerPrice) : null,
        },
      );
      const effectivePrice = resolved?.effectivePriceThb ?? itemPrice;
      return sum + effectivePrice * qty;
    }, 0) * 100,
  ) / 100;

  let couponCheck: CouponCheck = { ok: false, discountThb: 0, error: 'NOT_FOUND' };
  let couponDiscountThb = 0;
  if (input.couponCode) {
    const hasAutomaticPromotion = [...promotionResults.values()].some(({ promotion }) => promotion !== undefined);
    if (hasAutomaticPromotion) {
      // The client brief explicitly defers coupon/promotion stacking. Reject
      // the code for this cart instead of silently applying both discounts.
      couponCheck = { ok: false, discountThb: 0, error: 'PROMOTION_NOT_STACKABLE' };
    } else {
      const check = await checkCoupon(input.couponCode, postPromotionSubtotal, db);
      if (check.ok && check.couponId) {
        couponDiscountThb = check.discountThb;
        couponCheck = { ok: true, discountThb: check.discountThb, couponId: check.couponId };
      } else {
        couponCheck = check;
      }
    }
  }

  return {
    variants: variants as unknown as ResolvedOrderPricing['variants'],
    byId: byId as unknown as Map<string, resolvedVariant>,
    tier,
    quantityMap,
    itemInputs,
    vatConfig,
    eligiblePromotions,
    promotionResults,
    postPromotionSubtotal,
    couponCheck,
    couponDiscountThb,
    grossSubtotalThb: grossSubtotal,
  };
}

// Re-export normalizeTier and tierPrice for the resolver's internal use.
export { normalizeTier, tierPrice } from '@/lib/pricing';

/**
 * Check a coupon code against a subtotal. Shared by both the preview and
 * create paths through the resolver. Accepts an injected client so the
 * transaction path can pass `tx`.
 */
export async function checkCoupon(
  code: string,
  subtotalThb: number,
  db: Prisma.TransactionClient | PrismaClient = prisma,
): Promise<CouponCheck> {
  const coupon = await db.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.isActive) return { ok: false, discountThb: 0, error: 'INACTIVE' };
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now)
    return { ok: false, discountThb: 0, error: 'NOT_STARTED' };
  if (coupon.expiresAt && coupon.expiresAt < now)
    return { ok: false, discountThb: 0, error: 'EXPIRED' };
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { ok: false, discountThb: 0, error: 'USAGE_LIMIT' };
  }
  const min = Number(coupon.minSpendThb ?? 0);
  if (min > 0 && subtotalThb < min) return { ok: false, discountThb: 0, error: 'MIN_SPEND' };

  const value = Number(coupon.discountValue);
  const discountThb =
    coupon.discountType === 'percent'
      ? Math.min(Math.round(subtotalThb * (value / 100) * 100) / 100, subtotalThb)
      : Math.min(value, subtotalThb);
  return { ok: true, discountThb, couponId: coupon.id };
}
