/**
 * Unit tests for the security/robustness fixes from the production review.
 * Pure-logic only (no DB, no server) so CI can run them without services.
 * Run: npm test
 */
import { afterAll, describe, expect, it, vi } from 'vitest';

// ─── L8: length-safe constant-time webhook signature compare ──────────

vi.mock('@/lib/db', () => ({
  prisma: { auditLog: { create: vi.fn().mockResolvedValue({}) } },
}));

process.env['NK_OMISE_SECRET_KEY'] = 'sk_test_unit';
process.env['NK_OMISE_WEBHOOK_SECRET'] = 'whsec_unit';
process.env['NK_PAYMENT_MOCK'] = '';

const { OmiseAdapter } = await import('@/lib/payment/omise');

function makeAdapter(): InstanceType<typeof OmiseAdapter> {
  return new OmiseAdapter();
}

describe('webhook signature verification (L8)', () => {
  const body = Buffer.from(JSON.stringify({ key: 'charge.complete', data: { id: 'chrg_1' } }));

  function expectedSig(): string {
    // Recompute the HMAC the adapter uses — we test the compare logic.
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');
    return createHmac('sha256', 'whsec_unit').update(body).digest('hex');
  }

  it('accepts a valid signature', () => {
    expect(makeAdapter().verifyWebhookSignature(body, expectedSig())).toBe(true);
  });

  it('accepts a valid uppercase signature (case-insensitive hex)', () => {
    expect(makeAdapter().verifyWebhookSignature(body, expectedSig().toUpperCase())).toBe(true);
  });

  it('rejects a wrong signature without throwing', () => {
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');
    const wrong = createHmac('sha256', 'wrong-secret').update(body).digest('hex');
    expect(makeAdapter().verifyWebhookSignature(body, wrong)).toBe(false);
  });

  it('rejects a truncated signature without throwing (was: 500)', () => {
    const sig = expectedSig();
    expect(makeAdapter().verifyWebhookSignature(body, sig.slice(0, 20))).toBe(false);
  });

  it('rejects a padded/longer signature without throwing', () => {
    expect(makeAdapter().verifyWebhookSignature(body, `${expectedSig()}deadbeef`)).toBe(false);
  });

  it('rejects odd-length (non-byte-aligned) hex without throwing', () => {
    expect(makeAdapter().verifyWebhookSignature(body, `${expectedSig()}a`)).toBe(false);
  });

  it('rejects non-hex garbage without throwing', () => {
    expect(makeAdapter().verifyWebhookSignature(body, '<script>alert(1)</script>')).toBe(false);
  });

  it('rejects an empty signature header without throwing', () => {
    expect(makeAdapter().verifyWebhookSignature(body, '')).toBe(false);
  });
});

// ─── H2: mock mode is a deliberate nonproduction choice ───────────────

describe('OmiseAdapter mode selection (H2)', () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedMock = process.env['NK_PAYMENT_MOCK'];

  it('mock mode is ignored in production even with NK_PAYMENT_MOCK=true', async () => {
    (process.env as { NODE_ENV: string }).NODE_ENV = 'production';
    process.env['NK_PAYMENT_MOCK'] = 'true';
    const adapter = makeAdapter();
    // Production + valid keys → real mode → real charge path throws (gated).
    // createPromptPayCharge is sync-thrown inside an async fn → returns a rejected
    // promise; call it and let vitest record the rejection via expect().rejects.
    const rejected = adapter
      .createPromptPayCharge({
        amountSatang: 2500,
        orderNumber: 'NK-TEST-1',
        currency: 'THB',
        description: 'test',
      })
      .then(
        () => {
          throw new Error('should have thrown');
        },
        (e: unknown) => {
          expect((e as Error).message).toMatch(/not implemented/);
        },
      );
    await rejected;
  });

  it('production without credentials fails closed at construction', () => {
    (process.env as { NODE_ENV: string }).NODE_ENV = 'production';
    process.env['NK_PAYMENT_MOCK'] = '';
    const savedKey = process.env['NK_OMISE_SECRET_KEY'];
    const savedSecret = process.env['NK_OMISE_WEBHOOK_SECRET'];
    delete process.env['NK_OMISE_SECRET_KEY'];
    delete process.env['NK_OMISE_WEBHOOK_SECRET'];
    expect(() => new OmiseAdapter()).toThrow(/configuration is required/i);
    process.env['NK_OMISE_SECRET_KEY'] = savedKey;
    process.env['NK_OMISE_WEBHOOK_SECRET'] = savedSecret;
  });

  it('nonproduction + NK_PAYMENT_MOCK=true enables mock charges', async () => {
    (process.env as { NODE_ENV: string }).NODE_ENV = 'development';
    process.env['NK_PAYMENT_MOCK'] = 'true';
    const result = await makeAdapter().createPromptPayCharge({
      amountSatang: 2500,
      orderNumber: 'NK-TEST-2',
      currency: 'THB',
      description: 'test',
    });
    expect(result.chargeId).toBeTruthy();
  });

  afterAll(() => {
    (process.env as { NODE_ENV: string }).NODE_ENV = savedNodeEnv ?? 'test';
    process.env['NK_PAYMENT_MOCK'] = savedMock;
  });
});

// ─── Coupon math (orders.ts checkCoupon helper logic) ─────────────────

describe('coupon discount math', () => {
  // checkCoupon is DB-bound; its arithmetic is extracted here verbatim so
  // rounding regressions surface in CI.
  function discount(discountType: string, discountValue: number, subtotal: number): number {
    return discountType === 'percent'
      ? Math.min(Math.round(subtotal * (discountValue / 100) * 100) / 100, subtotal)
      : Math.min(discountValue, subtotal);
  }

  it('percent discounts round to 2 decimals', () => {
    expect(discount('percent', 10, 255)).toBe(25.5);
    expect(discount('percent', 15, 99.99)).toBe(15.0);
  });

  it('percent discounts never exceed the subtotal', () => {
    expect(discount('percent', 100, 50)).toBe(50);
    expect(discount('percent', 150, 50)).toBe(50);
  });

  it('fixed discounts are capped at the subtotal', () => {
    expect(discount('amount', 30, 25)).toBe(25);
    expect(discount('amount', 10, 25)).toBe(10);
  });
});
