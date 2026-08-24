/**
 * Payment Gateway Interface — LD-01 adapter pattern.
 * 09-payment.md §1 — Route handlers, webhook handlers, and refund logic
 * never call gateway SDK directly — always through this interface.
 *
 * OmiseAdapter implements PaymentGateway ← built now
 * TwoC2PAdapter implements PaymentGateway ← Phase 2, same interface
 */

export interface ChargeRequest {
  /** Amount in satang (THB × 100), server-authoritative per LD-11 */
  amountSatang: number;
  /** Human-readable order number for gateway dashboard */
  orderNumber: string;
  /** Currency code (always 'THB') */
  currency: string;
  /** Description for gateway dashboard */
  description?: string;
}

export interface ChargeResult {
  /** Gateway charge ID (e.g. "chrg_test_xxxxx") */
  chargeId: string;
  /** Charge status from gateway */
  status: 'pending' | 'successful' | 'failed';
  /** For PromptPay: base64 QR image data URI */
  qrImageUri?: string;
  /** For PromptPay: QR expiry timestamp */
  expiresAt?: Date;
  /** For Card: 3DS redirect URI if required */
  authorizeUri?: string;
  /** Raw gateway response (sanitized — no PAN/CVV) */
  rawResponse?: Record<string, unknown>;
}

export interface WebhookEvent {
  /** Normalized event key */
  key: 'charge.complete' | 'charge.failed' | 'charge.expired' | 'unknown';
  /** Gateway charge ID */
  chargeId: string;
  /** Charge amount in satang */
  amount: number;
  /** Charge status */
  status: 'successful' | 'failed' | 'expired';
  /** Failure message if failed */
  failureMessage?: string;
  /** Failure code if failed */
  failureCode?: string;
  /** Raw event data (sanitized) */
  rawData?: Record<string, unknown>;
}

export interface RefundRequest {
  /** Gateway charge ID to refund */
  chargeRef: string;
  /** Refund amount in satang */
  amountSatang: number;
  /** Reason for refund */
  reason: string;
}

export interface RefundResult {
  refundId: string;
  status: 'pending' | 'successful' | 'failed';
}

/**
 * PaymentGateway — Abstract interface for payment provider integration.
 * 09-payment.md LD-01: All gateway calls go through this adapter.
 */
export interface PaymentGateway {
  /** Create a PromptPay charge (generates QR code) */
  createPromptPayCharge(request: ChargeRequest): Promise<ChargeResult>;

  /** Create a card charge (may trigger 3DS2) */
  createCardCharge(
    request: ChargeRequest,
    token: string,
    returnUrl: string,
  ): Promise<ChargeResult>;

  /** Verify webhook signature */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean;

  /** Parse and normalize a webhook event */
  parseWebhookEvent(rawBody: Buffer): WebhookEvent;

  /** Process a refund */
  refund(request: RefundRequest): Promise<RefundResult>;
}
