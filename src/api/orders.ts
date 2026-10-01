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
 */

import { prisma } from '@/lib/db';
import { generateOrderNumber, normalizeTier, tierPrice } from '@/lib/pricing';
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
  vatAmountThb: number;
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
  vatAmountThb: unknown;
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
    items: o.items.map((i) => ({
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
    })),
    subtotalThb: Number(o.subtotalThb),
    vatAmountThb: Number(o.vatAmountThb),
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

// ─── Coupon validation (server-authoritative) ────────────

export interface CouponCheck {
  ok: boolean;
  discountThb: number;
  error?: 'NOT_FOUND' | 'INACTIVE' | 'NOT_STARTED' | 'EXPIRED' | 'MIN_SPEND' | 'USAGE_LIMIT';
  couponId?: string;
}

export async function checkCoupon(code: string, subtotalThb: number): Promise<CouponCheck> {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.isActive) return { ok: false, discountThb: 0, error: 'INACTIVE' };
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now)
    return { ok: false, discountThb: 0, error: 'NOT_STARTED' };
  if (coupon.expiresAt && coupon.expiresAt < now)
    return { ok: false, discountThb: 0, error: 'EXPIRED' };
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { ok: false, discountThb: 0, error: 'USAGE_LIMIT' };
  }
  // Per-customer limit checked at creation for UX (the authoritative check
  // is at the payment claim — see claimOrderForConfirmation).
  const min = Number(coupon.minSpendThb ?? 0);
  if (min > 0 && subtotalThb < min) return { ok: false, discountThb: 0, error: 'MIN_SPEND' };

  const value = Number(coupon.discountValue);
  const discountThb =
    coupon.discountType === 'percent'
      ? Math.min(Math.round(subtotalThb * (value / 100) * 100) / 100, subtotalThb)
      : Math.min(value, subtotalThb);
  return { ok: true, discountThb, couponId: coupon.id };
}

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
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, isActive: true },
    include: { product: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  let subtotal = 0;
  const rows: {
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
  }[] = [];

  // Tier-aware pricing: resolve the tier from input.customerId (set by the
  // route from the session cookie — never from the client body).
  let tier: 'retail' | 'member' | 'dealer' = 'retail';
  if (input.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { tier: true },
    });
    if (customer) tier = normalizeTier(customer.tier);
  }

  for (const item of input.items) {
    const v = byId.get(item.variantId);
    if (!v) throw new Error('VARIANT_NOT_FOUND');
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50) {
      throw new Error('INVALID_QUANTITY');
    }
    // Client report 2026-10-01: a persisted cart (or a direct API call) could
    // order a variant whose stock hit 0 after the item was added — the UI
    // disables it but createOrder never re-checked. Reject before any write;
    // the fulfilment-time GiftCode guard stays as the second line of defense.
    if (v.stock < item.quantity) {
      throw new Error('OUT_OF_STOCK');
    }

    const unit = tierPrice(Number(v.price), tier, {
      memberPrice: v.memberPrice != null ? Number(v.memberPrice) : null,
      dealerPrice: v.dealerPrice != null ? Number(v.dealerPrice) : null,
    });
    const exVat = Math.round((unit / 1.07) * 100) / 100;
    const vatAmount = Math.round((unit - exVat) * 100) / 100;
    const lineTotal = Math.round(unit * item.quantity * 100) / 100;
    subtotal = Math.round((subtotal + lineTotal) * 100) / 100;

    rows.push({
      variantId: v.id,
      productNameTh: v.product.name,
      productNameEn: v.product.name,
      skuCode: v.label,
      denominationThb: unit,
      quantity: item.quantity,
      unitPriceThb: unit,
      unitPriceExVat: exVat,
      unitVatAmount: vatAmount,
      lineTotalThb: lineTotal,
    });
  }

  // VAT-inclusive pricing: VAT is derived from the subtotal, not added on top.
  const vat = Math.round((subtotal - Math.round((subtotal / 1.07) * 100) / 100) * 100) / 100;

  // Coupon (optional) — validated against the subtotal.
  let discount = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  let couponError: string | null = null;
  if (input.couponCode) {
    const check = await checkCoupon(input.couponCode, subtotal);
    if (check.ok && check.couponId) {
      discount = check.discountThb;
      couponId = check.couponId;
      couponCode = input.couponCode.toUpperCase();
    } else {
      couponError = check.error ?? 'INACTIVE';
    }
  }

  const total = Math.max(Math.round((subtotal - discount) * 100) / 100, 0);

  // Order number allocation. The count-based seed is only a starting point:
  // concurrent checkouts can all pass the old lookup-then-insert together, so
  // the insert itself retries on the orderNumber unique violation (P2002)
  // with the next candidate. The unique constraint is the source of truth.
  const count = await prisma.order.count();
  let created: DbOrder | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const orderNumber = generateOrderNumber(count + 1 + attempt);
    try {
      created = (await prisma.order.create({
        data: {
          orderNumber,
          customerId: input.customerId ?? null,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone ?? null,
          status: 'pending_payment',
          paymentMethod: input.paymentMethod,
          subtotalThb: subtotal,
          vatAmountThb: vat,
          discountThb: discount,
          totalAmountThb: total,
          couponId,
          lineOptIn: input.lineOptIn,
          marketingOptIn: input.marketingOptIn,
          tosAcceptedAt: new Date(),
          tosVersion: input.tosVersion,
          requiresTaxInvoice: input.requiresTaxInvoice,
          taxInvoiceName: input.taxInvoiceName ?? null,
          taxInvoiceTaxId: input.taxInvoiceTaxId ?? null,
          confirmationUuid: crypto.randomUUID(),
          items: { create: rows },
        },
        include: orderInclude,
      })) as unknown as DbOrder;
    } catch (err) {
      // P2002 = unique constraint. orderNumber is the only realistically
      // colliding key here (confirmationUuid is a fresh UUID), so retry with
      // the next candidate number; anything else is a real failure.
      if (
        attempt < 4 &&
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === 'P2002'
      ) {
        continue;
      }
      throw err;
    }
  }
  if (!created) {
    throw new Error('ORDER_NUMBER_ALLOCATION_FAILED');
  }

  return {
    order: mapOrder(created),
    discountThb: discount,
    couponCode,
    couponError,
    // Capability token for slip upload (finding: order ID alone must not
    // authorize replacing payment evidence). Only the checkout response of
    // the creating customer receives it.
    slipUploadToken: mintSlipUploadToken(created.id, created.confirmationUuid),
  };
}

// ─── Lookups ─────────────────────────────────────────────

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
