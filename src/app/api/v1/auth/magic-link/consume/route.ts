import { NextRequest, NextResponse } from 'next/server';

import { consumeMagicLinkToken } from '@/api/magicLink';
import { getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const COOKIE = 'nk_session';

/**
 * POST /api/v1/auth/magic-link/consume — trade a magic link token for a
 * session cookie. Body: { token }
 *
 * Single-use and expiry-enforced at the service layer; a consumed/expired/
 * unknown token maps to distinct, user-fixable UI states without leaking
 * whether an address has an account (the token itself is the capability).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let rawToken = '';
  try {
    const body = (await req.json()) as { token?: unknown };
    rawToken = String(body.token ?? '');
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  if (!rawToken) {
    return NextResponse.json({ error: 'TOKEN_REQUIRED' }, { status: 400 });
  }

  const result = await consumeMagicLinkToken({
    rawToken,
    ipAddress: getClientIp(req),
  });

  if (!result.ok) {
    const status = result.error === 'ACCOUNT_BLOCKED' ? 423 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  const res = NextResponse.json({
    success: true,
    customer: {
      id: result.session.customerId,
      email: result.session.email,
      fullName: result.session.fullName,
    },
  });
  res.cookies.set(COOKIE, result.session.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: result.session.expiresIn,
    path: '/',
  });
  return res;
}
