/**
 * Mock OmiseAdapter — Implements PaymentGateway for sandbox testing.
 * 09-payment.md §1, §2 — Gateway adapter pattern.
 *
 * In production, this calls the real Omise API.
 * For M4 staging/testing, this simulates gateway responses.
 *
 * Env vars:
 *   NK_OMISE_PUBLIC_KEY (client-side, safe to expose)
 *   NK_OMISE_SECRET_KEY (server-only)
 *   NK_OMISE_WEBHOOK_SECRET (HMAC signing)
 */

import { createHmac, timingSafeEqual } from 'crypto';
import {
  type PaymentGateway,
  type ChargeRequest,
  type ChargeResult,
  type WebhookEvent,
  type RefundRequest,
  type RefundResult,
} from './gateway';

export class OmiseAdapter implements PaymentGateway {
  private secretKey: string;
  private webhookSecret: string;
  private isMock: boolean;

  constructor() {
    this.secretKey = process.env['NK_OMISE_SECRET_KEY'] ?? '';
    this.webhookSecret = process.env['NK_OMISE_WEBHOOK_SECRET'] ?? '';
    // Mock mode when no real keys configured
    this.isMock = !this.secretKey || this.secretKey.startsWith('skey_test_mock');
  }

  async createPromptPayCharge(request: ChargeRequest): Promise<ChargeResult> {
    if (this.isMock) {
      return this.mockPromptPayCharge(request);
    }
    // Real Omise API call would go here
    throw new Error('Real Omise API not implemented — use mock keys for staging');
  }

  async createCardCharge(
    request: ChargeRequest,
    token: string,
    returnUrl: string,
  ): Promise<ChargeResult> {
    if (this.isMock) {
      return this.mockCardCharge(request, token, returnUrl);
    }
    throw new Error('Real Omise API not implemented — use mock keys for staging');
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean {
    if (this.isMock) {
      return this.mockVerifySignature(rawBody, signatureHeader);
    }
    // Real Omise HMAC verification
    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    return timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader),
    );
  }

  parseWebhookEvent(rawBody: Buffer): WebhookEvent {
    try {
      const data = JSON.parse(rawBody.toString('utf8'));
      // Omise webhook structure: { key: "charge.complete", data: { ... } }
      const key = data.key ?? 'unknown';
      const charge = data.data ?? {};

      return {
        key: key as WebhookEvent['key'],
        chargeId: charge.id ?? '',
        amount: charge.amount ?? 0,
        status: charge.status === 'successful' ? 'successful'
          : charge.status === 'failed' ? 'failed'
          : charge.status === 'expired' ? 'expired'
          : 'failed',
        failureMessage: charge.failure_message ?? undefined,
        failureCode: charge.failure_code ?? undefined,
        rawData: {
          id: charge.id,
          amount: charge.amount,
          status: charge.status,
          paid_at: charge.paid_at,
          failure_message: charge.failure_message,
          failure_code: charge.failure_code,
        },
      };
    } catch {
      return {
        key: 'unknown',
        chargeId: '',
        amount: 0,
        status: 'failed',
        failureMessage: 'Invalid webhook payload',
      };
    }
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    if (this.isMock) {
      return {
        refundId: `reft_mock_${Date.now()}`,
        status: 'successful',
      };
    }
    throw new Error('Real Omise refund not implemented');
  }

  // ─── Mock implementations ───────────────────────────────

  private mockPromptPayCharge(request: ChargeRequest): Promise<ChargeResult> {
    const chargeId = `chrg_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Generate a simple QR code placeholder as base64 PNG
    // In real implementation, this comes from Omise API
    const qrDataUrl = this.generateMockQrDataUrl(request.amountSatang, request.orderNumber);

    return Promise.resolve({
      chargeId,
      status: 'pending',
      qrImageUri: qrDataUrl,
      expiresAt,
      rawResponse: {
        id: chargeId,
        amount: request.amountSatang,
        currency: 'THB',
        status: 'pending',
        source: {
          type: 'promptpay',
        },
      },
    });
  }

  private mockCardCharge(
    request: ChargeRequest,
    _token: string,
    _returnUrl: string,
  ): Promise<ChargeResult> {
    const chargeId = `chrg_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Mock: 80% chance frictionless (no 3DS), 20% chance 3DS required
    const requires3DS = Math.random() < 0.2;

    if (requires3DS) {
      return Promise.resolve({
        chargeId,
        status: 'pending',
        authorizeUri: `https://pay.omise.co/3ds/mock/${chargeId}`,
        rawResponse: {
          id: chargeId,
          amount: request.amountSatang,
          currency: 'THB',
          status: 'pending',
          authorize_uri: `https://pay.omise.co/3ds/mock/${chargeId}`,
        },
      });
    }

    // Frictionless — succeeds synchronously
    return Promise.resolve({
      chargeId,
      status: 'successful',
      rawResponse: {
        id: chargeId,
        amount: request.amountSatang,
        currency: 'THB',
        status: 'successful',
        paid_at: new Date().toISOString(),
      },
    });
  }

  private mockVerifySignature(_rawBody: Buffer, signatureHeader: string): boolean {
    // In mock mode, accept "mock_signature" or any non-empty signature
    return signatureHeader.length > 0;
  }

  private generateMockQrDataUrl(amountSatang: number, orderNumber: string): string {
    // Generate a simple placeholder QR code image as base64
    // In production, Omise returns a real PromptPay QR PNG
    const text = `PromptPay ฿${(amountSatang / 100).toFixed(2)} (${orderNumber})`;

    // Create a minimal 1x1 PNG as placeholder (real QR would be 220x220)
    // For demo purposes, use an SVG converted to data URI
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
      <rect width="220" height="220" fill="white"/>
      <rect x="10" y="10" width="60" height="60" fill="black"/>
      <rect x="15" y="15" width="50" height="50" fill="white"/>
      <rect x="20" y="20" width="40" height="40" fill="black"/>
      <rect x="150" y="10" width="60" height="60" fill="black"/>
      <rect x="155" y="15" width="50" height="50" fill="white"/>
      <rect x="160" y="20" width="40" height="40" fill="black"/>
      <rect x="10" y="150" width="60" height="60" fill="black"/>
      <rect x="15" y="155" width="50" height="50" fill="white"/>
      <rect x="20" y="160" width="40" height="40" fill="black"/>
      <text x="110" y="110" text-anchor="middle" font-size="10" fill="black">${text}</text>
    </svg>`;

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }
}
