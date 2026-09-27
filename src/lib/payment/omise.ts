/**
 * OmiseAdapter — real Omise/Opn Payments integration (external audit #1).
 * 09-payment.md §1, §2 — Gateway adapter pattern.
 *
 * Real API (implemented in this revision):
 *   POST {base}/charges  — PromptPay charge with an inline
 *     `source[type]=promptpay` (amount in SATANG, form-encoded). The pending
 *     charge carries `source.scannable_code.image.download_uri` (a PNG QR);
 *     that image sits behind secret-key auth, so the adapter downloads it
 *     server-side and hands the checkout a data URI (see createPromptPayCharge).
 *   POST {base}/charges  — card charge with `card=token` + `return_uri`;
 *     a pending charge with `authorize_uri` means 3DS is required.
 *   POST {base}/charges/{id}/refunds — refund.
 *
 * Auth: HTTP Basic with the SECRET key as username (`skey_xxx:`), server-only.
 * Amounts: SATANG everywhere (THB × 100) — per LD-11 server-authoritative.
 * Webhooks: Omise signs with HMAC-SHA256; modern endpoints send
 *   `Omise-Signature: t=<unix>,v1=<hex>` where v1 = HMAC(`${t}${rawBody}`),
 *   and older ones a plain HMAC hex over the raw body. Both are accepted;
 *   malformed headers are a clean `false`, never a throw (review L8).
 *
 * Env vars:
 *   NK_OMISE_PUBLIC_KEY     (client-side, safe to expose)
 *   NK_OMISE_SECRET_KEY     (server-only; skey_test_/skey_live_)
 *   NK_OMISE_WEBHOOK_SECRET (HMAC shared secret for webhook signatures)
 *   NK_OMISE_API_BASE       (optional override; default https://api.omise.co)
 *
 * Mock mode: NODE_ENV !== 'production' && NK_PAYMENT_MOCK === 'true' — a
 * deliberate nonproduction choice (review #1). Production without real
 * credentials fails closed at construction; a fabricated webhook can never
 * reach fulfilment.
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

const DEFAULT_API_BASE = 'https://api.omise.co';
const REQUEST_TIMEOUT_MS = 15_000;
/** PromptPay QR PNG is fetched server-side (secret-key protected). */
const QR_DOWNLOAD_TIMEOUT_MS = 10_000;

/**
 * Cheap capability probe for order-creation gating (production review
 * HIGH-3): true when a usable payment channel exists — mock mode (deliberate
 * nonproduction choice) or real Opn credentials. Must NOT construct the
 * adapter (its constructor throws without credentials); this only reads env.
 */
export function isOpnConfigured(): boolean {
  if (process.env.NODE_ENV !== 'production' && process.env['NK_PAYMENT_MOCK'] === 'true') {
    return true;
  }
  return Boolean(process.env['NK_OMISE_SECRET_KEY'] && process.env['NK_OMISE_WEBHOOK_SECRET']);
}

export class OmiseAdapter implements PaymentGateway {
  private secretKey: string;
  private webhookSecret: string;
  private isMock: boolean;
  private apiBase: string;

  constructor() {
    this.secretKey = process.env['NK_OMISE_SECRET_KEY'] ?? '';
    this.webhookSecret = process.env['NK_OMISE_WEBHOOK_SECRET'] ?? '';
    this.apiBase = (process.env['NK_OMISE_API_BASE'] ?? DEFAULT_API_BASE).replace(/\/+$/, '');
    // Review #1: mocks must be a deliberate nonproduction choice, never a
    // silent fallback. Production with missing credentials is a hard error
    // (fail closed) — a fabricated webhook must never reach real fulfilment.
    this.isMock =
      process.env.NODE_ENV !== 'production' && process.env['NK_PAYMENT_MOCK'] === 'true';
    if (!this.isMock && (!this.secretKey || !this.webhookSecret)) {
      throw new Error(
        'Payment configuration is required (NK_OMISE_SECRET_KEY + NK_OMISE_WEBHOOK_SECRET)',
      );
    }
  }

  // ─── Public API ──────────────────────────────────────────

  async createPromptPayCharge(request: ChargeRequest): Promise<ChargeResult> {
    if (this.isMock) {
      return this.mockPromptPayCharge(request);
    }

    // One POST creates the source AND the charge (inline source[type]).
    // Form-encoded — Omise does not accept JSON for nested source params.
    const body = new URLSearchParams({
      amount: String(request.amountSatang),
      currency: (request.currency || 'THB').toLowerCase(),
      description: request.description ?? `Nong-Kati Order ${request.orderNumber}`,
      'source[type]': 'promptpay',
      'source[amount]': String(request.amountSatang),
      'metadata[order_number]': request.orderNumber,
    });

    const charge = await this.request<Record<string, unknown>>('/charges', body);

    const chargeId = String(charge['id'] ?? '');
    if (!chargeId) {
      throw new Error('OMISE_INVALID_RESPONSE: charge response missing id');
    }
    const status = normalizeChargeStatus(charge['status']);
    const expiresAt = parseOmiseDate(charge['expires_at']);

    const source = (charge['source'] ?? {}) as Record<string, unknown>;
    const scannable = (source['scannable_code'] ?? {}) as Record<string, unknown>;
    const image = (scannable['image'] ?? {}) as Record<string, unknown>;
    const downloadUri = typeof image['download_uri'] === 'string' ? image['download_uri'] : '';

    // The QR PNG is behind secret-key auth — fetch it here and hand the
    // browser a data URI it can render directly. Failure = typed error (the
    // pending charge self-expires at the gateway; nothing to clean up).
    let qrImageUri: string | undefined;
    if (downloadUri) {
      qrImageUri = await this.downloadImageAsDataUrl(downloadUri);
    } else if (status === 'pending') {
      throw new Error('OMISE_INVALID_RESPONSE: pending PromptPay charge without scannable_code');
    }

    return {
      chargeId,
      status,
      ...(qrImageUri ? { qrImageUri } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      rawResponse: sanitizeCharge(charge),
    };
  }

  async createCardCharge(
    request: ChargeRequest,
    token: string,
    returnUrl: string,
  ): Promise<ChargeResult> {
    if (this.isMock) {
      return this.mockCardCharge(request, token, returnUrl);
    }

    const body = new URLSearchParams({
      amount: String(request.amountSatang),
      currency: (request.currency || 'THB').toLowerCase(),
      description: request.description ?? `Nong-Kati Order ${request.orderNumber}`,
      card: token,
      return_uri: returnUrl,
      'metadata[order_number]': request.orderNumber,
    });

    const charge = await this.request<Record<string, unknown>>('/charges', body);

    const chargeId = String(charge['id'] ?? '');
    if (!chargeId) {
      throw new Error('OMISE_INVALID_RESPONSE: charge response missing id');
    }
    const status = normalizeChargeStatus(charge['status']);
    const authorizeUri =
      typeof charge['authorize_uri'] === 'string' ? charge['authorize_uri'] : undefined;

    return {
      chargeId,
      status,
      ...(status === 'pending' && authorizeUri ? { authorizeUri } : {}),
      ...(parseOmiseDate(charge['expires_at'])
        ? { expiresAt: parseOmiseDate(charge['expires_at'])! }
        : {}),
      rawResponse: sanitizeCharge(charge),
    };
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean {
    if (this.isMock) {
      return this.mockVerifySignature(rawBody, signatureHeader);
    }
    if (!this.webhookSecret || !signatureHeader) return false;

    const header = signatureHeader.trim();

    // Modern format: `t=<unix>,v1=<hex>` — HMAC over `${t}${rawBody}`.
    const modern = /^t=(\d+),v1=([0-9a-fA-F]+)$/.exec(header);
    if (modern) {
      const expected = createHmac('sha256', this.webhookSecret)
        .update(Buffer.concat([Buffer.from(modern[1]!, 'utf8'), rawBody]))
        .digest('hex');
      return safeHexEqual(expected, modern[2]!);
    }

    // Legacy format: a plain HMAC hex over the raw body.
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return safeHexEqual(expected, header);
  }

  parseWebhookEvent(rawBody: Buffer): WebhookEvent {
    try {
      const data = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      // Omise webhook structure: { key: "charge.complete", data: { ... } }
      const key = String(data['key'] ?? 'unknown');
      const charge = (data['data'] ?? {}) as Record<string, unknown>;

      const rawStatus = String(charge['status'] ?? '');
      return {
        key: (['charge.complete', 'charge.failed', 'charge.expired'].includes(key)
          ? key
          : 'unknown') as WebhookEvent['key'],
        chargeId: String(charge['id'] ?? ''),
        amount: Number(charge['amount'] ?? 0),
        status:
          rawStatus === 'successful'
            ? 'successful'
            : rawStatus === 'failed'
              ? 'failed'
              : rawStatus === 'expired'
                ? 'expired'
                : 'failed',
        failureMessage:
          typeof charge['failure_message'] === 'string' ? charge['failure_message'] : undefined,
        failureCode:
          typeof charge['failure_code'] === 'string' ? charge['failure_code'] : undefined,
        rawData: {
          id: charge['id'],
          amount: charge['amount'],
          currency: charge['currency'],
          status: charge['status'],
          paid_at: charge['paid_at'],
          failure_message: charge['failure_message'],
          failure_code: charge['failure_code'],
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

    const body = new URLSearchParams({
      amount: String(request.amountSatang),
    });
    const refund = await this.request<Record<string, unknown>>(
      `/charges/${encodeURIComponent(request.chargeRef)}/refunds`,
      body,
    );

    const refundId = String(refund['id'] ?? '');
    if (!refundId) {
      throw new Error('OMISE_INVALID_RESPONSE: refund response missing id');
    }
    const status = normalizeChargeStatus(refund['status']);
    return { refundId, status: status === 'failed' ? 'failed' : status };
  }

  /**
   * Independent charge verification (production review HIGH-6): retrieve the
   * charge by ID through the authenticated Opn API so a webhook event is
   * never trusted on its payload alone — amount, currency, livemode and
   * metadata are read back from the source of truth. GET (no body).
   */
  async retrieveCharge(chargeId: string): Promise<Record<string, unknown>> {
    if (!this.secretKey) {
      throw new Error('OMISE_NOT_CONFIGURED: NK_OMISE_SECRET_KEY is not set');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.apiBase}/charges/${encodeURIComponent(chargeId)}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
        },
        signal: controller.signal,
      });
      const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const code = typeof parsed['code'] === 'string' ? parsed['code'] : 'unknown';
        throw new Error(`OMISE_API_ERROR: charge lookup ${res.status} ${code}`);
      }
      return parsed;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('OMISE_TIMEOUT: charge lookup did not respond in time');
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── Real API plumbing ───────────────────────────────────

  /**
   * One authenticated POST to the Omise API (form-encoded). Throws typed
   * errors: OMISE_NOT_CONFIGURED / OMISE_TIMEOUT / OMISE_NETWORK_ERROR /
   * OMISE_API_ERROR (with the gateway failure_code when present).
   */
  private async request<T extends Record<string, unknown>>(
    path: string,
    form: URLSearchParams,
  ): Promise<T> {
    if (!this.secretKey) {
      throw new Error('OMISE_NOT_CONFIGURED: NK_OMISE_SECRET_KEY is not set');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${this.apiBase}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('OMISE_TIMEOUT: Omise API did not respond in time');
      }
      throw new Error(`OMISE_NETWORK_ERROR: ${err instanceof Error ? err.message : 'unknown'}`);
    }
    clearTimeout(timeout);

    const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const code = typeof parsed['code'] === 'string' ? parsed['code'] : 'unknown';
      const message = typeof parsed['message'] === 'string' ? parsed['message'] : '';
      throw new Error(`OMISE_API_ERROR: Omise ${res.status} ${code} ${message}`.trimEnd());
    }
    return parsed as T;
  }

  /** Download the PromptPay QR PNG (secret-key protected) into a data URI. */
  private async downloadImageAsDataUrl(uri: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), QR_DOWNLOAD_TIMEOUT_MS);
    try {
      const res = await fetch(uri, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`OMISE_API_ERROR: QR image download ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get('content-type') ?? 'image/png';
      return `data:${mime.split(';')[0]};base64,${buf.toString('base64')}`;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('OMISE_TIMEOUT: QR image download did not respond in time');
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── Mock implementations (staging only) ─────────────────

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

// ─── Helpers ──────────────────────────────────────────────

function normalizeChargeStatus(raw: unknown): 'pending' | 'successful' | 'failed' {
  const s = String(raw ?? '');
  if (s === 'successful' || s === 'pending' || s === 'failed') {
    return s;
  }
  return 'pending';
}

function parseOmiseDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Length-safe constant-time hex comparison (review L8 — malformed = false). */
function safeHexEqual(expectedHex: string, actualHex: string): boolean {
  const header = actualHex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(header) || header.length !== expectedHex.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(header, 'hex'));
}

/** Keep the sanitized fields we persist on PaymentAttempt.gatewayResponse. */
function sanitizeCharge(charge: Record<string, unknown>): Record<string, unknown> {
  const source = (charge['source'] ?? {}) as Record<string, unknown>;
  return {
    id: charge['id'],
    amount: charge['amount'],
    currency: charge['currency'],
    status: charge['status'],
    source_type: source['type'],
    expires_at: charge['expires_at'],
    authorize_uri:
      typeof charge['authorize_uri'] === 'string' ? charge['authorize_uri'] : undefined,
    paid_at: charge['paid_at'],
    failure_message: charge['failure_message'],
    failure_code: charge['failure_code'],
  };
}
