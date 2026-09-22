import { NextRequest, NextResponse } from 'next/server';

import { queryAuditLog } from '@/lib/auditLog';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/admin/audit-log — paginated, filterable audit trail from the
 * AuditLog table (review M5: was browser-side in-memory mock data).
 * Requires `audit:read`; export requires `audit:export`.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
  const check = await checkPermission(token, 'audit:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const actorType = sp.get('actorType') ?? undefined;
  const actorId = sp.get('actorId') ?? undefined;
  const action = sp.get('action') ?? undefined;
  const tableName = sp.get('tableName') ?? undefined;
  const recordId = sp.get('recordId') ?? undefined;
  const dateFrom = sp.get('dateFrom') ?? undefined;
  const dateTo = sp.get('dateTo') ?? undefined;
  const result = await queryAuditLog({
    page: Number(sp.get('page') ?? '1') || 1,
    pageSize: Number(sp.get('pageSize') ?? '20') || 20,
    ...(actorType && { actorType }),
    ...(actorId && { actorId }),
    ...(action && { action }),
    ...(tableName && { tableName }),
    ...(recordId && { recordId }),
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
  });

  return NextResponse.json({
    entries: result.entries.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
    total: result.total,
  });
}
