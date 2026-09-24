import { NextRequest, NextResponse } from 'next/server';

import { getAdminUserById } from '@/api/adminAuth';
import { verifyAdminJwt } from '@/lib/jwt';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/auth/admin/me — profile of the authenticated admin, resolved
 * from the DB (source of truth for role/status). Used by the management UI
 * to render role-gated chrome and to test RBAC surface behavior.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const header = req.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const payload = await verifyAdminJwt(token);
  if (!payload) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const user = await getAdminUserById(payload.sub);
  if (!user) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
  if (user.status !== 'active') {
    return NextResponse.json({ error: 'ACCOUNT_DEACTIVATED' }, { status: 403 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    // Recent-activity block in the profile popover (ISO timestamps; the
    // client formats them).
    lastLoginAt: user.lastLoginAt,
    activeSessions: user.activeSessions,
  });
}
