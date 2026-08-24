/**
 * CSRF Protection — 13-security.md §4.
 * Double-submit cookie pattern for refresh endpoints.
 *
 * Non-HttpOnly nk_csrf cookie (random 32-byte value) must be echoed
 * back in X-CSRF-Token header on every /auth/refresh call.
 */

import { randomBytes } from 'crypto';

// ─── Constants ──────────────────────────────────────────

const CSRF_COOKIE_NAME = 'nk_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32;

// Routes that require CSRF validation
const CSRF_PROTECTED_ROUTES = [
  '/api/v1/auth/refresh',
  '/api/v1/admin/auth/refresh',
  '/api/v1/admin/auth/login',
  '/api/v1/admin/auth/logout',
];

// ─── Token Generation ───────────────────────────────────

/**
 * Generate a new CSRF token (random hex string).
 */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

// ─── Validation ─────────────────────────────────────────

/**
 * Check if a route requires CSRF validation.
 */
export function requiresCsrfValidation(pathname: string): boolean {
  return CSRF_PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
}

/**
 * Validate the CSRF token from the request against the cookie.
 * Returns true if valid, false if missing or mismatched.
 */
export function validateCsrfToken(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (!headerToken) return false;

  // Extract nk_csrf from cookie string
  const csrfCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));

  if (!csrfCookie) return false;

  const cookieToken = csrfCookie.split('=').slice(1).join('=');
  if (!cookieToken) return false;

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(cookieToken, headerToken);
}

/**
 * Create a Set-Cookie header value for the CSRF token.
 * Non-HttpOnly so JS can read it, but SameSite=Strict prevents cross-site.
 */
export function setCsrfCookie(token: string): string {
  return [
    `${CSRF_COOKIE_NAME}=${token}`,
    'Path=/',
    'SameSite=Strict',
    'Max-Age=86400', // 24 hours
    // Intentionally NOT HttpOnly — JS must read it to echo in header
  ].join('; ');
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
