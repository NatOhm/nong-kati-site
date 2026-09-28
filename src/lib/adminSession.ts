'use client';

/**
 * Admin client-session helper — cookie-backed (security review CRITICAL-1).
 *
 * The access/refresh JWT pair used to live in localStorage, where any XSS
 * could read a 30-day refresh credential. They now live in HttpOnly cookies
 * set by the auth routes; this module only tracks the secret-free presence
 * marker (`nk_admin_flag`) and expiry hint (`nk_admin_exp`) and drives the
 * refresh flow:
 *
 * - `adminFetch` wraps fetch (credentials are sent automatically as
 *   same-origin cookies) and transparently retries once through the refresh
 *   endpoint on a 401, so a mid-session expiry never surfaces.
 * - `ensureFreshAdminToken` proactively refreshes near expiry (layout timer).
 * - Refreshes are single-flight: concurrent 401s share one in-flight request.
 * - A failed refresh clears the local marker and dispatches
 *   `nk-admin-session-expired`, which the management layout turns into a
 *   redirect to the login page.
 */

import type { Permission, AdminRole } from '@/types/auth';

export const ADMIN_SESSION_EXPIRED_EVENT = 'nk-admin-session-expired';

/** Refresh when the access token has ≤60s of life left (proactive path). */
const PROACTIVE_REFRESH_WINDOW_MS = 60 * 1000;

let inflightRefresh: Promise<boolean> | null = null;

// ─── Presence marker (no secrets) ────────────────────────

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(document.cookie);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * True when the admin session marker cookie exists. The HttpOnly access and
 * refresh cookies cannot (and must not) be inspected from JS; the flag is
 * set/cleared by the auth routes together with them.
 */
export function hasAdminSession(): boolean {
  if (typeof document === 'undefined') return false;
  return readCookie('nk_admin_flag') === '1';
}

/** Milliseconds left on the refresh session per the expiry-hint cookie; ≤0 unknown/expired. */
export function adminSessionTtlMs(): number {
  const raw = readCookie('nk_admin_exp');
  if (!raw) return 0;
  const exp = Number(raw);
  if (!Number.isFinite(exp)) return 0;
  return exp - Date.now();
}

// ─── Remember me ──────────────────────────────────────────

const REMEMBER_KEY = 'nk_admin_remember';

/** Remember-me choice of the current login (default false). UI-only today. */
export function isAdminRemembered(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(REMEMBER_KEY) === '1';
}

export function setAdminRemembered(remember: boolean): void {
  if (typeof window === 'undefined') return;
  if (remember) localStorage.setItem(REMEMBER_KEY, '1');
  else localStorage.setItem(REMEMBER_KEY, '0');
}

// ─── Refresh ─────────────────────────────────────────────

/**
 * Echo the double-submit CSRF token: the middleware seeds a non-HttpOnly
 * `nk_csrf` cookie; auth mutations must carry its value in x-csrf-token
 * (see lib/adminCsrf.ts).
 */
function csrfHeader(): Record<string, string> {
  const token = readCookie('nk_csrf');
  return token ? { 'x-csrf-token': token } : {};
}

/**
 * Refresh the session via the API. Returns true on success (HttpOnly cookies
 * rotated server-side). Single-flight: concurrent callers share the request.
 */
export function refreshAdminSession(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;

  const task = (async () => {
    try {
      const res = await fetch('/api/v1/auth/admin/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeader() },
        body: JSON.stringify({}),
      });
      if (!res.ok) return false;
      return true;
    } catch {
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();

  inflightRefresh = task;
  return task;
}

/** Refresh failed definitively — drop the marker and notify the app. */
function expireSession(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ADMIN_SESSION_EXPIRED_EVENT));
}

/**
 * Proactively refresh when near expiry. Returns true when a session exists
 * and is (now) fresh, else false.
 */
export async function ensureFreshAdminSession(): Promise<boolean> {
  if (!hasAdminSession()) return false;
  if (adminSessionTtlMs() > PROACTIVE_REFRESH_WINDOW_MS) return true;
  const ok = await refreshAdminSession();
  if (!ok) {
    expireSession();
    return false;
  }
  return true;
}

/**
 * Force-clear the browser-side session state: revoke server-side (best
 * effort, bounded), drop the local marker, then let the caller navigate.
 */
export async function clearAdminSession(): Promise<void> {
  try {
    await fetch('/api/v1/auth/admin/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeader() },
      body: JSON.stringify({}),
      keepalive: true,
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // Revocation is best-effort here; AdminTopBar awaits it explicitly and
    // surfaces failures. Cookies are cleared by the response regardless.
  }
  if (typeof window !== 'undefined') setAdminRemembered(false);
}

// ─── Fetch wrapper ───────────────────────────────────────

/**
 * fetch() for admin APIs. Cookies ride along automatically; on a 401 the
 * session is refreshed once (rotating the HttpOnly cookies) and the request
 * retried. Rejects with the 401 response if the retry also fails.
 */
export async function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, init);

  if (res.status !== 401 || !hasAdminSession()) return res;

  const ok = await refreshAdminSession();
  if (!ok) {
    expireSession();
    return res;
  }

  const retry = await fetch(url, init);
  if (retry.status === 401) {
    // New cookie also rejected — the session is truly dead.
    expireSession();
  }
  return retry;
}

/** Convenience: adminFetch with a JSON body attached. */
export async function adminFetchJson(
  url: string,
  method: string,
  body: unknown,
): Promise<Response> {
  return adminFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Generic JSON helper: fetches with admin auth, parses the body, and throws
 * an Error carrying the server's `error` code when the response is not OK.
 */
export async function adminJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await adminFetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
  }
  return data;
}

// ─── Back-compat shims (JWT-decode helpers used by old callers) ──

export interface AdminJwtPayloadLike {
  exp?: number;
  sub?: string;
  email?: string;
  role?: AdminRole;
  perms?: Permission[];
}

/**
 * Decode a JWT payload without verifying (client-side read only). Kept for
 * callers that still hold a token string; the cookie flow never hands
 * tokens to JS, so this is effectively legacy-only.
 */
export function decodeAdminToken(token: string): AdminJwtPayloadLike | null {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as AdminJwtPayloadLike;
  } catch {
    return null;
  }
}
