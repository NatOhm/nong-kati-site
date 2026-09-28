import { NextRequest, NextResponse } from 'next/server';

import { adminLogin } from '@/api/adminAuth';
import { guardAdminAuthMutation } from '@/lib/adminRequest';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/admin/login — step 1: email + password (08-auth.md §5.1).
 * Returns a challenge token for the TOTP step. Generic errors prevent
 * account enumeration.
 *
 * CSRF: login is a session-fixation vector too (login-CSRF) — the origin
 * check applies even though the caller holds no session yet. The
 * double-submit layer is NOT required here: API clients and the test
 * suites authenticate machine-to-machine without browser cookies, and a
 * browser attacker is already blocked by the origin check.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const csrfBlock = guardAdminAuthMutation(req, false);
  if (csrfBlock) return csrfBlock;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b['email'] === 'string' ? b['email'] : '';
  const password = typeof b['password'] === 'string' ? b['password'] : '';
  const remember = b['remember'] === true;
  if (!email || !password) {
    return NextResponse.json({ error: 'EMAIL_AND_PASSWORD_REQUIRED' }, { status: 400 });
  }

  const result = await adminLogin(email, password, remember);
  return NextResponse.json(result, { status: result.success ? 200 : 401 });
}
