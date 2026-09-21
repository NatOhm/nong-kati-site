import { NextRequest, NextResponse } from 'next/server';

import { adminCreateStaff, adminListStaff } from '@/api/adminStaff';
import { checkPermission } from '@/lib/rbac';
import type { AdminRole } from '@/types/auth';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/admin/staff — list all admin users (staff:read).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'staff:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const staff = await adminListStaff();
  return NextResponse.json({ items: staff });
}

/**
 * POST /api/v1/admin/staff — create a staff member (staff:write).
 * Body {email, fullName, role}; returns a temp password shown once.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'staff:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  if (!check.payload) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b['email'] === 'string' ? b['email'] : '';
  const fullName = typeof b['fullName'] === 'string' ? b['fullName'] : '';
  const role = typeof b['role'] === 'string' ? (b['role'] as AdminRole) : '';
  if (!email || !fullName || !role) {
    return NextResponse.json({ error: 'EMAIL_NAME_ROLE_REQUIRED' }, { status: 400 });
  }

  const result = await adminCreateStaff(
    { email, fullName, role },
    check.payload.sub,
    check.payload.email,
  );
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === 'EMAIL_ALREADY_EXISTS' ? 409 : 400 },
    );
  }
  return NextResponse.json(result, { status: 201 });
}
