import { NextRequest, NextResponse } from 'next/server';

import { adminBlockCustomer } from '@/api/adminCustomers';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * PATCH /api/v1/admin/customers/[id]/block — block/unblock a customer
 * account (customers:block). Body {blocked: boolean}; audited.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'customers:block');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const blocked = (body as Record<string, unknown>)['blocked'] === true;

  const { id } = await ctx.params;
  const result = await adminBlockCustomer(
    id,
    blocked,
    check.payload?.sub ?? 'unknown',
    check.payload?.email ?? 'unknown',
  );
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'BLOCK_FAILED' },
      { status: result.error === 'CUSTOMER_NOT_FOUND' ? 404 : 400 },
    );
  }
  return NextResponse.json({ success: true, status: result.status });
}
