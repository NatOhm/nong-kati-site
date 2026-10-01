/**
 * Next.js Middleware — 13-security.md §8 Security Headers.
 * Applied to every response. CSP, HSTS, X-Frame-Options, etc.
 *
 * CSP rollout (production roadmap §1):
 *  - Production (default): ENFORCED policy with a per-request `'nonce-…'`
 *    in script-src and NO 'unsafe-inline' — the closing move of the
 *    JSON-LD XSS saga. Next.js picks the nonce up from the request CSP
 *    header (official pattern) and applies it to its own bootstrap
 *    scripts; JSON-LD blocks are data-only `<script type="application/
 *    ld+json">` and need no nonce. The one former inline script
 *    (theme pre-paint init) now loads from /theme-init.js.
 *  - Escape hatch: NK_CSP_UNSAFE_INLINE=true restores the old
 *    unsafe-inline policy without a redeploy of code (env rollback).
 *  - Staging: NK_CSP_REPORT_ONLY=true switches to the report-only header.
 *  - Dev: 'unsafe-eval' for React Refresh stays available.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { applyRateLimit } from '@/lib/rateLimit';
import { CSRF_COOKIE_NAME, generateCsrfToken } from '@/lib/adminCsrf';

const isDev = process.env.NODE_ENV === 'development';

function buildCsp(nonce: string | undefined): string {
  const evalRule = isDev ? " 'unsafe-eval'" : '';
  // Nonce policy in production; unsafe-inline otherwise (dev + escape hatch).
  const inlineScriptRule = nonce && !isDev ? ` 'nonce-${nonce}'` : " 'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src 'self'${inlineScriptRule}${evalRule} https://www.google.com https://www.gstatic.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' blob: https://cdn.nong-kati.co.th data: https://www.google.com https://api.qrserver.com",
    "connect-src 'self' https://api.omise.co https://*.2c2p.com https://www.google-analytics.com",
    'frame-src https://js.omise.co https://pay.omise.co https://*.2c2p.com https://www.google.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

function buildReportCsp(nonce: string | undefined): string {
  return `${buildCsp(nonce)}; report-uri /api/v1/csp-report`;
}

// ─── Route Groups ───────────────────────────────────────

const AUTH_ROUTES = ['/api/v1/auth/', '/api/v1/admin/auth/'];
const SENSITIVE_ROUTES = ['/checkout/', '/account/', '/management/'];
const WEBHOOK_ROUTES = ['/api/v1/webhooks/'];

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((r) => pathname.startsWith(r));
}

function isSensitiveRoute(pathname: string): boolean {
  // Match both "/checkout" and "/checkout/..." — the trailing-slash entries
  // must not let the bare path escape the noindex header.
  return SENSITIVE_ROUTES.some((r) => {
    const bare = r.replace(/\/$/, '');
    return pathname === bare || pathname.startsWith(r);
  });
}

function isWebhookRoute(pathname: string): boolean {
  return WEBHOOK_ROUTES.some((r) => pathname.startsWith(r));
}

// ─── Middleware ──────────────────────────────────────────

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ─── CSP mode + nonce ────────────────────────────────
  const reportOnly = process.env['NK_CSP_REPORT_ONLY'] === 'true';
  const escapeHatch = process.env['NK_CSP_UNSAFE_INLINE'] === 'true';
  const enforceNonce = !isDev && !escapeHatch;
  const nonce = enforceNonce ? btoa(crypto.randomUUID()) : undefined;
  const cspHeader = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  const cspValue = reportOnly ? buildReportCsp(nonce) : buildCsp(nonce);

  // Request headers carrying the nonce: Next.js reads the CSP from here and
  // applies the nonce to its own inline bootstrap scripts automatically.
  let requestHeaders = request.headers;
  if (nonce) {
    requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', cspValue);
  }

  // ─── Rate limiting (API routes) ───────────────────
  // Sliding-window limiter from 13-security.md §5 — shared Upstash counter
  // when configured (serverless-safe), per-instance memory otherwise.
  // Per-account brute force is additionally covered by the DB lockout in
  // adminLogin. Only API routes are limited.
  let limited: NextResponse | null = null;
  if (pathname.startsWith('/api/')) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';
    limited = await applyRateLimit(pathname, ip);
    limited.headers.set('X-RateLimit-Scoped-By', 'ip');
    if (limited.status === 429) {
      limited.headers.set(cspHeader, cspValue);
      return limited;
    }
  }

  const response =
    limited ??
    (nonce ? NextResponse.next({ request: { headers: requestHeaders } }) : NextResponse.next());

  // ─── Core Security Headers (all routes) ───────────
  response.headers.set(cspHeader, cspValue);
  if (nonce) response.headers.set('x-nonce', nonce);
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self "https://js.omise.co")',
  );

  // ─── Admin session cookies: never cacheable ───────
  // Auth responses set/rotate HttpOnly credentials — a shared or proxy cache
  // must never store them (mirrors the auth-routes no-store above).
  const isAdminApi =
    pathname.startsWith('/api/v1/auth/admin/') || pathname.startsWith('/api/v1/admin/');
  if (isAdminApi) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
  }

  // ─── CSRF cookie seed (double-submit pattern) ─────
  // Non-HttpOnly `nk_csrf` so the admin login/2fa pages can echo it in the
  // x-csrf-token header (see lib/adminCsrf.ts). Seeded once per client and
  // refreshed after its 24h lifetime; it carries no session secret.
  if (!request.cookies.has(CSRF_COOKIE_NAME)) {
    response.cookies.set({
      name: CSRF_COOKIE_NAME,
      value: generateCsrfToken(),
      httpOnly: false,
      sameSite: 'lax',
      secure: !isDev,
      path: '/',
      maxAge: 86400,
    });
  }

  // ─── Auth Routes — no-cache ───────────────────────
  if (isAuthRoute(pathname)) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
  }

  // ─── Sensitive Routes — noindex ───────────────────
  if (isSensitiveRoute(pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // ─── Webhook Routes — no CSP (not browser-rendered) ─
  if (isWebhookRoute(pathname)) {
    response.headers.delete(cspHeader);
    // HSTS still applies at transport level via edge config
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (browser icon)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
