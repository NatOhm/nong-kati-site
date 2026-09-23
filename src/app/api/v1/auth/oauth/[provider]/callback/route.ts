import { NextRequest, NextResponse } from 'next/server';

import { loginOrCreateCustomerViaOAuth } from '@/api/customerAuth';
import {
  OAUTH_STATE_COOKIE,
  exchangeCodeForProfile,
  isOAuthProvider,
  isProviderConfigured,
  verifyState,
} from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/auth/oauth/[provider]/callback — finish social sign-in.
 * Validates state (CSRF + TTL), exchanges the code, upserts the customer,
 * sets the same nk_session cookie as password login, then redirects to the
 * stored ?next= destination. Every failure lands on the login page with an
 * error flag — no data, no session.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } },
): Promise<NextResponse> {
  const loginUrl = new URL('/account/login', req.url);
  const fail = (reason: string): NextResponse =>
    NextResponse.redirect(`${loginUrl}?oauth=${reason}`);

  const { provider } = params;
  if (!isOAuthProvider(provider) || !isProviderConfigured(provider)) return fail('unavailable');

  const stateCookie = req.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null;
  const [stateValue, next = '/account/dashboard'] = (stateCookie ?? '').split('|');
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');

  if (req.nextUrl.searchParams.get('error')) return fail('denied');
  if (!code || !verifyState(state, stateValue ?? null)) return fail('state');

  const profile = await exchangeCodeForProfile({ provider, req, code });
  if (!profile) return fail('exchange');

  const result = await loginOrCreateCustomerViaOAuth({
    email: profile.email,
    emailVerified: profile.emailVerified,
    fullName: profile.name,
    provider,
  });
  if (!result.success || !result.data) {
    return fail(result.error === 'ACCOUNT_BLOCKED' ? 'blocked' : 'failed');
  }

  const res = NextResponse.redirect(new URL(next, req.url));
  res.cookies.set('nk_session', result.data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: result.data.expiresIn,
    path: '/',
  });
  // Consume the one-time state cookie.
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}
