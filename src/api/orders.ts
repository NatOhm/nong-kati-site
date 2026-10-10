/**
 * Order API — DB-backed (Supabase via Prisma).
 * 07-api.md §10 + 09-payment.md §10 — Order state machine.
 *
 *   pending_payment → payment_confirmed → completed (via fulfilment.ts)
 *   pending_payment → pending_manual_fulfilment (stock shortfall)
 *   pending_payment → expired / failed
 *
 * SERVER-ONLY: imports Prisma. Client code must go through
 * /api/v1/orders — never import this from a client component.
 *
 * Pricing semantics (Codex-approved, 2026-10-07):
 *  - Prices are VAT-inclusive storefront prices.
 *  - VAT is DERIVED from the final VAT-inclusive charge, never added on top.
 *  - Order.subtotalThb = gross tier-price subtotal BEFORE any promotion/coupon.
 *  - Order.promotionDiscountThb = aggregate automatic-promotion discount.
 *  - Order.discountThb = coupon discount.
 *  - Order.totalAmountThb = max(0, subtotalThb - promotionDiscountThb - discountThb).
 *  - VAT component is derived from totalAmountThb via calculateVatFromInclusive().
 *  - Per-line promotion evidence is snapshot on OrderItem (no FK, survives deletion).
 *  - originalUnitPriceThb = resolved tier price BEFORE promotion.
 *  - unitPriceThb on OrderItem = effective post-promotion unit price.
 */

import { prisma } from '@/lib/db';
import {
  generateOrderNumber,
} from '@/lib/pricing';
import {
  getVatConfig,
  getEligiblePromotions,
  calculateReconciledOrderPricing,
  PersistedOrderItemSnapshot,
  resolveOrderPricing,
  checkCoupon,
} from '@/lib/promotions';
import type { CouponCheck } from '@/lib/promotions';
import { mintSlipUploadToken } from '@/lib/slipSecurity';

export interface OrderItem {
  id: string;
  variantId: string;
  productNameTh: string;
  productNameEn: string;
  skuCode: string;
  denominationThb: number;
  quantity: number;
  unitPriceThb: number;
  unitPriceExVat: number;
  unitVatAmount: number;
  lineTotalThb: number;
  deliveryStatus: string;
  // Final line fields after coupon allocation (Blocker 1 — new schema fields).
  couponDiscountThb: number;
  finalLineTotalThb: number;
  finalLineExVat: number;
  finalLineVatAmount: number;
  // Promotion evidence snapshot (historical record — survives promotion edit/delete).
  originalUnitPriceThb: number;
  appliedPromotionId: string | null;
  promotionName: string | null;
  promotionType: string | null;
  promotionValue: number | null;
  promotionDiscountThb: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  confirmationUuid: string;
  customerEmail: string;
  customerPhone: string | null;
  status: string;
  paymentMethod: string | null;
  items: OrderItem[];
  subtotalThb: number;
  promotionDiscountThb: number;
  vatAmountThb: number;
  vatEnabled: boolean;
  vatRate: number;
  discountThb: number;
  totalAmountThb: number;
  requiresTaxInvoice: boolean;
  taxInvoiceName: string | null;
  taxInvoiceTaxId: string | null;
  manualFulfilmentReason: string | null;
  createdAt: string;
}

export interface CreateOrderInput {
  customerEmail: string;
  customerPhone?: string;
  paymentMethod: 'promptpay' | 'credit_card' | 'debit_card';
  lineOptIn: boolean;
  marketingOptIn: boolean;
  tosAccepted: boolean;
  tosVersion: string;
  requiresTaxInvoice: boolean;
  taxInvoiceName?: string;
  taxInvoiceTaxId?: string;
  /** [{ variantId, quantity }] — price/stock re-validated server-side. */
  items: { variantId: string; quantity: number }[];
  couponCode?: string;
  customerId?: string | null;
}

export interface CreateOrderResult {
  order: Order;
  discountThb: number;
  couponCode: string | null;
  couponError: string | null;
  /** Capability token for slip upload — only present on creation. */
  slipUploadToken: string;
}

// ─── Mapping helpers ─────────────────────────────────────

type OrderWithItems = NonNullable<Awaited<ReturnType<typeof prisma.order.findFirst>>> & {
  items: never[];
};

/** Minimal structural type for Prisma order rows (Decimal fields included). */
interface DbOrderItem {
  id: string;
  variantId: string;
  productNameTh: string;
  productNameEn: string;
  skuCode: string;
  denominationThb: unknown;
  quantity: number;
  unitPriceThb: unknown;
  unitPriceExVat: unknown;
  unitVatAmount: unknown;
  lineTotalThb: unknown;
  deliveryStatus: string;
  couponDiscountThb: unknown;
  finalLineTotalThb: unknown;
  finalLineExVat: unknown;
  finalLineVatAmount: unknown;
}

interface DbOrder {
  id: string;
  orderNumber: string;
  confirmationUuid: string;
  customerEmail: string;
  customerPhone: string | null;
  status: string;
  paymentMethod: string | null;
  subtotalThb: unknown;
  promotionDiscountThb?: unknown;
  vatAmountThb: unknown;
  vatEnabled?: boolean;
  vatRate?: unknown;
  discountThb: unknown;
  totalAmountThb: unknown;
  requiresTaxInvoice: boolean;
  taxInvoiceName: string | null;
  taxInvoiceTaxId: string | null;
  manualFulfilmentReason: string | null;
  createdAt: Date;
  items: DbOrderItem[];
}

function mapOrder(o: DbOrder): Order {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    confirmationUuid: o.confirmationUuid,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    status: o.status,
    paymentMethod: o.paymentMethod,
    items: o.items.map((i) => {
      const _i = i as {
        couponDiscountThb?: number; finalLineTotalThb?: number;
        finalLineExVat?: number; finalLineVatAmount?: number;
        originalUnitPriceThb?: number; appliedPromotionId?: string | null;
        promotionName?: string | null; promotionType?: string | null;
        promotionValue?: number | null; promotionDiscountThb?: number;
      };
      return {
        id: i.id,
        variantId: i.variantId,
        productNameTh: i.productNameTh,
        productNameEn: i.productNameEn,
        skuCode: i.skuCode,
        denominationThb: Number(i.denominationThb),
        quantity: i.quantity,
        unitPriceThb: Number(i.unitPriceThb),
        unitPriceExVat: Number(i.unitPriceExVat),
        unitVatAmount: Number(i.unitVatAmount),
        lineTotalThb: Number(i.lineTotalThb),
        deliveryStatus: i.deliveryStatus,
        couponDiscountThb: Number(_i.couponDiscountThb ?? 0),
        finalLineTotalThb: Number(_i.finalLineTotalThb ?? i.lineTotalThb),
        finalLineExVat: Number(_i.finalLineExVat ?? 0),
        finalLineVatAmount: Number(_i.finalLineVatAmount ?? 0),
        originalUnitPriceThb: Number(_i.originalUnitPriceThb ?? 0),
        appliedPromotionId: _i.appliedPromotionId ?? null,
        promotionName: _i.promotionName ?? null,
        promotionType: _i.promotionType ?? null,
        promotionValue: _i.promotionValue != null ? Number(_i.promotionValue) : null,
        promotionDiscountThb: Number(_i.promotionDiscountThb ?? 0),
      };
    }),
    subtotalThb: Number(o.subtotalThb),
    promotionDiscountThb: Number(o.promotionDiscountThb ?? 0),
    vatAmountThb: Number(o.vatAmountThb),
    vatEnabled: o.vatEnabled === true,
    vatRate: Number(o.vatRate ?? 0),
    discountThb: Number(o.discountThb ?? 0),
    totalAmountThb: Number(o.totalAmountThb),
    requiresTaxInvoice: o.requiresTaxInvoice,
    taxInvoiceName: o.taxInvoiceName,
    taxInvoiceTaxId: o.taxInvoiceTaxId,
    manualFulfilmentReason: o.manualFulfilmentReason,
    createdAt: o.createdAt.toISOString(),
  };
}

const orderInclude = { items: true } as const;

// Re-export coupon check from the shared promotions module.
export { checkCoupon } from '@/lib/promotions';
export type { CouponCheck } from '@/lib/promotions';

/**
 * HTTP status for a createOrder failure code. Lives here (not the route) so
 * route files keep exporting only handlers, and tests can pin the mapping.
 */
export function orderErrorStatus(code: string): number {
  switch (code) {
    case 'CART_EMPTY':
    case 'TOS_NOT_ACCEPTED':
    case 'INVALID_EMAIL':
    case 'INVALID_QUANTITY':
    case 'VARIANT_NOT_FOUND':
      return 400;
    case 'OUT_OF_STOCK':
      // Conflict, not a client mistake: the item was sellable when added but
      // the stock moved before checkout (persisted cart / direct API call).
      return 409;
    default:
      return 500;
  }
}

// ─── Order preview (shared pricing contract with createOrder) ──

/**
 * Preview-order output: the same totals and per-line snapshots that
 * createOrder would persist, minus any write. This shares the exact same
 * pricing engine as createOrder so preview/order parity is structural, not
 * approximate.
 */
export interface PreviewOrderResult {
  grossSubtotalThb: number;
  promotionDiscountThb: number;
  couponDiscountThb: number;
  totalAmountThb: number;
  vatAmountThb: number;
  vatEnabled: boolean;
  vatRate: number;
  couponCheck: CouponCheck;
  items: Array<{
    variantId: string;
    quantity: number;
    tierUnitPriceThb: number;
    unitPriceThb: number;
    unitPriceExVat: number;
    unitVatAmount: number;
    promotionDiscountThb: number;
    couponDiscountThb: number;
    finalLineTotalThb: number;
    finalLineExVat: number;
    finalLineVatAmount: number;
    originalUnitPriceThb: number;
    appliedPromotionId: string | null;
    promotionName: string | null;
    promotionType: string | null;
    promotionValue: number | null;
  }>;
}

/**
 * Server-side order preview: resolve tier, VAT, promotions, coupon, and
 * item snapshots through the shared resolver (same code path as createOrder)
 * without any database writes. Used by the checkout page so displayed totals
 * and coupon eligibility match what order creation will persist.
 */
export async function previewOrder(input: {
  customerEmail: string;
  customerId?: string | null;
  items: { variantId: string; quantity: number }[];
  couponCode?: string;
}): Promise<PreviewOrderResult> {
  if (input.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail)) {
    throw new Error('INVALID_EMAIL');
  }
  if (!input.items || input.items.length === 0) throw new Error('CART_EMPTY');

  // Go through the shared resolver — same variant/tier/quantity/promotion/
  // coupon code path as createOrderInner, just without the write.
  const resolved = await resolveOrderPricing(
    { items: input.items, customerId: input.customerId, couponCode: input.couponCode },
    prisma,
  );

  const pricing = calculateReconciledOrderPricing(
    [...resolved.quantityMap.entries()].map(([variantId, qty]) => {
      const item = resolved.itemInputs.find((i) => i.variantId === variantId)!;
      const v = resolved.byId.get(variantId)!;
      return {
        variantId,
        quantity: qty,
        tierUnitPriceThb: item.unitPriceThb,
        productNameTh: item.productNameTh,
        productNameEn: item.productNameEn,
        skuCode: v.label,
      };
    }),
    resolved.vatConfig,
    resolved.promotionResults,
    resolved.couponDiscountThb,
  );

  return {
    grossSubtotalThb: pricing.grossSubtotalThb,
    promotionDiscountThb: pricing.promotionDiscountThb,
    couponDiscountThb: pricing.couponDiscountThb,
    totalAmountThb: pricing.totalAmountThb,
    vatAmountThb: pricing.vatAmountThb,
    vatEnabled: resolved.vatConfig.enabled,
    vatRate: resolved.vatConfig.rate,
    couponCheck: resolved.couponCheck,
    items: pricing.items.map((s) => ({
      variantId: s.variantId,
      quantity: s.quantity,
      tierUnitPriceThb: s.denominationThb,
      unitPriceThb: s.unitPriceThb,
      unitPriceExVat: s.unitPriceExVat,
      unitVatAmount: s.unitVatAmount,
      promotionDiscountThb: s.promotionDiscountThb,
      couponDiscountThb: s.couponDiscountThb,
      finalLineTotalThb: s.finalLineTotalThb,
      finalLineExVat: s.finalLineExVat,
      finalLineVatAmount: s.finalLineVatAmount,
      originalUnitPriceThb: s.originalUnitPriceThb,
      appliedPromotionId: s.appliedPromotionId,
      promotionName: s.promotionName,
      promotionType: s.promotionType,
      promotionValue: s.promotionValue,
    })),
  };
}

// ─── Create order ────────────────────────────────────────

/**
 * Create an order from cart item references.
 * Price/stock re-validated server-side against the live DB — client prices
 * are never trusted. Prices include VAT (store display is VAT-inclusive).
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  if (!input.tosAccepted) throw new Error('TOS_NOT_ACCEPTED');
  if (!input.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail)) {
    throw new Error('INVALID_EMAIL');
  }
  if (!input.items || input.items.length === 0) throw new Error('CART_EMPTY');

  const variantIds = input.items.map((i) => i.variantId);

  // All authoritative reads and the write happen inside one Serializable
  // transaction so price, tier, VAT, promotion eligibility, coupon state,
  // and stock cannot change between calculation and persistence. The entire
  // transaction is retried on serialization failure (P2034) — the established
  // project pattern from tests/admin-refund.test.ts and
  // tests/wallet-coupon-race.test.ts. Retry is NOT scoped to tx.order.create()
  // because any database error inside the transaction aborts it.
  //
  // Order-number collision is handled by trying successive sequence numbers
  // inside each attempt (not by re-running the whole transaction), so a
  // duplicate only wastes one attempt rather than a full recalculation.
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const result = await createOrderInner(input, tx);
          return result;
        },
        { isolationLevel: 'Serializable' },
      );
      return result;
    } catch (err) {
      lastError = err;
      if (
        attempt < 4 &&
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === 'P2034' ||
        (err as { code?: string }).code === 'P2002'
      ) {
        // serialization failure (P2034) or order-number collision (P2002)
        // — retry the whole transaction; the inner loop tries 5 sequence
        // numbers per attempt so a single collision wastes one attempt.
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Inner order-creation body, run inside a Serializable transaction.
 * Everything the order needs (variants, tier, VAT, promotions, coupon,
 * stock, and the write) happens here against `tx`.
 */
async function createOrderInner(
  input: CreateOrderInput,
  tx: import('@prisma/client').Prisma.TransactionClient,
): Promise<CreateOrderResult> {
  if (!input.tosAccepted) throw new Error('TOS_NOT_ACCEPTED');
  if (!input.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail)) {
    throw new Error('INVALID_EMAIL');
  }
  if (!input.items || input.items.length === 0) throw new Error('CART_EMPTY');

  // Go through the shared resolver — same variant/tier/quantity/promotion/
  // coupon code path as previewOrder, just inside the transaction.
  const resolved = await resolveOrderPricing(
    { items: input.items, customerId: input.customerId, couponCode: input.couponCode },
    tx,
  );

  const pricing = calculateReconciledOrderPricing(
    [...resolved.quantityMap.entries()].map(([variantId, qty]) => {
      const item = resolved.itemInputs.find((i) => i.variantId === variantId)!;
      const v = resolved.byId.get(variantId)!;
      return {
        variantId,
        quantity: qty,
        tierUnitPriceThb: item.unitPriceThb,
        productNameTh: item.productNameTh,
        productNameEn: item.productNameEn,
        skuCode: v.label,
      };
    }),
    resolved.vatConfig,
    resolved.promotionResults,
    resolved.couponDiscountThb,
  );

  const count = await tx.order.count();
  // Try successive order numbers; a duplicate key (P2002) on one attempt
  // wastes only that attempt, not the whole transaction. If all 5 numbers
  // collide the P2002 bubbles up to the outer retry (Blocker 6).
  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNumber = generateOrderNumber(count + 1 + attempt);
    try {
      const created = (await tx.order.create({
        data: {
          orderNumber, customerId: input.customerId ?? null,
          customerEmail: input.customerEmail, customerPhone: input.customerPhone ?? null,
          status: 'pending_payment', paymentMethod: input.paymentMethod,
          subtotalThb: pricing.grossSubtotalThb,
          promotionDiscountThb: pricing.promotionDiscountThb,
          discountThb: pricing.couponDiscountThb,
          vatAmountThb: pricing.vatAmountThb, totalAmountThb: pricing.totalAmountThb,
          vatEnabled: resolved.vatConfig.enabled, vatRate: resolved.vatConfig.rate,
          couponId: resolved.couponCheck.couponId ?? null,
          lineOptIn: input.lineOptIn, marketingOptIn: input.marketingOptIn,
          tosAcceptedAt: new Date(), tosVersion: input.tosVersion,
          requiresTaxInvoice: input.requiresTaxInvoice,
          taxInvoiceName: input.taxInvoiceName ?? null, taxInvoiceTaxId: input.taxInvoiceTaxId ?? null,
          confirmationUuid: crypto.randomUUID(),
          items: {
            create: pricing.items.map((s) => ({
              variantId: s.variantId,
              productNameTh: s.productNameTh,
              productNameEn: s.productNameEn,
              skuCode: s.skuCode,
              denominationThb: s.denominationThb,
              quantity: s.quantity,
              unitPriceThb: s.unitPriceThb,
              unitPriceExVat: s.unitPriceExVat,
              unitVatAmount: s.unitVatAmount,
              lineTotalThb: s.finalLineTotalThb,
              originalUnitPriceThb: s.originalUnitPriceThb,
              appliedPromotionId: s.appliedPromotionId,
              promotionName: s.promotionName,
              promotionType: s.promotionType,
              promotionValue: s.promotionValue,
              promotionDiscountThb: s.promotionDiscountThb,
              couponDiscountThb: s.couponDiscountThb,
              finalLineTotalThb: s.finalLineTotalThb,
              finalLineExVat: s.finalLineExVat,
              finalLineVatAmount: s.finalLineVatAmount,
              deliveryStatus: 'pending',
            })),
          },
        },
        include: orderInclude,
      })) as unknown as DbOrder;
      return {
        order: mapOrder(created), discountThb: pricing.couponDiscountThb,
        couponCode: resolved.couponCheck.ok ? (input.couponCode?.toUpperCase() ?? null) : null,
        couponError: resolved.couponCheck.ok ? null : (resolved.couponCheck.error ?? 'INACTIVE'),
        slipUploadToken: mintSlipUploadToken(created.id, created.confirmationUuid),
      };
    } catch (err) {
      // P2002 (unique constraint on orderNumber) — try the next sequence
      // number. Do NOT catch other errors here; they must propagate so the
      // outer retry (which now also covers P2002) can handle them.
      if (attempt < 4 && typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
        continue;
      }
      throw err;
    }
  }
  throw new Error('ORDER_NUMBER_ALLOCATION_FAILED');
}
export async function getOrderByConfirmationUuid(uuid: string): Promise<Order | null> {
  const o = await prisma.order.findUnique({
    where: { confirmationUuid: uuid },
    include: orderInclude,
  });
  return o ? mapOrder(o as unknown as DbOrder) : null;
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  return o ? mapOrder(o as unknown as DbOrder) : null;
}

export async function getOrderByNumber(orderNumber: string): Promise<Order | null> {
  const o = await prisma.order.findUnique({
    where: { orderNumber },
    include: orderInclude,
  });
  return o ? mapOrder(o as unknown as DbOrder) : null;
}

// ─── Status transitions (09-payment.md §10) ──────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_payment: [
    'payment_confirmed',
    'pending_manual_fulfilment',
    'failed',
    'expired',
    'abandoned',
  ],
  payment_confirmed: ['completed', 'pending_manual_fulfilment'],
  code_delivered: ['completed'],
  pending_manual_fulfilment: ['completed'],
  completed: ['refunded'],
};

/**
 * Update order status with transition guard. Returns false on invalid moves.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: string,
  reason?: string,
): Promise<boolean> {
  const current = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!current) return false;

  const allowed = VALID_TRANSITIONS[current.status];
  if (!allowed || !allowed.includes(newStatus)) {
    console.error(
      `[Orders] Invalid transition: ${current.status} → ${newStatus} for order ${orderId}`,
    );
    return false;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: newStatus,
      ...(reason ? { manualFulfilmentReason: reason } : {}),
    },
  });
  return true;
}

/**
 * Atomically claim a pending_payment order for confirmation (webhook /
 * admin slip-verify both use this so double-confirmation is impossible).
 * Returns the order if claimed, null if already confirmed/completed.
 */
/**
 * `tx` overload: when supplied (webhook path) the claim joins the caller's
 * transaction so claim + fulfilment are atomic (finding #7).
 */
export async function claimOrderForConfirmation(
  orderId: string,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  opts?: { paidExternally?: boolean },
): Promise<Order | null> {
  const db = tx ?? prisma;
  const claimed = await db.order.updateMany({
    where: { id: orderId, status: 'pending_payment' },
    data: { status: 'payment_confirmed' },
  });
  if (claimed.count !== 1) return null;
  // Review M4: coupon usage counts only when payment is actually confirmed,
  // and both the global limit and per-customer limit are enforced HERE at
  // the claim boundary — not at order creation (orders are created before
  // payment and may never be paid; concurrent orders could exceed limits).
  //
  // Production review HIGH-2: once the customer has PAID through an external
  // channel (Opn charge verified by webhook, or a SlipOK-verified slip), the
  // money is gone — rejecting the confirmation because coupon state changed
  // afterwards (expired/deactivated/lost a usage race) strands a paid order
  // with no reconciliation path. `paidExternally` switches the coupon step
  // to HONOR-THE-SNAPSHOT: the discounted amount was computed and charged,
  // so usage is still recorded (best-effort, never below zero) but no
  // capacity check can fail the unit. Wallet/admin paths keep the strict
  // checks (nothing external to reconcile; the customer can retry).
  const strict = !opts?.paidExternally;
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { couponId: true, customerId: true },
  });
  if (order?.couponId) {
    const coupon = await db.coupon.findUnique({
      where: { id: order.couponId },
      select: { usageLimit: true, perCustomerLimit: true, isActive: true },
    });
    if (!coupon || !coupon.isActive) {
      if (strict) throw new Error('COUPON_NO_LONGER_VALID');
      console.error(
        `[orders] coupon no longer active at confirmation of PAID order ${orderId} — honoring the charged snapshot (production review HIGH-2)`,
      );
    } else {
      // Global capacity: only increment when still under the limit (the
      // conditional update is the atomic guard — racing claims lose here).
      if (coupon.usageLimit !== null) {
        const bumped = await db.coupon.updateMany({
          where: { id: order.couponId, usageCount: { lt: coupon.usageLimit } },
          data: { usageCount: { increment: 1 } },
        });
        if (bumped.count !== 1) {
          if (strict) throw new Error('COUPON_USAGE_LIMIT');
          // Paid externally: record the over-limit usage honestly (the
          // discount WAS granted in the charged amount) rather than strand
          // the money. usageCount can exceed the limit; the row documents
          // it and reconciliation alerting can pick it up.
          await db.coupon.update({
            where: { id: order.couponId },
            data: { usageCount: { increment: 1 } },
          });
          console.error(
            `[orders] coupon ${order.couponId} usage over limit at confirmation of PAID order ${orderId} — recorded (HIGH-2)`,
          );
        }
      } else {
        await db.coupon.update({
          where: { id: order.couponId },
          data: { usageCount: { increment: 1 } },
        });
      }
    }
    // Per-customer cap + idempotency: one redemption row per (coupon, order).
    if (order.customerId) {
      try {
        await db.couponRedemption.create({
          data: { couponId: order.couponId, customerId: order.customerId, orderId },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('Unique constraint')) throw e;
        // Row already exists for this order (retry after a later-step
        // failure) — keep the existing one, do not double-count.
      }
      const per = coupon?.perCustomerLimit ?? 1;
      const mine = await db.couponRedemption.count({
        where: { couponId: order.couponId, customerId: order.customerId },
      });
      if (mine > per) {
        if (strict) throw new Error('COUPON_PER_CUSTOMER_LIMIT');
        console.error(
          `[orders] per-customer coupon cap exceeded at confirmation of PAID order ${orderId} — recorded (HIGH-2)`,
        );
      }
    }
  }
  const o = await db.order.findUnique({ where: { id: orderId }, include: orderInclude });
  return o ? mapOrder(o as unknown as DbOrder) : null;
}
