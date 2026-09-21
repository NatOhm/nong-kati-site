import { NextRequest, NextResponse } from 'next/server';

import { adminListTickets } from '@/api/supportTickets';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/admin/tickets — paged ticket list (tickets:read).
 * Supports ?status=open|answered|closed, ?q= search, ?page, ?pageSize.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'tickets:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const q = req.nextUrl.searchParams.get('q') ?? undefined;
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(req.nextUrl.searchParams.get('pageSize') ?? '50') || 50),
  );

  const result = await adminListTickets({
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
    page,
    pageSize,
  });
  return NextResponse.json(result);
}
