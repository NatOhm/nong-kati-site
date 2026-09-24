

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

  // Auth (per-IP; per-account brute force is additionally covered by the
  // DB lockout in adminLogin — 5 wrong passwords → 15-minute account lock).
  // NOTE: paths must match the real endpoints under /api/v1/auth/admin/*.
  { route: '/api/v1/auth/login', maxRequests: 20, windowMs: 900_000, keyBy: 'ip' }, // customer login
  { route: '/api/v1/auth/register', maxRequests: 20, windowMs: 900_000, keyBy: 'ip' },
  { route: '/api/v1/auth/admin/login', maxRequests: 30, windowMs: 1_800_000, keyBy: 'ip' }, // admin step 1
  { route: '/api/v1/auth/admin/2fa', maxRequests: 30, windowMs: 1_800_000, keyBy: 'ip' }, // admin step 2

  // Order velocity (per 01-prd.md FR-144, FR-145)
  { route: '_order_velocity_email', maxRequests: 20, windowMs: 86_400_000, keyBy: 'email' }, // 20 / 24h
  { route: '_order_velocity_ip', maxRequests: 30, windowMs: 86_400_000, keyBy: 'ip' }, // 30 / 24h

  // Payment
  { route: '/api/v1/payments', maxRequests: 20, windowMs: 60_000, keyBy: 'ip' },

  // Admin (generous — staff is authenticated)
  { route: '/api/v1/admin', maxRequests: 300, windowMs: 60_000, keyBy: 'ip' },

  // Data requests (PDPA)
  { route: '/api/v1/legal/data-requests', maxRequests: 5, windowMs: 86_400_000, keyBy: 'email' }, // 5 / 24h
];

// ─── In-Memory Store (fallback) ──────────────────────────

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

// ─── Shared Store (Upstash Redis REST) ─────────────────
// In-memory counters are per serverless instance and vanish on cold start,
// so documented limits are trivially bypassed by spreading requests across
// instances. When Upstash REST credentials are configured, counters are
// shared atomically via INCR on a fixed-window bucket key.

const UPSTASH_URL = process.env['UPSTASH_REDIS_REST_URL'];
const UPSTASH_TOKEN = process.env['UPSTASH_REDIS_REST_TOKEN'];
const SHARED_ENABLED = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

async function sharedIncrement(
  key: string,
  windowMs: number,
): Promise<{ count: number; resetAt: number } | null> {
  if (!SHARED_ENABLED) return null;
  const bucket = Math.floor(Date.now() / windowMs);
  const redisKey = `ratelimit:${key}:${bucket}`;
  try {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', redisKey],
        ['PEXPIRE', redisKey, String(windowMs)],
      ]),
      // Never let limiter downtime take the API down — degrade to memory.
      signal: AbortSignal.timeout(1_500),
    });
    if (!res.ok) return null;
    const results = (await res.json()) as { result?: unknown }[];
    const count = Number(results[0]?.result ?? 0);
    if (!Number.isFinite(count) || count <= 0) return null;
    return { count, resetAt: (bucket + 1) * windowMs };
  } catch {
    return null;
  }
}

// ─── Core Functions ──────────────────────────────────────

/**
 * Check if a request should be rate-limited.
 * Returns { allowed, remaining, resetAt }.
 *
 * Uses the shared Upstash counter when configured (serverless-safe: the
 * limit is global across instances), otherwise falls back to the
 * per-instance memory store (dev / self-hosted single process).
 */
export async function checkRateLimit(
  route: string,
  identifier: string,

  rule?: RateLimitRule,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const matchedRule = rule ?? findMatchingRule(route);
  if (!matchedRule) {
    // No rule = unlimited
    return { allowed: true, remaining: Infinity, resetAt: 0 };
  }

  const key = `${matchedRule.route}:${identifier}`;

  if (SHARED_ENABLED) {
    const shared = await sharedIncrement(key, matchedRule.windowMs);
    if (shared) {
      const allowed = shared.count <= matchedRule.maxRequests;
      return {
        allowed,
        remaining: Math.max(0, matchedRule.maxRequests - shared.count),
        resetAt: shared.resetAt,
      };
    }
    // Shared store unavailable → fall through to the memory store.
  }

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
  rule: RateLimitRule,
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
export async function applyRateLimit(
  route: string,
  identifier: string,
  response?: NextResponse,
): Promise<NextResponse> {
  const result = await checkRateLimit(route, identifier);
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
      },
    );
  }

  return res;
}

// ─── Helpers ─────────────────────────────────────────────

function findMatchingRule(route: string): RateLimitRule | undefined {
  // Exact match first, then prefix match
  return (
    RATE_LIMIT_RULES.find((r) => r.route === route) ??
    RATE_LIMIT_RULES.find((r) => r.route !== '_' && route.startsWith(r.route))
  );
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
