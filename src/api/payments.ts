/**
 * Payment API — 07-api.md §11, 09-payment.md §3-4.
 *
 * POST /payments/initiate — Create PromptPay QR or card charge
 * POST /payments/card-token — Submit card token for charge
 * POST /payments/regenerate-qr — Generate new QR for expired QR
 * GET  /payments/:id/status — Poll payment status
 */

import { OmiseAdapter } from '@/lib/payment/omise';
import { gatewayCircuitBreaker, GatewayUnavailableError } from '@/lib/payment/circuitBreaker';
import { reserveCodes } from '@/lib/delivery/reservation';
import { enqueueJob } from '@/lib/jobs/mockQueue';
import type { Order } from './orders';

// Singleton gateway adapter
const gateway = new OmiseAdapter();

// In-memory payment attempt store (mock)
const paymentAttempts = new Map<string, PaymentAttemptRecord>();

export interface PaymentAttemptRecord {
  id: string;
  orderId: string;
  paymentMethod: string;
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  amountThb: number;
  gatewayName: string;
  gatewayRef: string | null;
  qrExpiresAt: Date | null;
  attemptNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InitiatePaymentResult {
  paymentAttemptId: string;
  paymentMethod: string;
  amountThb: number;
  qrImageUrl?: string | undefined;
  qrExpiresAt?: string | undefined;
  gatewayRef?: string | undefined;
  gatewayTokenEndpoint?: string | undefined;
  publicKey?: string | undefined;
}

/**
 * Initiate payment for an order.
 * 07-api.md §11 — POST /payments/initiate
 *
 * LD-03: QR TTL = 15 minutes.
 * LD-11: Amount is server-authoritative from order.total_amount_thb.
 */
export async function initiatePayment(
  orderId: string,
  paymentMethod: 'promptpay' | 'credit_card' | 'debit_card',
  order: Order,
): Promise<InitiatePaymentResult> {
  // Validate order status
  if (order.status !== 'pending_payment') {
    throw new Error('ORDER_NOT_PAYABLE');
  }

  // Server-authoritative amount (LD-11)
  const amountSatang = Math.round(Number(order.totalAmountThb) * 100);
  const amountThb = Number(order.totalAmountThb);

  // Create payment attempt record
  const attemptId = `pa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    if (paymentMethod === 'promptpay') {
      // §3 — PromptPay flow
      const result = await gatewayCircuitBreaker.call(() =>
        gateway.createPromptPayCharge({
          amountSatang,
          orderNumber: order.orderNumber,
          currency: 'THB',
          description: `Nong-Kati Order ${order.orderNumber}`,
        }),
      );

      const attempt: PaymentAttemptRecord = {
        id: attemptId,
        orderId,
        paymentMethod: 'promptpay',
        status: 'pending',
        amountThb,
        gatewayName: 'omise',
        gatewayRef: result.chargeId,
        qrExpiresAt: result.expiresAt ?? null,
        attemptNumber: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      paymentAttempts.set(attemptId, attempt);

      // Reserve codes (§7.1 — reservation trigger)
      // In production, this is per order_item; simplified here
      for (const item of order.items) {
        reserveCodes(item.variantId, item.quantity, orderId, item.id);
      }

      return {
        paymentAttemptId: attemptId,
        paymentMethod: 'promptpay',
        amountThb,
        qrImageUrl: result.qrImageUri,
        qrExpiresAt: result.expiresAt?.toISOString(),
        gatewayRef: result.chargeId,
      };
    } else {
      // §4 — Card flow
      const result = await gatewayCircuitBreaker.call(() =>
        gateway.createCardCharge(
          {
            amountSatang,
            orderNumber: order.orderNumber,
            currency: 'THB',
            description: `Nong-Kati Order ${order.orderNumber}`,
          },
          '', // token provided later via card-token endpoint
          `${process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000'}/checkout/confirmation/${order.confirmationUuid}`,
        ),
      );

      const attempt: PaymentAttemptRecord = {
        id: attemptId,
        orderId,
        paymentMethod: 'credit_card',
        status: 'pending',
        amountThb,
        gatewayName: 'omise',
        gatewayRef: result.chargeId,
        qrExpiresAt: null,
        attemptNumber: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      paymentAttempts.set(attemptId, attempt);

      return {
        paymentAttemptId: attemptId,
        paymentMethod: 'credit_card',
        amountThb,
        gatewayRef: result.chargeId,
        gatewayTokenEndpoint: 'https://js.omise.co',
        publicKey: process.env['NK_OMISE_PUBLIC_KEY'] ?? 'pkey_test_mock',
      };
    }
  } catch (err) {
    if (err instanceof GatewayUnavailableError) {
      throw new Error('SERVICE_UNAVAILABLE');
    }
    throw err;
  }
}

/**
 * Submit card token for charge.
 * 07-api.md §11 — POST /payments/card-token
 */
export async function submitCardToken(
  orderId: string,
  paymentAttemptId: string,
  gatewayToken: string,
  order: Order,
): Promise<{
  status: string;
  threeDsRequired?: boolean;
  threeDsRedirectUrl?: string;
  orderStatus?: string;
}> {
  const attempt = paymentAttempts.get(paymentAttemptId);
  if (!attempt || attempt.orderId !== orderId) {
    throw new Error('NOT_FOUND');
  }

  const amountSatang = Math.round(Number(order.totalAmountThb) * 100);

  const result = await gatewayCircuitBreaker.call(() =>
    gateway.createCardCharge(
      {
        amountSatang,
        orderNumber: order.orderNumber,
        currency: 'THB',
      },
      gatewayToken,
      `${process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000'}/checkout/confirmation/${order.confirmationUuid}`,
    ),
  );

  attempt.status = result.status === 'successful' ? 'succeeded' : 'pending';
  attempt.updatedAt = new Date();

  if (result.authorizeUri) {
    // 3DS required
    return {
      status: 'pending',
      threeDsRequired: true,
      threeDsRedirectUrl: result.authorizeUri,
    };
  }

  if (result.status === 'successful') {
    // Frictionless — payment succeeded synchronously
    // §5 LD-06: Webhook is still the source of truth for code delivery
    // This only updates UI state optimistically
    return {
      status: 'succeeded',
      orderStatus: 'payment_confirmed',
    };
  }

  return { status: 'pending' };
}

/**
 * Get payment status (for polling).
 * 07-api.md §11 — GET /payments/:id/status
 *
 * §9-payment.md §6: Reads from DB only, never re-queries gateway live.
 */
export function getPaymentStatus(
  paymentAttemptId: string,
): { status: string; orderStatus: string; confirmationUuid?: string } | null {
  const attempt = paymentAttempts.get(paymentAttemptId);
  if (!attempt) return null;

  // In production, this joins with orders table
  return {
    status: attempt.status,
    orderStatus: attempt.status === 'succeeded' ? 'payment_confirmed' : 'pending_payment',
  };
}

/**
 * Get payment attempt by gateway ref (for webhook processing).
 */
export function getPaymentAttemptByGatewayRef(
  gatewayName: string,
  gatewayRef: string,
): PaymentAttemptRecord | null {
  for (const attempt of paymentAttempts.values()) {
    if (attempt.gatewayName === gatewayName && attempt.gatewayRef === gatewayRef) {
      return attempt;
    }
  }
  return null;
}

/**
 * Update payment attempt status (called by webhook handler).
 */
export function updatePaymentAttemptStatus(
  paymentAttemptId: string,
  status: PaymentAttemptRecord['status'],
  gatewayResponse?: Record<string, unknown>,
): void {
  const attempt = paymentAttempts.get(paymentAttemptId);
  if (!attempt) return;

  attempt.status = status;
  attempt.updatedAt = new Date();
}
