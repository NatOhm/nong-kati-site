import { NextRequest, NextResponse } from 'next/server';
import { registerCustomer, loginCustomer } from '@/api/customerAuth';

const COOKIE = 'nk_session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fullName = body.fullName ? String(body.fullName) : undefined;
    const registerParams: Parameters<typeof registerCustomer>[0] = {
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      marketingOptIn: Boolean(body.marketingOptIn),
    };
    if (fullName !== undefined) registerParams.fullName = fullName;
    const result = await registerCustomer(registerParams);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Auto-login on successful registration
    const login = await loginCustomer({
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      rememberMe: true,
    });

    const res = NextResponse.json({
      success: true,
      customerId: result.data?.customerId,
      email: result.data?.email,
    });
    if (login.success && login.data) {
      res.cookies.set(COOKIE, login.data.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: login.data.expiresIn,
        path: '/',
      });
    }
    return res;
  } catch {
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
