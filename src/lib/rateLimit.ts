/**
 * Rate Limiting — 13-security.md §5.
 * Redis-backed sliding window counter per route + IP/email.
 *
 * In production: Upstash Redis (REST/TLS transport).
 * For M8 mock: in-memory Map with automatic expiry.
 */

import { NextResponse } from 'next/server';

// ─── Rate Limit Rules (from 07-api.md §6) ──────────────

export type RateLimitRule = {
  route: string;
  maxRequests: number;
  windowMs: number;
  keyBy: 'ip' | 'email';
};

export const RATE_LIMIT_RULES: RateLimitRule[] = [
  // Public storefront
  { route: '/api/v1/products', maxRequests: 300, windowMs: 60_000, keyBy: 'ip' },
  { route: '/api/v1/categories', maxRequests: 300, windowMs: 60_000, keyBy: 'ip' },
  { route: '/api/v1/search', maxRequests: 60, windowMs: 60_000, keyBy: 'ip' },
  { route: '/api/v1/search/suggest', maxRequests: 120, windowMs: 60_000, keyBy: 'ip' },

  // Cart
  { route: '/api/v1/cart', maxRequests: 60, windowMs: 60_000, keyBy: 'ip' },

  // Checkout / Orders
  { route: '/api/v1/orders', maxRequests: 10, windowMs: 60_000, keyBy: 'ip' },

  // Auth
  { route: '/api/v1/auth/login', maxRequests: 5, windowMs: 900_000, keyBy: 'email' },      // 5 fails / 15 min
  { route: '/api/v1/admin/auth/login', maxRequests: 5, windowMs: 1_800_000, keyBy: 'email' }, // 5 fails / 30 min
  { route: '/api/v1/admin/auth/totp', maxRequests: 5, windowMs: 1_800_000, keyBy: 'email' },

  // Order velocity (per 01-prd.md FR-144, FR-145)
  { route: '_order_velocity_email', maxRequests: 20, windowMs: 86_400_000, keyBy: 'email' }, // 20 / 24h
  { route: '_order_velocity_ip', maxRequests: 30, windowMs: 86_400_000, keyBy: 'ip' },       // 30 / 24h

  // Payment
  { route: '/api/v1/payments', maxRequests: 20, windowMs: 60_000, keyBy: 'ip' },

  // Admin (generous — staff is authenticated)
  { route: '/api/v1/admin', maxRequests: 300, windowMs: 60_000, keyBy: 'ip' },

  // Data requests (PDPA)
  { route: '/api/v1/legal/data-requests', maxRequests: 5, windowMs: 86_400_000, keyBy: 'email' }, // 5 / 24h
];

// ─── In-Memory Mock Store ────────────────────────────────

type WindowEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, WindowEntry>();

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, 300_000);
}

// ─── Core Functions ──────────────────────────────────────

/**
 * Check if a request should be rate-limited.
 * Returns { allowed, remaining, resetAt }.
 */
export function checkRateLimit(
  route: string,
  identifier: string,
  rule?: RateLimitRule
): { allowed: boolean; remaining: number; resetAt: number } {
  const matchedRule = rule ?? findMatchingRule(route);
  if (!matchedRule) {
    // No rule = unlimited
    return { allowed: true, remaining: Infinity, resetAt: 0 };
  }

  const key = `${matchedRule.route}:${identifier}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    // New window
    const resetAt = now + matchedRule.windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: matchedRule.maxRequests - 1, resetAt };
  }

  // Existing window
  if (entry.count >= matchedRule.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: matchedRule.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get rate limit headers for a response.
 */
export function getRateLimitHeaders(
  result: { allowed: boolean; remaining: number; resetAt: number },
  rule: RateLimitRule
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(rule.maxRequests),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    'Retry-After': result.allowed ? '0' : String(Math.ceil((result.resetAt - Date.now()) / 1000)),
  };
}

/**
 * Apply rate limit to a NextResponse.
 * Returns the response with rate limit headers, or 429 if exceeded.
 */
export function applyRateLimit(
  route: string,
  identifier: string,
  response?: NextResponse
): NextResponse {
  const result = checkRateLimit(route, identifier);
  const fallbackRule: RateLimitRule = RATE_LIMIT_RULES[0]!;
  const rule = findMatchingRule(route) ?? fallbackRule;
  const res = response ?? NextResponse.next();
  const headers = getRateLimitHeaders(result, rule);

  for (const [key, value] of Object.entries(headers)) {
    res.headers.set(key, value);
  }

  if (!result.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'คำขอเกินขีดจำกัด กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
        },
      },
      {
        status: 429,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  return res;
}

// ─── Helpers ─────────────────────────────────────────────

function findMatchingRule(route: string): RateLimitRule | undefined {
  // Exact match first, then prefix match
  return RATE_LIMIT_RULES.find((r) => r.route === route)
    ?? RATE_LIMIT_RULES.find((r) => r.route !== '_' && route.startsWith(r.route));
}

/**
 * Get the client IP from request headers.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}
