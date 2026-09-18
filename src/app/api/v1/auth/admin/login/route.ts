import { NextRequest, NextResponse } from 'next/server';

import { adminLogin } from '@/api/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/admin/login — step 1: email + password (08-auth.md §5.1).
 * Returns a challenge token for the TOTP step. Generic errors prevent
 * account enumeration.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b['email'] === 'string' ? b['email'] : '';
  const password = typeof b['password'] === 'string' ? b['password'] : '';
  if (!email || !password) {
    return NextResponse.json({ error: 'EMAIL_AND_PASSWORD_REQUIRED' }, { status: 400 });
  }

  const result = await adminLogin(email, password);
  return NextResponse.json(result, { status: result.success ? 200 : 401 });
}
