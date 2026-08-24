/**
 * Order API — Extended with payment status transitions.
 * 07-api.md §10 + 09-payment.md §10 — Order state machine.
 *
 * State machine:
 *   pending_payment → payment_confirmed → code_delivered → completed
 *   pending_payment → failed → failed_final
 *   pending_payment → expired
 *   completed → refunded
 */

import { seedProducts } from '@/seed-data/products';
import { type CartState } from '@/lib/cart';
import { calculateVat, calculateTotal, generateOrderNumber } from '@/lib/pricing';

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
  totalAmountThb: number;
  requiresTaxInvoice: boolean;
  taxInvoiceName: string | null;
  taxInvoiceTaxId: string | null;
  manualFulfilmentReason: string | null;
  createdAt: string;
}

export interface CreateOrderInput {
  sessionKey: string;
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
}

// In-memory order store for mock API
const orderStore = new Map<string, Order>();
let orderSequence = 1;

/**
 * Find a variant by ID for price/stock re-validation.
 */
function findVariantForValidation(
  variantId: string,
): { salePriceThb: string; faceValueThb: string; inStock: boolean; skuCode: string } | null {
  for (const product of seedProducts) {
    for (const variant of product.variants) {
      if (variant.id === variantId) {
        return variant;
      }
    }
  }
  return null;
}

/**
 * Create an order from the current cart.
 * 07-api.md §10 — POST /api/v1/orders
 */
export function createOrder(
  input: CreateOrderInput,
  cart: CartState,
): Order {
  if (!input.tosAccepted) {
    throw new Error('TOS_NOT_ACCEPTED');
  }
  if (!input.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail)) {
    throw new Error('INVALID_EMAIL');
  }
  if (cart.items.length === 0) {
    throw new Error('CART_EMPTY');
  }

  const validatedItems: OrderItem[] = [];
  let subtotal = 0;

  for (const cartItem of cart.items) {
    const variant = findVariantForValidation(cartItem.variantId);
    if (!variant) throw new Error('VARIANT_NOT_FOUND');
    if (!variant.inStock) throw new Error('OUT_OF_STOCK');

    const serverPrice = parseFloat(variant.salePriceThb);
    const denomination = parseFloat(variant.faceValueThb);
    const exVat = Math.round((serverPrice / 1.07) * 100) / 100;
    const vatAmount = Math.round((serverPrice - exVat) * 100) / 100;
    const lineTotal = Math.round(serverPrice * cartItem.quantity * 100) / 100;

    subtotal = Math.round((subtotal + lineTotal) * 100) / 100;

    validatedItems.push({
      id: `order-item-${Date.now()}-${cartItem.variantId}`,
      variantId: cartItem.variantId,
      productNameTh: cartItem.productNameTh,
      productNameEn: cartItem.productNameEn,
      skuCode: cartItem.skuCode,
      denominationThb: denomination,
      quantity: cartItem.quantity,
      unitPriceThb: serverPrice,
      unitPriceExVat: exVat,
      unitVatAmount: vatAmount,
      lineTotalThb: lineTotal,
      deliveryStatus: 'pending',
    });
  }

  const vat = calculateVat(subtotal);
  const total = calculateTotal(subtotal, vat);
  const orderId = `order-${Date.now()}`;
  const orderNumber = generateOrderNumber(orderSequence++);
  const confirmationUuid = crypto.randomUUID();

  const order: Order = {
    id: orderId,
    orderNumber,
    confirmationUuid,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone ?? null,
    status: 'pending_payment',
    paymentMethod: input.paymentMethod,
    items: validatedItems,
    subtotalThb: subtotal,
    vatAmountThb: vat,
    totalAmountThb: total,
    requiresTaxInvoice: input.requiresTaxInvoice,
    taxInvoiceName: input.taxInvoiceName ?? null,
    taxInvoiceTaxId: input.taxInvoiceTaxId ?? null,
    manualFulfilmentReason: null,
    createdAt: new Date().toISOString(),
  };

  orderStore.set(orderId, order);
  return order;
}

/**
 * Get order by confirmation UUID.
 */
export function getOrderByConfirmationUuid(uuid: string): Order | null {
  for (const order of orderStore.values()) {
    if (order.confirmationUuid === uuid) return order;
  }
  return null;
}

/**
 * Get order by ID.
 */
export function getOrderById(orderId: string): Order | null {
  return orderStore.get(orderId) ?? null;
}

/**
 * Update order status — 09-payment.md §10 state machine.
 */
export function updateOrderStatus(
  orderId: string,
  newStatus: string,
  reason?: string,
): void {
  const order = orderStore.get(orderId);
  if (!order) return;

  const validTransitions: Record<string, string[]> = {
    pending_payment: ['payment_confirmed', 'failed', 'expired', 'abandoned'],
    payment_confirmed: ['code_delivered', 'pending_manual_fulfilment'],
    code_delivered: ['completed'],
    pending_manual_fulfilment: ['completed'],
    completed: ['refunded'],
  };

  const allowed = validTransitions[order.status];
  if (!allowed || !allowed.includes(newStatus)) {
    console.error(
      `[Orders] Invalid transition: ${order.status} → ${newStatus} for order ${orderId}`,
    );
    return;
  }

  order.status = newStatus;
  if (reason) {
    order.manualFulfilmentReason = reason;
  }

  if (newStatus === 'completed') {
    // Mark all items as delivered
    order.items = order.items.map((item) => ({
      ...item,
      deliveryStatus: 'delivered',
    }));
  }
}
