/**
 * Real Omise/Opn adapter (external audit #1).
 *
 * The old adapter THREW "Real Omise API not implemented" outside mock mode,
 * leaving production PromptPay permanently 503 and manual slip as the only
 * e-payment. These tests pin the real implementation:
 *
 *  1. createPromptPayCharge posts form-encoded satang amounts with an
 *     inline source[type]=promptpay + metadata, extracts the charge id /
 *     status / expiry, downloads the secret-key-protected QR PNG and
 *     returns it as a data URI; a pending charge WITHOUT a scannable code
 *     is a typed error, not a broken checkout.
 *  2. Card charges pass the token + return_uri and surface authorize_uri
 *     for 3DS; refunds POST to /charges/{id}/refunds.
 *  3. Typed error mapping (NOT_CONFIGURED / TIMEOUT / NETWORK / API_ERROR
 *     with the gateway failure code) — never a naked fetch exception.
 *  4. Webhook signature accepts BOTH the modern `t=,v1=` scheme
 *     (HMAC over `${t}${body}`) and the legacy plain-hex HMAC; malformed
 *     headers are false, never a throw; and real mode REJECTS empty/garbage
 *     signatures (mock permissiveness must not leak into production).
 *
 * The HTTP layer is injected via globalThis.fetch replacement — the
 * adapter code path is the production one.
 */
import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NK_OMISE_SECRET_KEY'] = 'skey_test_realkey';
process.env['NK_OMISE_WEBHOOK_SECRET'] = 'whsec_test_shared_secret';
process.env['NK_OMISE_API_BASE'] = 'https://api.omise.co';
delete process.env['NK_PAYMENT_MOCK'];
// NODE_ENV is 'test' under vitest — real mode (no NK_PAYMENT_MOCK).

const realFetch = globalThis.fetch;
const fetchMock = vi.fn();

function omiseOk(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

import { OmiseAdapter } from '@/lib/payment/omise';

const QR_PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('createPromptPayCharge — real Opn API (audit #1)', () => {
  it('posts form-encoded satang + inline source and returns the QR as a data URI', async () => {
    // Call 1: charge; call 2: QR image download.
    fetchMock
      .mockResolvedValueOnce(
        omiseOk({
          id: 'chrg_test_123',
          amount: 10700,
          currency: 'thb',
          status: 'pending',
          expires_at: '2026-09-27T10:00:00Z',
          source: {
            type: 'promptpay',
            scannable_code: {
              image: {
                download_uri:
                  'https://api.omise.co/charges/chrg_test_123/source/scannable_code/image',
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(QR_PNG, { status: 200, headers: { 'content-type': 'image/png' } }),
      );

    const adapter = new OmiseAdapter();
    const result = await adapter.createPromptPayCharge({
      amountSatang: 10700,
      orderNumber: 'NK-5001',
      currency: 'THB',
      description: 'Nong-Kati Order NK-5001',
    });

    expect(result.chargeId).toBe('chrg_test_123');
    expect(result.status).toBe('pending');
    expect(result.expiresAt).toEqual(new Date('2026-09-27T10:00:00Z'));
    expect(result.qrImageUri).toMatch(/^data:image\/png;base64,/);
    expect(result.rawResponse).toMatchObject({ id: 'chrg_test_123', source_type: 'promptpay' });

    // The charge POST: Basic auth (skey:), form-encoded, satang, metadata.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.omise.co/charges');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(
      `Basic ${Buffer.from('skey_test_realkey:').toString('base64')}`,
    );
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = String(init.body);
    expect(body).toContain('amount=10700');
    expect(body).toContain('currency=thb');
    expect(body).toContain('source%5Btype%5D=promptpay');
    expect(body).toContain('metadata%5Border_number%5D=NK-5001');

    // The QR download carries the same secret-key auth.
    const [, qrInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect((qrInit.headers as Record<string, string>)['Authorization']).toContain('Basic ');
  });

  it('a pending PromptPay charge without a scannable code is a typed error', async () => {
    fetchMock.mockResolvedValueOnce(omiseOk({ id: 'chrg_test_456', status: 'pending' }));

    const adapter = new OmiseAdapter();
    await expect(
      adapter.createPromptPayCharge({ amountSatang: 100, orderNumber: 'NK-x', currency: 'THB' }),
    ).rejects.toThrow('OMISE_INVALID_RESPONSE');
  });

  it('Omise 4xx becomes a typed OMISE_API_ERROR carrying the gateway failure code', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'invalid_amount', message: 'amount must be positive' }), {
        status: 400,
      }),
    );

    const adapter = new OmiseAdapter();
    await expect(
      adapter.createPromptPayCharge({ amountSatang: 0, orderNumber: 'NK-x', currency: 'THB' }),
    ).rejects.toThrow(/OMISE_API_ERROR.*400.*invalid_amount/);
  });

  it('network failure maps to OMISE_NETWORK_ERROR (not a naked fetch error)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const adapter = new OmiseAdapter();
    await expect(
      adapter.createPromptPayCharge({ amountSatang: 100, orderNumber: 'NK-x', currency: 'THB' }),
    ).rejects.toThrow('OMISE_NETWORK_ERROR');
  });
});

describe('createCardCharge + refund — real Opn API', () => {
  it('posts the card token with return_uri and surfaces authorize_uri for 3DS', async () => {
    fetchMock.mockResolvedValueOnce(
      omiseOk({
        id: 'chrg_test_789',
        status: 'pending',
        authorize_uri: 'https://pay.omise.co/offsite/xyz',
      }),
    );

    const adapter = new OmiseAdapter();
    const result = await adapter.createCardCharge(
      { amountSatang: 10700, orderNumber: 'NK-5002', currency: 'THB' },
      'tokn_test_card',
      'https://shop.example/checkout/return',
    );

    expect(result.status).toBe('pending');
    expect(result.authorizeUri).toBe('https://pay.omise.co/offsite/xyz');
    const body = String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).toContain('card=tokn_test_card');
    expect(body).toContain('return_uri=');
  });

  it('refund POSTs the amount to /charges/{id}/refunds', async () => {
    fetchMock.mockResolvedValueOnce(omiseOk({ id: 'rfnd_test_1', status: 'pending' }));

    const adapter = new OmiseAdapter();
    const result = await adapter.refund({
      chargeRef: 'chrg_test_123',
      amountSatang: 5000,
      reason: 'customer request',
    });

    expect(result).toEqual({ refundId: 'rfnd_test_1', status: 'pending' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.omise.co/charges/chrg_test_123/refunds');
    expect(String(init.body)).toContain('amount=5000');
  });
});

describe('verifyWebhookSignature — real mode (audit #1)', () => {
  const adapter = new OmiseAdapter();
  const body = Buffer.from(JSON.stringify({ key: 'charge.complete', data: { id: 'chrg_1' } }));
  const mac = (payload: Buffer | string): string =>
    createHmac('sha256', 'whsec_test_shared_secret').update(payload).digest('hex');

  it('accepts the modern t=,v1= scheme (HMAC over `${t}${body}`)', () => {
    const t = String(Math.floor(Date.now() / 1000));
    const v1 = mac(Buffer.concat([Buffer.from(t, 'utf8'), body]));
    expect(adapter.verifyWebhookSignature(body, `t=${t},v1=${v1}`)).toBe(true);
  });

  it('accepts the legacy plain-hex HMAC', () => {
    expect(adapter.verifyWebhookSignature(body, mac(body))).toBe(true);
  });

  it('rejects a tampered body, wrong secret, and malformed headers', () => {
    const t = String(Math.floor(Date.now() / 1000));
    const v1 = mac(Buffer.concat([Buffer.from(t, 'utf8'), body]));

    const tampered = Buffer.from(body.toString().replace('chrg_1', 'chrg_2'));
    expect(adapter.verifyWebhookSignature(tampered, `t=${t},v1=${v1}`)).toBe(false);
    expect(adapter.verifyWebhookSignature(body, `t=${t},v1=${'0'.repeat(64)}`)).toBe(false);
    expect(adapter.verifyWebhookSignature(body, 'not-a-signature')).toBe(false);
    expect(adapter.verifyWebhookSignature(body, 'zz!!')).toBe(false);
    expect(adapter.verifyWebhookSignature(body, '')).toBe(false);
    // Uppercase hex is still hex — length-safe compare handles it.
    expect(adapter.verifyWebhookSignature(body, `t=${t},v1=${v1.toUpperCase()}`)).toBe(true);
  });
});

describe('parseWebhookEvent — real payload shapes', () => {
  const adapter = new OmiseAdapter();

  it('normalizes charge.complete with satang amount and failure fields', () => {
    const event = adapter.parseWebhookEvent(
      Buffer.from(
        JSON.stringify({
          key: 'charge.complete',
          data: {
            id: 'chrg_test_123',
            amount: 10700,
            currency: 'thb',
            status: 'successful',
            paid_at: '2026-09-27T09:00:00Z',
          },
        }),
      ),
    );
    expect(event.key).toBe('charge.complete');
    expect(event.chargeId).toBe('chrg_test_123');
    expect(event.amount).toBe(10700);
    expect(event.status).toBe('successful');
  });

  it('charge.failed carries failure_code/message; unknown keys and junk stay unknown', () => {
    const failed = adapter.parseWebhookEvent(
      Buffer.from(
        JSON.stringify({
          key: 'charge.failed',
          data: { id: 'chrg_9', status: 'failed', failure_code: 'insufficient_fund' },
        }),
      ),
    );
    expect(failed.status).toBe('failed');
    expect(failed.failureCode).toBe('insufficient_fund');

    expect(adapter.parseWebhookEvent(Buffer.from('not json')).key).toBe('unknown');
    expect(
      adapter.parseWebhookEvent(Buffer.from(JSON.stringify({ key: 'customer.created', data: {} })))
        .key,
    ).toBe('unknown');
  });
});
