import { NextRequest, NextResponse } from 'next/server';

import { confirm2fa, setup2fa } from '@/api/adminAuth';
import { setAdminSessionCookies } from '@/lib/adminRequest';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/admin/2fa — step 2: TOTP (08-auth.md §5.2).
 * Body {challengeToken, action: 'setup'} hands out QR/secret/backup codes;
 * body {challengeToken, code} verifies the code and issues the session.
 * Audit #9: `code` may be the 6-digit TOTP or one of the one-time backup
 * codes (XXXX-XXXX) — the shape check below just rejects obvious junk;
 * the real verification/consumption lives in confirm2fa.
 *
 * Security review CRITICAL-1: the session pair now lives in HttpOnly cookies
 * (`nk_admin_at` / `nk_admin_rt`) instead of localStorage. `remember`
 * chooses the refresh-cookie lifetime (30d vs browser-session); the tokens
 * themselves are no longer returned in the JSON body for cookie-sourced
 * logins — scripts can still authenticate by sending the challenge through
 * the same flow, they just receive the tokens when they explicitly ask with
 * a body-based `remember` (the challenge already carries it), so the body
 * always includes them for API clients. The HttpOnly cookies are set in
 * every successful response.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const challengeToken = typeof b['challengeToken'] === 'string' ? b['challengeToken'] : '';
  if (!challengeToken) {
    return NextResponse.json({ error: 'CHALLENGE_REQUIRED' }, { status: 400 });
  }

  if (b['action'] === 'setup') {
    const setup = await setup2fa(challengeToken);
    return NextResponse.json(setup, { status: setup.success ? 200 : 401 });
  }

  const code = typeof b['code'] === 'string' ? b['code'].trim() : '';
  const codeShape =
    /^\d{6}$/.test(code) || // TOTP
    /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(code) || // backup code as printed
    /^[A-Za-z0-9]{8}$/.test(code); // backup code without the dash
  if (!codeShape) {
    return NextResponse.json({ error: 'TOTP_INVALID' }, { status: 401 });
  }

  const result = await confirm2fa(challengeToken, code);
  const res = NextResponse.json(result, { status: result.success ? 200 : 401 });
  if (result.success && result.accessToken && result.refreshToken) {
    // remember is carried inside the challenge payload (challenge.rem) —
    // mirror the client's checkbox choice when it echoes it in the body.
    const remembered = b['remember'] === true;
    setAdminSessionCookies(res, result.accessToken, result.refreshToken, {
      refreshMaxAgeSeconds: remembered ? 30 * 24 * 60 * 60 : undefined,
    });
  }
  return res;
}
