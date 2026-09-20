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
  const min = Number(coupon.minSpendThb ?? 0);
  if (min > 0 && subtotalThb < min) return { ok: false, discountThb: 0, error: 'MIN_SPEND' };

  const value = Number(coupon.discountValue);
  const discountThb =
    coupon.discountType === 'percent'
      ? Math.min(Math.round(subtotalThb * (value / 100) * 100) / 100, subtotalThb)
      : Math.min(value, subtotalThb);
  return { ok: true, discountThb, couponId: coupon.id };
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

  // Order number: sequence = count of existing orders + 1 (collisions retried).
  const count = await prisma.order.count();
  let orderNumber = generateOrderNumber(count + 1);
  for (let attempt = 0; attempt < 5; attempt++) {
    const exists = await prisma.order.findUnique({ where: { orderNumber } });
    if (!exists) break;
    orderNumber = generateOrderNumber(count + 2 + attempt);
  }

  const created = await prisma.order.create({
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
  });

  return {
    order: mapOrder(created as unknown as DbOrder),
    discountThb: discount,
    couponCode,
    couponError,
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
export async function claimOrderForConfirmation(orderId: string): Promise<Order | null> {
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, status: 'pending_payment' },
    data: { status: 'payment_confirmed' },
  });
  if (claimed.count !== 1) return null;
  // Coupon usage counts only when payment is actually confirmed.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { couponId: true },
  });
  if (order?.couponId) {
    await prisma.coupon.update({
      where: { id: order.couponId },
      data: { usageCount: { increment: 1 } },
    });
  }
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  return o ? mapOrder(o as unknown as DbOrder) : null;
}
