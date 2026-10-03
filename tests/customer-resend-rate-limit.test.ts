/**
 * Customer resend-email rate limit (2026-10-03).
 *
 * `resendOrderEmail` carried a doc comment promising "3 resends per order per
 * hour" and enforced nothing — the body went straight from the order lookup
 * to the provider. Mounted as-is it would have been an unbounded email-send
 * endpoint, and worse, an amplification one: anyone who knew an order ID
 * could keep a customer's address being mailed on demand.
 *
 * The property that matters most here is ORDER OF OPERATIONS, not the number.
 * A per-order quota checked BEFORE the email-match verification is a weapon:
 * an attacker who guesses an orderId exhausts the real owner's three sends
 * and the genuine customer is then locked out. So the limit must consume
 * quota only after the caller has proved they own the address. That is
 * asserted here by driving the wrong email repeatedly and showing the counter
 * is never touched.
 *
 * Uses the real Redis/in-memory limiter from lib/rateLimit rather than a
 * hand-rolled counter, so what is tested is the same code path the route
 * would use.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ordersMock, resendMock, templateMock } = vi.hoisted(() => {
  const ordersMock = { getOrderById: vi.fn(), getOrderByNumber: vi.fn() };
  const resendMock = { sendEmailWithRetry: vi.fn(async () => ({ success: true })) };
  const templateMock = {
    orderConfirmationTemplate: vi.fn(() => ({ subject: 's', html: '<p>h</p>' })),
  };
  return { ordersMock, resendMock, templateMock };
});

vi.mock('@/api/orders', () => ordersMock);
vi.mock('@/lib/email/resend', () => resendMock);
vi.mock('@/lib/email/templates', () => templateMock);

const order = {
  id: 'ord-1',
  orderNumber: 'NK-7001',
  customerEmail: 'buyer@example.test',
  confirmationUuid: 'uuid-1',
  subtotalThb: '100.00',
  vatAmountThb: '7.00',
  totalAmountThb: '107.00',
  items: [],
};

beforeEach(async () => {
  vi.clearAllMocks();
  // Unique order id per test so the shared sliding-window store cannot leak
  // counts between cases.
  ordersMock.getOrderById.mockImplementation(async (id: string) => ({ ...order, id }));
  resendMock.sendEmailWithRetry.mockResolvedValue({ success: true });
});

describe('resendOrderEmail — 3 per order per hour', () => {
  it('allows three sends and blocks the fourth', async () => {
    const { resendOrderEmail } = await import('@/api/orderLookup');
    const id = `ord-limit-${Date.now().toString(36)}`;

    for (let i = 0; i < 3; i++) {
      const res = await resendOrderEmail(id, 'buyer@example.test');
      expect(res.success, `send ${i + 1} should be allowed`).toBe(true);
    }

    const blocked = await resendOrderEmail(id, 'buyer@example.test');
    expect(blocked.success).toBe(false);
    expect(blocked.error).toBe('RATE_LIMITED');

    // The fourth never reached the provider.
    expect(resendMock.sendEmailWithRetry).toHaveBeenCalledTimes(3);
  });

  it('returns a retry hint in SECONDS so the route can answer 429 honestly', async () => {
    const { resendOrderEmail } = await import('@/api/orderLookup');
    const id = `ord-retry-${Date.now().toString(36)}`;
    for (let i = 0; i < 4; i++) await resendOrderEmail(id, 'buyer@example.test');
    const blocked = await resendOrderEmail(id, 'buyer@example.test');
    expect(blocked.error).toBe('RATE_LIMITED');
    // Seconds, not the raw epoch-ms resetAt the limiter hands back: a client
    // told to wait 1.7e12 seconds is a client that never tries again.
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(3600);
  });

  it('does not consume quota when the email does not match (no lockout weapon)', async () => {
    const { resendOrderEmail } = await import('@/api/orderLookup');
    const id = `ord-enum-${Date.now().toString(36)}`;

    // An attacker guessing the address must not be able to burn the owner's
    // quota. Many wrong guesses, then the real owner still has all three.
    for (let i = 0; i < 10; i++) {
      const res = await resendOrderEmail(id, 'attacker@evil.test');
      expect(res.success).toBe(false);
      expect(res.error).toBe('NOT_FOUND');
    }
    expect(resendMock.sendEmailWithRetry).not.toHaveBeenCalled();

    for (let i = 0; i < 3; i++) {
      const res = await resendOrderEmail(id, 'buyer@example.test');
      expect(res.success, `owner send ${i + 1} should still work`).toBe(true);
    }
  });

  it('does not consume quota for an unknown order', async () => {
    const { resendOrderEmail } = await import('@/api/orderLookup');
    ordersMock.getOrderById.mockResolvedValue(null);
    const res = await resendOrderEmail('does-not-exist', 'buyer@example.test');
    expect(res.error).toBe('NOT_FOUND');
    expect(resendMock.sendEmailWithRetry).not.toHaveBeenCalled();
  });

  it('counts each order separately', async () => {
    const { resendOrderEmail } = await import('@/api/orderLookup');
    const stamp = Date.now().toString(36);
    const a = await resendOrderEmail(`ord-a-${stamp}`, 'buyer@example.test');
    const b = await resendOrderEmail(`ord-b-${stamp}`, 'buyer@example.test');
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
  });

  it('leaves the admin path unlimited', async () => {
    // The admin route calls the shared sender directly, not resendOrderEmail,
    // so an operator re-sending after a delivery failure is never throttled.
    const { sendOrderConfirmationEmail } = await import('@/api/orderLookup');
    for (let i = 0; i < 6; i++) {
      const res = await sendOrderConfirmationEmail({ ...order } as never);
      expect(res.success).toBe(true);
    }
    expect(resendMock.sendEmailWithRetry).toHaveBeenCalledTimes(6);
  });
});
