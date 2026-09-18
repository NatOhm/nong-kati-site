import { NextRequest, NextResponse } from 'next/server';

import { refreshAdminSession } from '@/api/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/admin/refresh — exchange a refresh token for a new
 * 15-minute access JWT. The refresh token is rotated on every use: the old
 * row is revoked and a fresh opaque token is returned alongside the access
 * JWT. Invalid, expired or already-rotated tokens return 401 TOKEN_INVALID.
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

  const result = await refreshAdminSession(refreshToken);
  return NextResponse.json(result, { status: result.success ? 200 : 401 });
}
