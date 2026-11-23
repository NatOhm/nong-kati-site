/**
 * POST /api/v1/internal/orders/slip-recheck — re-check bank-delayed slips.
 *
 * Bangkok Bank / GSB publish a transfer 2–3 minutes late, so `SLIP_DELAYED` is
 * the normal first answer for a real slip. The customer-facing panel retries
 * only while the tab is open; this sweep is the durable half (the fast path is
 * `scheduleSlipRecheck()` right after the verdict), so a closed tab still ends
 * in an auto-confirmed order instead of a manual queue entry.
 *
 * Auth + shape mirror the sibling housekeeping sweeps (`orders/expire`,
 * `email-outbox/drain`): `NK_CRON_SECRET` via `x-cron-token` / `x-outbox-token`
 * / Bearer, timing-safe, admin JWT accepted for a panel-triggered run, and an
 * unconfigured secret fails CLOSED (503) — an unauthenticated caller would
 * spend the shop's verification credits.
 *
 * Re-running is always safe: the per-attempt claim CAS means one tick pays for
 * one check, and an attempt that is no longer `SLIP_DELAYED`, whose order is no
 * longer payable, or whose retry budget is spent is skipped.
 */
import { NextRequest, NextResponse } from 'next/server';

import { constantTimeEquals } from '@/lib/crypto';
import { recheckDelayedSlips, SLIP_RECHECK_BATCH } from '@/lib/slipRecheck';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env['NK_CRON_SECRET'];
  if (!secret) {
    return NextResponse.json({ error: 'SWEEP_DISABLED' }, { status: 503 });
  }

  const bearer = req.headers.get('authorization');
  const headerToken =
    req.headers.get('x-cron-token') ?? req.headers.get('x-outbox-token') ?? '';
  const bearerToken = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  const token = headerToken || bearerToken;

  let authenticated = Boolean(token) && constantTimeEquals(token, secret);

  if (!authenticated && bearerToken) {
    // Fall back to an admin JWT (panel-triggered sweep).
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

  const limitParam = Number(req.nextUrl.searchParams.get('batch') ?? String(SLIP_RECHECK_BATCH));
  const batchSize = Number.isFinite(limitParam)
    ? Math.min(Math.max(1, Math.floor(limitParam)), 100)
    : SLIP_RECHECK_BATCH;

  const result = await recheckDelayedSlips({ batchSize });
  return NextResponse.json({ ok: true, ...result });
}
