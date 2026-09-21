import { NextRequest, NextResponse } from 'next/server';

import { adminListCustomers } from '@/api/adminCustomers';
import { maskEmail, checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/admin/customers — paged customer list with aggregates
 * (customers:read). Supports ?q= email/name search and ?status= filter.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'customers:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get('q');
  const status = req.nextUrl.searchParams.get('status');
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(req.nextUrl.searchParams.get('pageSize') ?? '20') || 20),
  );

  const result = await adminListCustomers({
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    page,
    pageSize,
  });
  // Review #3: same permission-based PII shaping as the detail route.
  const fullAccess = check.payload!.perms.includes('customers:read:full');
  return NextResponse.json({
    ...result,
    data: result.data.map((customer) => ({
      ...customer,
      email: fullAccess ? customer.email : maskEmail(customer.email),
    })),
  });
}
