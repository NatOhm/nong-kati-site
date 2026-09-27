import { NextRequest, NextResponse } from 'next/server';

import { refreshAdminSession } from '@/api/adminAuth';
import {
  clearAdminSessionCookies,
  getAdminRefreshToken,
  setAdminSessionCookies,
} from '@/lib/adminRequest';

export const dynamic = 'force-dynamic';

const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * POST /api/v1/auth/admin/refresh — exchange a refresh token for a new
 * 15-minute access JWT. The refresh token is rotated on every use: the old
 * row is revoked and a fresh opaque token is returned alongside the access
 * JWT. Invalid, expired or already-rotated tokens return 401 TOKEN_INVALID.
 *
 * Security review CRITICAL-1: browser sessions no longer keep the token in
 * JS-readable storage — the HttpOnly cookies are the source of truth for
 * them (body fallback retained for API clients), and a body-sourced token is
 * never echoed into the response body when the caller is cookie-based.
 * Rotated remember-me sessions keep their 30-day cookie lifetime.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const bodyToken = typeof b['refreshToken'] === 'string' ? b['refreshToken'] : undefined;
  const { token: refreshToken, cookieSourced } = getAdminRefreshToken(req, bodyToken);
  if (!refreshToken) {
    return NextResponse.json({ error: 'REFRESH_TOKEN_REQUIRED' }, { status: 400 });
  }

  const result = await refreshAdminSession(refreshToken);

  if (!result.success) {
    // A dead refresh must end the browser session cleanly too.
    const failed = NextResponse.json(result, { status: 401 });
    if (cookieSourced) clearAdminSessionCookies(failed);
    return failed;
  }

  const remembered =
    typeof result.refreshTokenExpiresIn === 'number' && result.refreshTokenExpiresIn > 12 * 60 * 60;
  const res = NextResponse.json(
    cookieSourced ? { ...result, accessToken: undefined, refreshToken: undefined } : result,
    { status: 200 },
  );
  if (result.accessToken && result.refreshToken) {
    setAdminSessionCookies(res, result.accessToken, result.refreshToken, {
      refreshMaxAgeSeconds: remembered ? REFRESH_COOKIE_MAX_AGE_SECONDS : undefined,
    });
  }
  return res;
}
