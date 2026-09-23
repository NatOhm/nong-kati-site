import { NextRequest, NextResponse } from 'next/server';

import {
  OAUTH_STATE_COOKIE,
  STATE_COOKIE_MAX_AGE,
  buildAuthorizeUrl,
  createState,
  isOAuthProvider,
  isProviderConfigured,
} from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/auth/oauth/[provider] — start social sign-in.
 * Redirects to the provider's consent page. `?next=` (same-site relative)
 * rides along in the state cookie so the callback can land the customer
 * where they were heading. Unconfigured provider → 503 (UI hides it too).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } },
): Promise<NextResponse> {
  const { provider } = params;
  if (!isOAuthProvider(provider) || !isProviderConfigured(provider)) {
    return NextResponse.json({ error: 'PROVIDER_UNAVAILABLE' }, { status: 503 });
  }

  // Only same-site relative next paths (no open redirect), matching the
  // password login's safeNext().
  const nextParam = req.nextUrl.searchParams.get('next') ?? '/account/dashboard';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/account/dashboard';

  const state = createState();
  const authorizeUrl = buildAuthorizeUrl({ provider, req, state });

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(OAUTH_STATE_COOKIE, `${state}|${next}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_COOKIE_MAX_AGE,
    path: '/',
  });
  return res;
}
