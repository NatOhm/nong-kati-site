/**
 * POST /api/v1/internal/email-outbox/drain — delivery worker tick.
 *
 * Outbox rows are written tx-bound inside the fulfilment transaction
 * (audit #2); delivery is decoupled. On serverless there is no long-lived
 * worker, so delivery runs in three complementary ways:
 *   1. `after()` drain scheduled by every enqueue (primary, best-effort);
 *   2. an external cron pinging this endpoint (recovery for anything the
 *      after()-drain missed — serverless freeze, crash, provider outage);
 *   3. manual re-runs are always safe: claiming is a status CAS, so
 *      concurrent ticks never double-send one row.
 *
 * Auth: shared secret header `x-outbox-token` (or Authorization Bearer)
 * must equal NK_CRON_SECRET; admin JWTs are also accepted so the panel can
 * trigger a drain without holding the cron secret. Returns per-run
 * counters for observability.
 */
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { processDueEmails } from '@/lib/email/outbox';

export const dynamic = 'force-dynamic';

function timingSafeEqualShim(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env['NK_CRON_SECRET'];
  if (!secret) {
    // Not configured → disabled, fail-closed (no unauthenticated draining).
    return NextResponse.json({ error: 'OUTBOX_DISABLED' }, { status: 503 });
  }

  const bearer = req.headers.get('authorization');
  const headerToken = req.headers.get('x-outbox-token') ?? '';
  const bearerToken = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  const token = headerToken || bearerToken;

  let authenticated = Boolean(token) && timingSafeEqualShim(token, secret);

  if (!authenticated && bearerToken) {
    // Fall back to an admin JWT (panel-triggered drain).
    try {
      const { verifyAdminJwt } = await import('@/lib/jwt');
      const payload = await verifyAdminJwt(bearerToken);
      authenticated = Boolean(payload);
    } catch {
      authenticated = false;
    }
  }

  if (!authenticated) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(1, Math.floor(limitParam)), 100)
    : 20;

  const stats = await processDueEmails(limit);
  const pendingRemaining = await prisma.emailOutbox.count({ where: { status: 'pending' } });
  const failedRemaining = await prisma.emailOutbox.count({ where: { status: 'failed' } });

  return NextResponse.json({
    ok: true,
    ...stats,
    pendingRemaining,
    failedRemaining,
  });
}
