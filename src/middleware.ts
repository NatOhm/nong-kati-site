/**
 * Next.js Middleware — 13-security.md §8 Security Headers.
 * Applied to every response. CSP, HSTS, X-Frame-Options, etc.
 *
 * CSP report-only rollout: set NK_CSP_REPORT_ONLY=true in staging first.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── CSP Policy ─────────────────────────────────────────
// 13-security.md §8 — locked values
// Dev mode needs 'unsafe-eval' for React Refresh (HMR)
const isDev = process.env.NODE_ENV === 'development';
const evalRule = isDev ? " 'unsafe-eval'" : '';

const CSP_DIRECTIVES = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${evalRule} https://www.google.com https://www.gstatic.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https://cdn.nong-kati.co.th data: https://www.google.com https://api.qrserver.com",
  "connect-src 'self' https://api.omise.co https://*.2c2p.com https://www.google-analytics.com",
  "frame-src https://js.omise.co https://pay.omise.co https://*.2c2p.com https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

const CSP_REPORT_DIRECTIVES = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${evalRule} https://www.google.com https://www.gstatic.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https://cdn.nong-kati.co.th data: https://www.google.com https://api.qrserver.com",
  "connect-src 'self' https://api.omise.co https://*.2c2p.com https://www.google-analytics.com",
  "frame-src https://js.omise.co https://pay.omise.co https://*.2c2p.com https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "report-uri /api/v1/csp-report",
].join('; ');

// ─── Route Groups ───────────────────────────────────────

const AUTH_ROUTES = ['/api/v1/auth/', '/api/v1/admin/auth/'];
const SENSITIVE_ROUTES = ['/checkout/', '/account/', '/management/'];
const WEBHOOK_ROUTES = ['/api/v1/webhooks/'];

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((r) => pathname.startsWith(r));
}

function isSensitiveRoute(pathname: string): boolean {
  return SENSITIVE_ROUTES.some((r) => pathname.startsWith(r));
}

function isWebhookRoute(pathname: string): boolean {
  return WEBHOOK_ROUTES.some((r) => pathname.startsWith(r));
}

// ─── Middleware ──────────────────────────────────────────

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Use report-only CSP in staging
  const reportOnly = process.env['NK_CSP_REPORT_ONLY'] === 'true';
  const cspHeader = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  const cspValue = reportOnly ? CSP_REPORT_DIRECTIVES : CSP_DIRECTIVES;

  // ─── Core Security Headers (all routes) ───────────
  response.headers.set(cspHeader, cspValue);
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self "https://js.omise.co")'
  );

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
