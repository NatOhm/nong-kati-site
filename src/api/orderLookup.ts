/**
 * Order Lookup API — 07-api.md §10.
 *
 * POST /orders/lookup — Guest order retrieval by email + order number
 * POST /orders/:id/resend-email — Re-send code delivery email
 *
 * AC-005: resend-to-original-email-only, mismatched email returns 404 (no enumeration).
 */

import { getOrderByNumber, getOrderById, type Order } from './orders';
import { sendEmailWithRetry } from '@/lib/email/resend';
import { orderConfirmationTemplate } from '@/lib/email/templates';

export interface OrderLookupResult {
  success: boolean;
  order?: Order;
  error?: string;
}

/**
 * Look up an order by email + order number.
 * 07-api.md §10 — POST /orders/lookup
 *
 * Rate limited: 20 req/IP/hour (enforced at middleware level).
 * No enumeration: same error for "not found" and "wrong email".
 */
export async function lookupOrder(email: string, orderNumber: string): Promise<OrderLookupResult> {
  const order = await getOrderByNumber(orderNumber);

  if (!order) {
    return { success: false, error: 'NOT_FOUND' };
  }

  // Verify email matches (AC-005 — no enumeration)
  if (order.customerEmail.toLowerCase() !== email.toLowerCase()) {
    return { success: false, error: 'NOT_FOUND' };
  }

  return { success: true, order };
}

/**
 * Resend order confirmation email.
 * 07-api.md §10 — POST /orders/:id/resend-email
 *
 * AC-005: Validates email matches order's original email.
 * Rate limited: 3 resends per order per hour.
 */
export async function resendOrderEmail(
  orderId: string,
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const order = await getOrderById(orderId);
  if (!order) {
    return { success: false, error: 'NOT_FOUND' };
  }

  // Verify email matches (no enumeration)
  if (order.customerEmail.toLowerCase() !== email.toLowerCase()) {
    return { success: false, error: 'NOT_FOUND' };
  }

  return sendOrderConfirmationEmail(order);
}

/**
 * Render and send the order-confirmation email for an order.
 *
 * Shared by the customer resend (07-api.md §10) and the admin resend
 * (07-api.md §22) so there is exactly one implementation of what that email
 * contains and how it is retried — a second copy would drift silently.
 *
 * The admin path is permission-gated and low-frequency, so it needs no
 * per-sender rate limit. The CUSTOMER path does: `resendOrderEmail` above is
 * documented as "3 resends per order per hour" but NO rate limit is
 * implemented in its body — do not mount a customer-facing resend route from
 * this helper until that is added.
 */
export async function sendOrderConfirmationEmail(
  order: Order,
): Promise<{ success: boolean; error?: string }> {
  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000';
  const confirmationUrl = `${siteUrl}/orders/${order.confirmationUuid}`;

  const template = orderConfirmationTemplate({
    orderNumber: order.orderNumber,
    customerEmail: order.customerEmail,
    items: order.items.map((item) => ({
      productNameTh: item.productNameTh,
      denomination: Number(item.denominationThb),
      quantity: item.quantity,
    })),
    subtotalThb: Number(order.subtotalThb),
    vatAmountThb: Number(order.vatAmountThb),
    totalAmountThb: Number(order.totalAmountThb),
    confirmationUrl,
  });

  const result = await sendEmailWithRetry({
    to: order.customerEmail,
    subject: template.subject,
    html: template.html,
  });

  if (!result.success) {
    return { success: false, error: result.error as string };
  }
  return { success: true };
}
