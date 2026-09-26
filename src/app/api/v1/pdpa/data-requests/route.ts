import { NextRequest, NextResponse } from 'next/server';

import { listDataRequests, submitDataRequest, type DataRequestStatus } from '@/api/dataRequests';
import { checkPermission } from '@/lib/rbac';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * POST /api/v1/pdpa/data-requests — public submission.
 * Persists the request; success is returned only after the DB commit.
 * Per-IP throttle: 5 requests / 15 min (the form is a legal channel, not a
 * notification feed — enough for any real person).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const limited = await checkRateLimit(`pdpa_submit:${ip}`, '_pdpa', {
    route: '_pdpa_submit',
    maxRequests: 5,
    windowMs: 15 * 60_000,
    keyBy: 'ip' as const,
  });
  if (!limited.allowed) {
    return NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b['type'] !== 'string' || typeof b['email'] !== 'string') {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const result = await submitDataRequest({
    type: b['type'] as 'access' | 'correct' | 'delete' | 'port',
    email: b['email'],
    details: typeof b['details'] === 'string' ? b['details'] : '',
    ...(typeof b['fullName'] === 'string' ? { fullName: b['fullName'] } : {}),
    ...(typeof b['phone'] === 'string' ? { phone: b['phone'] } : {}),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'SUBMIT_FAILED' }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: result.data });
}

/**
 * GET /api/v1/pdpa/data-requests — admin list (pdpa:read).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'pdpa:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const validStatuses = ['pending', 'processing', 'completed', 'rejected'];
  const status: DataRequestStatus | undefined =
    statusParam && validStatuses.includes(statusParam)
      ? (statusParam as DataRequestStatus)
      : undefined;

  const result = await listDataRequests({ ...(status ? { status } : {}) });
  return NextResponse.json(result);
}
