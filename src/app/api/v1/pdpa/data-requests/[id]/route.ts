import { NextRequest, NextResponse } from 'next/server';

import { updateDataRequest, type DataRequestStatus } from '@/api/dataRequests';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * PATCH /api/v1/pdpa/data-requests/[id] — admin status update (pdpa:action).
 * Every transition is audit-logged inside updateDataRequest.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'pdpa:action');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const status = typeof b['status'] === 'string' ? b['status'] : '';
  if (!status) return NextResponse.json({ error: 'MISSING_STATUS' }, { status: 400 });

  const { id } = await params;
  const adminNotes = typeof b['adminNotes'] === 'string' ? b['adminNotes'] : undefined;
  const result = await updateDataRequest(
    id,
    {
      status: status as DataRequestStatus,
      ...(adminNotes !== undefined ? { adminNotes } : {}),
    },
    check.payload?.sub ?? 'unknown',
    check.payload?.email ?? '',
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'UPDATE_FAILED' }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
