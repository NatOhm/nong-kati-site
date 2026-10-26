/**
 * Order velocity caps (01-prd.md FR-144, FR-145) — audit finding 1 (2026-10-26).
 *
 * The `_order_velocity_email` (20/24h) and `_order_velocity_ip` (30/24h) rules
 * lived in RATE_LIMIT_RULES with no caller, so anonymous checkout had only the
 * middleware's 10/min burst bucket. POST /api/v1/orders now enforces both.
 *
 * The real in-memory limiter is used (rateLimit is NOT mocked here) so the
 * rule-name lookup, the bucket counters and the 429 response shape are all
 * exercised for real. The heavy business dependencies of the route are mocked.
 */
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from '@/app/api/v1/orders/route';

vi.mock('@/api/orders', () => ({
  createOrder: vi.fn(async (input: { items?: unknown[] }) => {
    // A request with no items fails validation exactly like a real
    // malformed body — no order row, HTTP 400 from orderErrorStatus.
    if (!input.items?.length) throw new Error('INVALID_ITEMS');
    return { order: { id: 'ord-vel' } };
  }),
  orderErrorStatus: () => 400,
}));
vi.mock('@/api/customerAuth', () => ({
  getCustomerFromToken: vi.fn(async () => null),
}));
vi.mock('@/lib/data', () => ({
  getManualTransferInfo: vi.fn(async () => ({
    enabled: true,
    accountName: 'Shop',
    accountNumber: '1234567890',
  })),
}));
vi.mock('@/lib/paymentChannels', () => ({
  resolvePaymentChannels: vi.fn(async () => ['manual']),
  hasUsableChannel: vi.fn(() => true),
}));
vi.mock('@/lib/payment/omise', () => ({
  isOpnConfigured: vi.fn(async () => false),
}));
vi.mock('@/lib/db', () => ({ prisma: {} }));

/** Unique suffix per run so the shared in-memory store never collides. */
const RUN = Date.now().toString(36);

function orderReq(body: Record<string, unknown>, ip: string): NextRequest {
  return new NextRequest('http://localhost/api/v1/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

/** A well-formed order body for the given email (mock rejects empty items). */
const goodReq = (email: string, ip: string): NextRequest =>
  orderReq({ email, items: [{ variantId: 'v1', quantity: 1 }] }, ip);

describe('order velocity caps (FR-144 / FR-145)', () => {
  it('blocks the 21st order from the same email in a day (20/24h)', async () => {
    const email = `vel-email-${RUN}@example.test`;

    for (let i = 1; i <= 20; i++) {
      const res = await POST(goodReq(email, `203.0.113.${i}`));
      expect(res.status).toBe(201);
    }

    const blocked = await POST(goodReq(email, '203.0.113.99'));
    expect(blocked.status).toBe(429);
    const payload = await blocked.json();
    expect(payload.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('treats case variants of one email as the same bucket', async () => {
    const email = `vel-case-${RUN}@example.test`;

    for (let i = 1; i <= 20; i++) {
      const res = await POST(goodReq(email, `203.0.114.${i}`));
      expect(res.status).toBe(201);
    }

    // Same address, different case, fresh IP → still blocked.
    const blocked = await POST(
      orderReq(
        { email: email.toUpperCase(), items: [{ variantId: 'v1', quantity: 1 }] },
        '203.0.114.99',
      ),
    );
    expect(blocked.status).toBe(429);
  });

  it('blocks the 31st order from the same IP in a day (30/24h)', async () => {
    for (let i = 1; i <= 30; i++) {
      const res = await POST(
        goodReq(`vel-ip-${RUN}-${i}@example.test`, '198.51.100.7'),
      );
      expect(res.status).toBe(201);
    }

    const blocked = await POST(
      goodReq(`vel-ip-${RUN}-31@example.test`, '198.51.100.7'),
    );
    expect(blocked.status).toBe(429);
    const payload = await blocked.json();
    expect(payload.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('leaves a normal checkout flow unaffected', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await POST(goodReq(`vel-ok-${RUN}-${i}@example.test`, `198.51.100.${50 + i}`));
      expect(res.status).toBe(201);
    }
  });

  it('failed attempts never burn the email cap (body-keyed bucket)', async () => {
    // SECURITY (2026-10-26 review): the email bucket key comes from the
    // REQUEST BODY, so anyone can aim it at a victim. If attempts counted,
    // 21 malformed POSTs with the victim's email would lock them out of
    // checkout for 24h without creating a single order. The cap must count
    // ORDERS, not attempts: pre-check reads, the increment happens only
    // after createOrder succeeds.
    const email = `vel-poison-${RUN}@example.test`;

    // 20 failed attempts (createOrder throws → 400): none may count.
    for (let i = 1; i <= 20; i++) {
      const res = await POST(orderReq({ email, items: [] }, `203.0.116.${i}`));
      expect(res.status).toBe(400);
    }

    // The same email can still place all 20 real orders it is entitled to.
    for (let i = 1; i <= 20; i++) {
      const res = await POST(goodReq(email, `203.0.117.${i}`));
      expect(res.status).toBe(201);
    }

    // …and only then is the 20/24h cap reached.
    const blocked = await POST(goodReq(email, '203.0.118.1'));
    expect(blocked.status).toBe(429);
  });
});
