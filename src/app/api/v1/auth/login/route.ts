import { NextRequest, NextResponse } from 'next/server';
import { loginCustomer } from '@/api/customerAuth';

const COOKIE = 'nk_session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await loginCustomer({
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      rememberMe: Boolean(body.rememberMe),
    });

    if (!result.success || !result.data) {
      const status =
        result.error === 'ACCOUNT_LOCKED' || result.error === 'ACCOUNT_BLOCKED' ? 423 : 401;
      return NextResponse.json(
        { error: result.error, retryAfterMs: result.retryAfterMs },
        { status },
      );
    }

    const res = NextResponse.json({
      success: true,
      customer: {
        id: result.data.customerId,
        email: result.data.email,
        fullName: result.data.fullName,
      },
    });
    res.cookies.set(COOKIE, result.data.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: result.data.expiresIn,
      path: '/',
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
