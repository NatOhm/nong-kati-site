import { NextRequest, NextResponse } from 'next/server';

import { changeAdminPassword } from '@/api/adminAuth';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * POST /api/v1/auth/admin/change-password — self-service password change
 * for the authenticated admin (settings:write). Verifies the current
 * password, enforces the 12-character minimum, and revokes ALL sessions
 * (including the caller's) so every device re-authenticates with the new
 * password. The client must redirect to the login page after success.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'settings:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const adminId = check.payload?.sub;
  if (!adminId) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

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
