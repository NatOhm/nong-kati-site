import { NextRequest, NextResponse } from 'next/server';

import { confirm2fa, setup2fa } from '@/api/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/admin/2fa — step 2: TOTP (08-auth.md §5.2).
 * Body {challengeToken, action: 'setup'} hands out QR/secret/backup codes;
 * body {challengeToken, code} verifies the code and issues the session.
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

  const code = typeof b['code'] === 'string' ? b['code'] : '';
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'TOTP_INVALID' }, { status: 401 });
  }

  const result = await confirm2fa(challengeToken, code);
  return NextResponse.json(result, { status: result.success ? 200 : 401 });
}
