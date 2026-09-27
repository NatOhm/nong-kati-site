import { NextRequest, NextResponse } from 'next/server';

import { adminLogout } from '@/api/adminAuth';
import { clearAdminSessionCookies, getAdminRefreshToken } from '@/lib/adminRequest';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/admin/logout — revoke the given refresh token
 * server-side, then drop the session cookies. Idempotent: unknown or
 * already-revoked tokens still return success so the client can always
 * clear its state.
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
    // Nothing to revoke — still clear whatever cookies exist.
    const res = NextResponse.json({ error: 'REFRESH_TOKEN_REQUIRED' }, { status: 400 });
    clearAdminSessionCookies(res);
    return res;
  }

  await adminLogout(refreshToken);
  const res = NextResponse.json({ success: true });
  clearAdminSessionCookies(res);
  void cookieSourced;
  return res;
}
