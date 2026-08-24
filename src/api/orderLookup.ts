/**
 * Order Lookup API — 07-api.md §10.
 *
 * POST /orders/lookup — Guest order retrieval by email + order number
 * POST /orders/:id/resend-email — Re-send code delivery email
 *
 * AC-005: resend-to-original-email-only, mismatched email returns 404 (no enumeration).
 */

import { getOrderById, type Order } from './orders';
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
export function lookupOrder(
  email: string,
  orderNumber: string,
): OrderLookupResult {
  // Find order by order number — scan all orders (mock)
  // In production: SELECT * FROM orders WHERE order_number = $1
  const order = findOrderByNumber(orderNumber);

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
  const order = getOrderById(orderId);
  if (!order) {
    return { success: false, error: 'NOT_FOUND' };
  }

  // Verify email matches (no enumeration)
  if (order.customerEmail.toLowerCase() !== email.toLowerCase()) {
    return { success: false, error: 'NOT_FOUND' };
  }

  // Build confirmation URL
  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000';
  const confirmationUrl = `${siteUrl}/orders/${order.confirmationUuid}`;

  // Generate email
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

  // Send with retry (3× exponential backoff)
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

/**
 * Find order by order number (mock — scans in-memory store).
 */
function findOrderByNumber(orderNumber: string): Order | null {
  // Use the same store as getOrderById
  // In production: SELECT * FROM orders WHERE order_number = $1
  const order = getOrderById(`order-${orderNumber}`);
  return order;
}
