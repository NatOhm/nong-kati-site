/**
 * Admin session helpers used by the admin SPA: the client pages import the
 * cookie/session marker helpers from here, while route handlers keep using
 * @/lib/adminRequest and @/lib/rbac.
 */

export const ADMIN_SESSION_EXPIRED_EVENT = 'admin:session-expired';

/**
 * Synchronous on purpose: these helpers only read the document cookie jar, so
 * every existing call site (`if (!hasAdminSession())`, `ttl <= 0`) stays honest
 * without an await. Callers that `await` a boolean still work.
 */
export function hasAdminSession(): boolean {
  if (typeof document === 'undefined') return false;
  const flag = document.cookie.match(/(?:^|;\s*)nk_admin_flag=([^;]*)/)?.[1];
  if (flag !== '1') return false;
  const exp = document.cookie.match(/(?:^|;\s*)nk_admin_exp=([^;]*)/)?.[1];
  if (!exp) return false;
  const ms = Number(exp);
  return Number.isFinite(ms) && ms > Date.now();
}

/** Milliseconds left on the expiry-hint cookie; ≤0 means unknown/expired. */
export function adminSessionTtlMs(): number {
  if (typeof document === 'undefined') return 0;
  const raw = document.cookie.match(/(?:^|;\s*)nk_admin_exp=([^;]*)/)?.[1];
  if (!raw) return 0;
  const exp = Number(raw);
  if (!Number.isFinite(exp)) return 0;
  return exp - Date.now();
}

export async function setAdminRemembered(remember: boolean): Promise<void> {
  if (typeof document === 'undefined') return;
  const maxAge = remember ? 30 * 24 * 60 * 60 : undefined;
  document.cookie = `nk_admin_flag=1; path=/; SameSite=Lax;${maxAge ? ` max-age=${maxAge}` : ''}`;
  document.cookie = `nk_admin_exp=${Date.now() + (remember ? 30 * 24 * 60 * 60 : 12 * 60 * 60) * 1000}; path=/; SameSite=Lax;${maxAge ? ` max-age=${maxAge}` : ''}`;
}

export async function clearAdminSession(): Promise<void> {
  if (typeof document === 'undefined') return;
  document.cookie = 'nk_admin_flag=; path=/; SameSite=Lax; max-age=0';
  document.cookie = 'nk_admin_exp=; path=/; SameSite=Lax; max-age=0';
}

export async function ensureFreshAdminSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!hasAdminSession()) return false;
  try {
    const res = await fetch('/api/v1/auth/admin/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      window.dispatchEvent(new CustomEvent(ADMIN_SESSION_EXPIRED_EVENT));
      return false;
    }
    return true;
  } catch {
    window.dispatchEvent(new CustomEvent(ADMIN_SESSION_EXPIRED_EVENT));
    return false;
  }
}

export async function getAdminSession(jti: string) {
  // Client helper surface only; server handlers use @/lib/adminRequest + @/lib/rbac.
  return undefined;
}

export interface AdminFetchInit extends RequestInit {
  token?: string | null;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight refresh: concurrent 401s share one rotation instead of
 *  racing each other through the refresh-token rotation (a lost race would
 *  revoke the cookie the other caller just received). */
function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = ensureFreshAdminSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function adminFetch(path: string, init: AdminFetchInit = {}): Promise<Response> {
  const token = init.token ?? null;
  const headers: HeadersInit = { ...(init.headers ?? {}) };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  const request: AdminFetchInit = { ...init, headers, credentials: 'same-origin' };
  let res = await fetch(path, request);
  // The access cookie is short-lived; a 401 with a live session marker means
  // it aged out — rotate once and replay the request (HEAD-era guarantee).
  if (res.status !== 401 || !hasAdminSession()) return res;
  const ok = await refreshOnce();
  if (!ok) return res;
  return fetch(path, request);
}

export async function adminJson<T>(path: string, init: AdminFetchInit = {}): Promise<T> {
  const res = await adminFetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function adminFetchJson(
  path: string,
  method: string,
  body?: unknown,
  token?: string | null,
): Promise<Response> {
  return adminFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    token: token ?? null,
  });
}
