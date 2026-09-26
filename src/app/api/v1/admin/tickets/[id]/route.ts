import { NextRequest, NextResponse } from 'next/server';

import { adminGetTicket, adminUpdateTicket, type TicketAction } from '@/api/supportTickets';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/admin/tickets/[id] — full ticket incl. reply thread
 * (tickets:read).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'tickets:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const found = await adminGetTicket(id);
  if (!found) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ticket: found.ticket });
}

/**
 * PATCH /api/v1/admin/tickets/[id] — reply / close / reopen (tickets:write).
 * Body: { action: 'reply', reply } | { action: 'close' } | { action: 'reopen' }
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'tickets:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  let body: { action?: unknown; reply?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const action = body.action as TicketAction;
  if (action !== 'reply' && action !== 'close' && action !== 'reopen') {
    return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
  }
  if (action === 'reply' && (typeof body.reply !== 'string' || !body.reply.trim())) {
    return NextResponse.json({ error: 'REPLY_REQUIRED' }, { status: 400 });
  }

  const me = await checkPermission(token, 'tickets:write');
  if (!me.payload?.sub) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const result = await adminUpdateTicket(
    id,
    action,
    typeof body.reply === 'string' ? body.reply : undefined,
    me.payload.sub,
  );
  if ('error' in result) {
    const status = result.error === 'NOT_FOUND' ? 404 : result.error === 'BAD_STATE' ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
