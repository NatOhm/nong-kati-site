/**
 * Admin token resolution + session cookies (security review CRITICAL-1 hardening).
 *
 * Admin access/refresh tokens used to live in localStorage, so any XSS on the
 * public origin could read a 30-day refresh credential and own the back
 * office. They now live in HttpOnly cookies (`nk_admin_at`, `nk_admin_rt`)
 * that JavaScript can never read; the browser attaches them automatically.
 *
 * Compatibility rules baked in here:
 *  - Every admin API still accepts `Authorization: Bearer` (the authz-matrix
 *    suite, scripts and integrations keep working — tokens simply are no
 *    longer handed to browsers through JS-readable storage).
 *  - When a client authenticates through the cookie, the browser never needs
 *    the raw token string, so the auth routes omit it from the JSON body.
 *  - `nk_admin_flag` (value 1, NOT httpOnly) and `nk_admin_exp` (epoch ms of
 *    the refresh-cookie expiry, NOT httpOnly) are the only JS-visible
 *    markers: the client uses them to know a session exists and when to
 *    proactively refresh — neither carries a secret.
 *  - Remember-me maps to a 30-day cookie; an un-remembered session is a
 *    browser-session cookie (no maxAge) so it dies with the browser — the
 *    server TTL (12h) still bounds it.
 */

import type { NextResponse } from 'next/server';

export const ADMIN_ACCESS_COOKIE = 'nk_admin_at';
export const ADMIN_REFRESH_COOKIE = 'nk_admin_rt';
export const ADMIN_FLAG_COOKIE = 'nk_admin_flag';
export const ADMIN_EXPIRY_COOKIE = 'nk_admin_exp';

/** Parse one cookie out of a raw `Cookie` header without any dependency. */
function readCookieHeader(cookieHeader: string, name: string): string | null {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(cookieHeader);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Resolve the admin access token for a request: explicit `Authorization:
 * Bearer` first (API clients/tests), then the HttpOnly access cookie.
 */
export function getAdminToken(req: {
  headers: { get(name: string): string | null };
}): string | null {
  const header = req.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7) || null;
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;
  return readCookieHeader(cookieHeader, ADMIN_ACCESS_COOKIE);
}

/**
 * Resolve the refresh token for a request: the JSON body value first (API
 * clients), then the HttpOnly refresh cookie. `cookieSourced` tells the
 * caller whether the token came from the browser cookie (and therefore must
 * NOT be echoed back into a JS-readable response body).
 */
export function getAdminRefreshToken(
  req: { headers: { get(name: string): string | null } },
  bodyToken?: string,
): { token: string | null; cookieSourced: boolean } {
  if (bodyToken) return { token: bodyToken, cookieSourced: false };
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return { token: null, cookieSourced: false };
  return { token: readCookieHeader(cookieHeader, ADMIN_REFRESH_COOKIE), cookieSourced: true };
}

export interface AdminCookieOptions {
  /** Max age for the refresh cookie in seconds; omit → browser-session cookie. */
  refreshMaxAgeSeconds?: number | undefined;
}

const isProduction = process.env['NODE_ENV'] === 'production';

/**
 * Attach the admin session cookies to a login/refresh response. Access
 * cookie always tracks the 15-minute JWT; the refresh cookie carries the
 * caller-computed session TTL (30d remembered, browser-session otherwise).
 */
export function setAdminSessionCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
  options: AdminCookieOptions = {},
): void {
  const secure = isProduction;
  const base = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };
  res.cookies.set({ ...base, name: ADMIN_ACCESS_COOKIE, value: accessToken, maxAge: 900 });
  res.cookies.set({
    ...base,
    name: ADMIN_REFRESH_COOKIE,
    value: refreshToken,
    ...(options.refreshMaxAgeSeconds !== undefined ? { maxAge: options.refreshMaxAgeSeconds } : {}),
  });
  // JS-visible, secret-free markers for the client session helper.
  res.cookies.set({
    name: ADMIN_FLAG_COOKIE,
    value: '1',
    sameSite: 'lax',
    secure,
    path: '/',
    ...(options.refreshMaxAgeSeconds !== undefined ? { maxAge: options.refreshMaxAgeSeconds } : {}),
  });
  res.cookies.set({
    name: ADMIN_EXPIRY_COOKIE,
    value: String(Date.now() + (options.refreshMaxAgeSeconds ?? 12 * 60 * 60) * 1000),
    sameSite: 'lax',
    secure,
    path: '/',
    ...(options.refreshMaxAgeSeconds !== undefined ? { maxAge: options.refreshMaxAgeSeconds } : {}),
  });
}

/** Drop every admin session cookie (logout / expired refresh). */
export function clearAdminSessionCookies(res: NextResponse): void {
  const expired = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    maxAge: 0,
  };
  res.cookies.set({ ...expired, name: ADMIN_ACCESS_COOKIE, value: '' });
  res.cookies.set({ ...expired, name: ADMIN_REFRESH_COOKIE, value: '' });
  const clearFlag = { sameSite: 'lax' as const, secure: isProduction, path: '/', maxAge: 0 };
  res.cookies.set({ ...clearFlag, name: ADMIN_FLAG_COOKIE, value: '' });
  res.cookies.set({ ...clearFlag, name: ADMIN_EXPIRY_COOKIE, value: '' });
}
