import { NextRequest, NextResponse } from 'next/server';

import {
  adminChangeStaffRole,
  adminDeactivateStaff,
  adminResetStaffPassword,
  adminUnlockStaff,
} from '@/api/adminStaff';
import { checkPermission } from '@/lib/rbac';
import type { AdminRole } from '@/types/auth';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

function status(result: { success?: boolean; error?: string }): number {
  if (result.success) return 200;
  if (result.error === 'STAFF_NOT_FOUND') return 404;
  if (result.error === 'CANNOT_MODIFY_SELF' || result.error === 'LAST_SUPER_ADMIN') return 409;
  return 400;
}

/**
 * PATCH /api/v1/admin/staff/[id] — role change or (de)activate.
 * Body {action:'role', role} needs staff:write; {action:'deactivate', deactivate}
 * needs staff:deactivate.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const { id } = await ctx.params;
  const action = b['action'];

  if (action === 'role') {
    const check = await checkPermission(token, 'staff:write');
    if (!check.allowed)
      return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
    if (!check.payload) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    const role = typeof b['role'] === 'string' ? (b['role'] as AdminRole) : '';
    if (!role) return NextResponse.json({ error: 'ROLE_REQUIRED' }, { status: 400 });
    const result = await adminChangeStaffRole(id, role, check.payload.sub, check.payload.email);
    return NextResponse.json(result, { status: status(result) });
  }

  if (action === 'deactivate') {
    const check = await checkPermission(token, 'staff:deactivate');
    if (!check.allowed)
      return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
    if (!check.payload) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    const deactivate = b['deactivate'] !== false;
    const result = await adminDeactivateStaff(
      id,
      deactivate,
      check.payload.sub,
      check.payload.email,
    );
    return NextResponse.json(result, { status: status(result) });
  }

  return NextResponse.json({ error: 'ACTION_REQUIRED' }, { status: 400 });
}

/**
 * POST /api/v1/admin/staff/[id] — staff:reset-2fa guardrail group:
 * Body {action:'reset-password'} mints a new temp password (shown once);
 * {action:'unlock'} clears lockout + failed counters.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'staff:reset-2fa');
  if (!check.allowed)
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  if (!check.payload) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const { id } = await ctx.params;

  if (b['action'] === 'reset-password') {
    const result = await adminResetStaffPassword(id, check.payload.sub, check.payload.email);
    return NextResponse.json(result, {
      status:
        'error' in result
          ? result.error === 'STAFF_NOT_FOUND'
            ? 404
            : result.error === 'CANNOT_MODIFY_SELF'
              ? 409
              : 400
          : 200,
    });
  }
  if (b['action'] === 'unlock') {
    const result = await adminUnlockStaff(id, check.payload.sub, check.payload.email);
    return NextResponse.json(result, { status: status(result) });
  }
  return NextResponse.json({ error: 'ACTION_REQUIRED' }, { status: 400 });
}
