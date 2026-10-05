/**
 * POST /api/v1/internal/orders/expire — unpaid-order expiry tick.
 *
 * Checkout creates a `pending_payment` order before the customer commits to
 * a payment action, so abandoned checkouts leave real rows behind. Before
 * this endpoint nothing in the repository ever expired them (review
 * finding #2, 2026-10-05): `updateOrderStatus` permitted
 * `pending_payment → expired` but had no caller, and the inventory queue
 * documented in `src/lib/jobs/mockQueue.ts` had no registered handlers.
 *
 * Auth + shape mirror the sibling email-outbox drain route exactly: the
 * shared secret header must equal NK_CRON_SECRET, admin JWTs are accepted
 * so the panel can trigger a run without holding the cron secret, and an
 * unconfigured secret fails CLOSED (503) rather than letting an
 * unauthenticated caller expire live orders.
 *
 * Manual re-runs are always safe — the sweep is a status CAS, so
 * concurrent ticks never double-transition one order.
 */
import { NextRequest, NextResponse } from 'next/server';

import { expireUnpaidOrders } from '@/lib/orderExpiry';

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
    // Not configured → disabled, fail-closed. Expiring orders unauthenticated
    // would let anyone void live checkouts.
    return NextResponse.json({ error: 'SWEEP_DISABLED' }, { status: 503 });
  }

  const bearer = req.headers.get('authorization');
  // x-cron-token is canonical; x-outbox-token is accepted so an operator
  // reuses one header across both internal ticks.
  const headerToken =
    req.headers.get('x-cron-token') ?? req.headers.get('x-outbox-token') ?? '';
  const bearerToken = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  const token = headerToken || bearerToken;

  let authenticated = Boolean(token) && timingSafeEqualShim(token, secret);

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

  const limitParam = Number(req.nextUrl.searchParams.get('batch') ?? '100');
  const batchSize = Number.isFinite(limitParam)
    ? Math.min(Math.max(1, Math.floor(limitParam)), 500)
    : 100;

  const result = await expireUnpaidOrders({ batchSize });

  return NextResponse.json({ ok: true, ...result });
}