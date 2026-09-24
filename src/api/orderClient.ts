/**
 * Client-side order API — thin fetch wrapper over /api/v1/orders.
 * The old checkout imported the server createOrder directly (in-memory
 * mock); now checkout talks to the real backend.
 */

import type { CartState } from '@/lib/cart';
import type { Order } from './orders';

export type { Order, OrderItem } from './orders';

export interface CreateOrderResponse {
  order: Order;
  discountThb: number;
  couponCode: string | null;
  couponError: string | null;
  /** Capability token authorizing THIS order's slip upload (server-minted HMAC). */
  slipUploadToken: string | null;
}

export interface CheckoutContactInput {
  email: string;
  phone?: string;
  marketingOptIn: boolean;
  tosAccepted: boolean;
  requiresTaxInvoice: boolean;
  taxInvoiceName?: string;
  taxInvoiceTaxId?: string;
}

export async function apiCreateOrder(
  input: CheckoutContactInput,
  cart: CartState,
  couponCode?: string,
): Promise<CreateOrderResponse> {
  const res = await fetch('/api/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      ...input,
      paymentMethod: 'promptpay' as const,
      couponCode: couponCode || undefined,
      items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.code ?? body?.error ?? 'ORDER_CREATE_FAILED');
  }
  return body as CreateOrderResponse;
}

export async function apiInitiatePayment(orderId: string): Promise<{
  paymentAttemptId: string;
  qrImageUrl?: string;
  qrExpiresAt?: string;
  gatewayRef?: string;
}> {
  const res = await fetch('/api/v1/payments/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orderId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.code ?? body?.error ?? 'PAYMENT_INIT_FAILED');
  }
  return body;
}

export async function apiPollPayment(
  paymentAttemptId: string,
): Promise<{ status: string; orderStatus?: string; confirmationUuid?: string }> {
  const res = await fetch(`/api/v1/payments/${paymentAttemptId}/status`, {
    credentials: 'include',
  });
  if (!res.ok) return { status: 'pending' };
  return res.json();
}
