/**
 * Admin auth-mutation CSRF guard (pre-launch checklist item: "CSRF
 * double-submit … has zero consumers" — this module is the consumer).
 *
 * Threat model: the admin access/refresh tokens live in HttpOnly cookies
 * (lib/adminRequest.ts), so the browser attaches them to ANY request from
 * the admin's browser — including a cross-site attacker's POST. Two
 * independent layers close that:
 *
 * 1. ORIGIN CHECK (primary, OWASP-recommended): browsers attach an `Origin`
 *    header to every POST; a cross-site attacker cannot forge a same-origin
 *    Origin. Applies to EVERY admin auth mutation (login, 2fa, refresh,
 *    logout) regardless of how the caller authenticates, and works for
 *    first-time logins that hold no CSRF cookie yet. Plain requests (tests,
 *    server-to-server) without an Origin header pass — same trust level as
 *    curl; a browser never omits it on these calls.
 *
 * 2. DOUBLE-SUBMIT COOKIE (defense in depth for cookie-authenticated
 *    refresh/logout/2fa): a non-HttpOnly `nk_csrf` cookie (seeded by the
 *    middleware) must be echoed in the `x-csrf-token` header. An attacker
 *    on another origin can neither read nor SET a cookie for this site, so
 *    the echo cannot be fabricated. Bearer-token callers (API clients, the
 *    authz-matrix suite) skip this layer — they do not ride browser cookies
 *    and are immune to cookie-auto-attach CSRF by construction.
 *
 * The pure helpers live here (unit-testable); the middleware seeds the CSRF
 * cookie and route handlers call `assertAdminAuthMutation`.
 */

export const CSRF_COOKIE_NAME = 'nk_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_BYTES = 32;

/**
 * Generate a fresh CSRF token (random hex, 64 chars). Uses the global Web
 * Crypto API so the middleware can call it on the edge runtime (no
 * node:crypto import); Node ≥20 exposes the same global.
 */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(CSRF_TOKEN_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * True when the request's Origin (falling back to Referer) matches the host
 * the request was addressed to. SameSite=Lax already blocks classic
 * cross-site POSTs; this closes the remaining nested-context gaps.
 */
export function isSameOrigin(req: { headers: { get(name: string): string | null } }): boolean {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  if (!origin && !referer) return true; // non-browser client (curl/tests)

  const host = req.headers.get('host');
  if (!host) return false;

  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  try {
    return new URL(referer as string).host === host;
  } catch {
    return false;
  }
}

/**
 * Double-submit check: the non-HttpOnly CSRF cookie value must equal the
 * `x-csrf-token` header. Missing either side (or a mismatch) fails.
 */
export function validateCsrfDoubleSubmit(req: AdminCsrfRequest): boolean {
  const headerToken = req.headers.get(CSRF_HEADER_NAME);
  if (!headerToken) return false;
  const cookieHeader = req.headers.get('cookie') ?? '';
  const match = new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`).exec(cookieHeader);
  if (!match?.[1]) return false;
  let cookieToken: string;
  try {
    cookieToken = decodeURIComponent(match[1]);
  } catch {
    cookieToken = match[1];
  }
  return constantTimeEquals(cookieToken, headerToken);
}

export interface AdminCsrfRequest {
  headers: {
    get(name: string): string | null;
  };
}

export interface AdminCsrfResult {
  ok: boolean;
  error?: 'ORIGIN_MISMATCH' | 'CSRF_TOKEN_MISSING' | 'CSRF_TOKEN_INVALID';
}

/**
 * Full gate for admin auth mutations. `authenticatedByCookie` must be true
 * when the caller presented the session through the browser cookies (i.e.
 * no `Authorization: Bearer` header) — only then does the double-submit
 * layer apply on top of the origin check.
 */
export function checkAdminAuthMutation(
  req: AdminCsrfRequest,
  authenticatedByCookie: boolean,
): AdminCsrfResult {
  if (!isSameOrigin(req)) return { ok: false, error: 'ORIGIN_MISMATCH' };
  if (authenticatedByCookie && !validateCsrfDoubleSubmit(req)) {
    const hasHeader = Boolean(req.headers.get(CSRF_HEADER_NAME));
    return { ok: false, error: hasHeader ? 'CSRF_TOKEN_INVALID' : 'CSRF_TOKEN_MISSING' };
  }
  return { ok: true };
}

/** Constant-time string comparison (length-checked first). */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
