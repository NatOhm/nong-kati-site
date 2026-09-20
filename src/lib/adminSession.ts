'use client';

/**
 * Admin client-session helper.
 *
 * Access JWTs live 15 minutes; refresh tokens 30 days (rotated server-side on
 * every refresh). This module is the single place that reads/writes the admin
 * tokens in localStorage and the single place that refreshes:
 *
 * - `adminFetch` wraps fetch and transparently retries once through the
 *   refresh endpoint on a 401, so a mid-session expiry never surfaces.
 * - `ensureFreshAdminToken` proactively refreshes when the access JWT is
 *   within a grace window of expiring (used by the layout timer).
 * - Refreshes are single-flight: concurrent 401s share one in-flight request.
 * - A failed refresh clears storage and dispatches `nk-admin-session-expired`,
 *   which the management layout turns into a redirect to the login page.
 */

import type { Permission, AdminRole } from '@/types/auth';

const ACCESS_KEY = 'nk_admin_access_token';
const REFRESH_KEY = 'nk_admin_refresh_token';
export const ADMIN_SESSION_EXPIRED_EVENT = 'nk-admin-session-expired';

/** Refresh when the access token has ≤60s of life left (proactive path). */
const PROACTIVE_REFRESH_WINDOW_MS = 60 * 1000;

let inflightRefresh: Promise<boolean> | null = null;

// ─── Storage ─────────────────────────────────────────────

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getAdminRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setAdminSession(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearAdminSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ─── Remember me ──────────────────────────────────────────

const REMEMBER_KEY = 'nk_admin_remember';

/** Remember-me choice of the current login (default false). */
export function isAdminRemembered(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(REMEMBER_KEY) === '1';
}

export function setAdminRemembered(remember: boolean): void {
  if (typeof window === 'undefined') return;
  if (remember) localStorage.setItem(REMEMBER_KEY, '1');
  else localStorage.setItem(REMEMBER_KEY, '0');
}

/**
 * Un-remembered sessions must end with the browser: clear the tokens when
 * the tab closes. beforeunload/pagehide fire on every tab close (and on
 * refresh — harmless, tokens re-saved by the next login only). Remembered
 * sessions deliberately persist.
 */
export function installSessionScopeGuard(): void {
  if (typeof window === 'undefined') return;
  if ((window as Window & { __nkAdminScopeGuard?: boolean })['__nkAdminScopeGuard']) return;
  (window as Window & { __nkAdminScopeGuard?: boolean })['__nkAdminScopeGuard'] = true;
  window.addEventListener('pagehide', () => {
    if (!isAdminRemembered()) clearAdminSession();
  });
}

export interface AdminJwtPayloadLike {
  exp?: number;
  sub?: string;
  email?: string;
  role?: AdminRole;
  perms?: Permission[];
}

/** Decode the access JWT payload without verifying (client-side read only). */
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

/** Milliseconds until the access token expires; ≤0 means expired/unreadable. */
export function accessTokenTtlMs(token: string): number {
  const payload = decodeAdminToken(token);
  if (!payload?.exp) return 0;
  return payload.exp * 1000 - Date.now();
}

// ─── Refresh ─────────────────────────────────────────────

/**
 * Refresh the session via the API. Returns true on success (storage updated
 * with the rotated pair). Single-flight: concurrent callers share the request.
 */
export function refreshAdminSession(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;

  const task = (async () => {
    const refreshToken = getAdminRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch('/api/v1/auth/admin/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
      if (!data.accessToken || !data.refreshToken) return false;
      setAdminSession(data.accessToken, data.refreshToken);
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

/** Refresh failed definitively — drop the session and notify the app. */
function expireSession(): void {
  clearAdminSession();
  window.dispatchEvent(new CustomEvent(ADMIN_SESSION_EXPIRED_EVENT));
}

/**
 * Proactively refresh when inside the grace window. Returns the current
 * access token if the session is (now) fresh, else null.
 */
export async function ensureFreshAdminToken(): Promise<string | null> {
  const token = getAdminToken();
  if (!token) return null;
  if (accessTokenTtlMs(token) > PROACTIVE_REFRESH_WINDOW_MS) return token;
  const ok = await refreshAdminSession();
  if (!ok) {
    expireSession();
    return null;
  }
  return getAdminToken();
}

// ─── Fetch wrapper ───────────────────────────────────────

function withAuth(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * fetch() for admin APIs: attaches the bearer token and, on a 401, refreshes
 * the session once and retries the original request with the new token.
 * Rejects with a 401-like Error if the retry also fails.
 */
export async function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getAdminToken();
  const res = await fetch(url, token ? withAuth(init, token) : init);

  if (res.status !== 401 || !getAdminRefreshToken()) return res;

  const ok = await refreshAdminSession();
  if (!ok) {
    expireSession();
    return res;
  }

  const fresh = getAdminToken();
  if (!fresh) return res;
  const retry = await fetch(url, withAuth(init, fresh));
  if (retry.status === 401) {
    // New token also rejected — the session is truly dead.
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
