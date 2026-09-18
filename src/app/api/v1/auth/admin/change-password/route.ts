import { NextRequest, NextResponse } from 'next/server';

import { changeAdminPassword } from '@/api/adminAuth';
import { verifyAdminJwt } from '@/lib/jwt';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * POST /api/v1/auth/admin/change-password — self-service password change.
 * Requires only authentication, NOT settings:write: every admin must be able
 * to rotate their own password (including limited roles that are forced to
 * change it on first login), and the target is always the caller — the id
 * comes from the verified JWT, never from the request body. Changing other
 * accounts' passwords remains a staff:write operation handled elsewhere.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const payload = await verifyAdminJwt(token);
  if (!payload?.sub) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const adminId = payload.sub;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const currentPassword = typeof b['currentPassword'] === 'string' ? b['currentPassword'] : '';
  const newPassword = typeof b['newPassword'] === 'string' ? b['newPassword'] : '';
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'PASSWORDS_REQUIRED' }, { status: 400 });
  }

  const result = await changeAdminPassword(adminId, currentPassword, newPassword);
  if (!result.success) {
    const status =
      result.error === 'USER_NOT_FOUND'
        ? 404
        : result.error === 'CURRENT_PASSWORD_INCORRECT' || result.error === 'PASSWORD_TOO_SHORT'
          ? 400
          : 500;
    return NextResponse.json({ success: false, error: result.error }, { status });
  }
  return NextResponse.json({ success: true, sessionsRevoked: true });
}
