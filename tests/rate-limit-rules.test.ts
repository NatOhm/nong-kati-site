/**
 * Rate-limit rule table — checkout reads vs. order creation (2026-10-10).
 *
 * `RATE_LIMIT_RULES` is matched by `findMatchingRule`: exact route first,
 * then the FIRST rule whose route is a prefix of the request path. That
 * makes array order part of the security posture — a broad rule above a
 * specific one silently swallows it.
 *
 * The round-3 checkout page added a pricing-preview POST on every
 * cart/coupon change and fetches the VAT config on mount. All of those hit
 * `/api/v1/orders/*`, which prefix-matched the strict
 * `{ route: '/api/v1/orders', maxRequests: 10, windowMs: 60_000 }` creation
 * rule. The Browser Smoke gate caught the consequence in CI: three earlier
 * tests plus the checkout page's own calls exhausted the shared 10/min
 * bucket, and the REAL `POST /api/v1/orders` answered 429 mid-checkout —
 * a paying customer could not place an order no matter how often they
 * retried within the window.
 *
 * These assertions pin the fix: the read endpoints keep their own generous
 * bucket (60/min, same shape as /cart), the creation rule keeps its strict
 * 10/min, and the specific rules stay ABOVE the generic one in the table so
 * the prefix matcher actually reaches them.
 */
import { describe, expect, it } from 'vitest';

import { getClientIp, RATE_LIMIT_RULES, type RateLimitRule } from '@/lib/rateLimit';

/** Same lookup middleware/lib use: exact route, then first prefix hit. */
function matchingRule(route: string): RateLimitRule | undefined {
  return (
    RATE_LIMIT_RULES.find((r) => r.route === route) ??
    RATE_LIMIT_RULES.find((r) => r.route !== '_' && route.startsWith(r.route))
  );
}

describe('rate-limit rules — checkout reads vs order creation', () => {
  it('orders/preview and orders/vat resolve to their own generous read bucket', () => {
    expect(matchingRule('/api/v1/orders/preview')).toMatchObject({
      route: '/api/v1/orders/preview',
      maxRequests: 60,
      windowMs: 60_000,
    });
    expect(matchingRule('/api/v1/orders/vat')).toMatchObject({
      route: '/api/v1/orders/vat',
      maxRequests: 60,
      windowMs: 60_000,
    });
  });

  it('order creation itself keeps the strict 10/min rule', () => {
    expect(matchingRule('/api/v1/orders')).toMatchObject({
      route: '/api/v1/orders',
      maxRequests: 10,
      windowMs: 60_000,
      keyBy: 'ip',
    });
  });

  it('specific read rules sit ABOVE the generic creation rule in the table', () => {
    // findMatchingRule takes the FIRST prefix match — if the generic
    // '/api/v1/orders' row is moved above the read rows, this fails before
    // the 429s ever reach a browser.
    const genericIndex = RATE_LIMIT_RULES.findIndex((r) => r.route === '/api/v1/orders');
    for (const route of ['/api/v1/orders/preview', '/api/v1/orders/vat']) {
      const specificIndex = RATE_LIMIT_RULES.findIndex((r) => r.route === route);
      expect(specificIndex, `${route} rule must exist`).toBeGreaterThanOrEqual(0);
      expect(specificIndex, `${route} must be matched before the generic rule`).toBeLessThan(
        genericIndex,
      );
    }
  });
});

// ─── getClientIp — rightmost X-Forwarded-For trust ──────────
// MEDIUM-1: taking the first entry trusts a client-spoofable value.
// Hostatom nginx appends via proxy_add_x_forwarded_for, so the
// rightmost entry is the real client IP.

function mkReq(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/v1/test', { headers });
}

describe('getClientIp — X-Forwarded-For trust model', () => {
  it('returns the rightmost entry when nginx appends to a client-set header', () => {
    // Client spoofs "1.1.1.1" → nginx appends the real IP "203.0.113.1"
    const req = mkReq({ 'x-forwarded-for': '1.1.1.1, 203.0.113.1' });
    expect(getClientIp(req)).toBe('203.0.113.1');
  });

  it('handles multiple proxy hops (rightmost is the nearest trusted hop)', () => {
    const req = mkReq({ 'x-forwarded-for': 'spoof, proxy-a, proxy-b, 203.0.113.1' });
    expect(getClientIp(req)).toBe('203.0.113.1');
  });

  it('falls back to x-real-ip when x-forwarded-for is missing', () => {
    const req = mkReq({ 'x-real-ip': '203.0.113.1' });
    expect(getClientIp(req)).toBe('203.0.113.1');
  });

  it('falls back to "unknown" when both headers are missing', () => {
    const req = mkReq({});
    expect(getClientIp(req)).toBe('unknown');
  });

  it('trims whitespace from entries', () => {
    const req = mkReq({ 'x-forwarded-for': ' 1.1.1.1 ,  203.0.113.1 ' });
    expect(getClientIp(req)).toBe('203.0.113.1');
  });

  it('rejects an empty x-forwarded-for and falls back to x-real-ip', () => {
    const req = mkReq({ 'x-forwarded-for': '', 'x-real-ip': '203.0.113.1' });
    expect(getClientIp(req)).toBe('203.0.113.1');
  });

  it('rejects a commas-only x-forwarded-for', () => {
    const req = mkReq({ 'x-forwarded-for': ' , , ', 'x-real-ip': '203.0.113.1' });
    expect(getClientIp(req)).toBe('203.0.113.1');
  });
});
