import { NextRequest, NextResponse } from 'next/server';

import { normalizeThaiPhone, verifyPhoneOtp } from '@/api/phoneOtp';
import { getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/phone-otp/verify — finish phone sign-in.
 * Body: { phone, code }
 *
 * Verifies the single-use 6-digit code (max 5 attempts per code), finds or
 * creates the customer by phoneNumber, then sets the same nk_session cookie
 * as password/OAuth/magic-link login.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let phoneRaw = '';
  let code = '';
  try {
    const body = (await req.json()) as { phone?: unknown; code?: unknown };
    phoneRaw = String(body.phone ?? '');
    code = String(body.code ?? '');
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const phone = normalizeThaiPhone(phoneRaw);
  if (!phone) {
    return NextResponse.json({ error: 'INVALID_PHONE' }, { status: 400 });
  }

  const result = await verifyPhoneOtp({ phoneE164: phone, code, ipAddress: getClientIp(req) });
  if (!result.ok) {
    const status =
      result.error === 'ACCOUNT_BLOCKED' ? 423 : result.error === 'TOO_MANY_ATTEMPTS' ? 429 : 401;
    return NextResponse.json({ error: result.error }, { status });
  }

  const res = NextResponse.json({
    success: true,
    customer: {
      id: result.session.customerId,
      email: result.session.email,
      fullName: result.session.fullName,
    },
    isNewAccount: result.session.isNewAccount,
  });
  res.cookies.set('nk_session', result.session.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: result.session.expiresIn,
    path: '/',
  });
  return res;
}
