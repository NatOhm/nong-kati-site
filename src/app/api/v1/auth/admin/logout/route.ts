import { NextRequest, NextResponse } from 'next/server';

import { adminLogout } from '@/api/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/admin/logout — revoke the given refresh token
 * server-side. Idempotent: unknown or already-revoked tokens still return
 * success so the client can always clear its storage.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const refreshToken = typeof b['refreshToken'] === 'string' ? b['refreshToken'] : '';
  if (!refreshToken) {
    return NextResponse.json({ error: 'REFRESH_TOKEN_REQUIRED' }, { status: 400 });
  }

  await adminLogout(refreshToken);
  return NextResponse.json({ success: true });
}
