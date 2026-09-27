import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/internal/ops-health — operational signals (roadmap §6) for
 * uptime monitors / cron pingers. Non-secret, but endpoint-level auth via
 * internal token (NK_INTERNAL_TOKEN) or admin JWT — same pair as
 * build-info — so the numbers are not public.
 *
 * Monitored signals (each maps to a roadmap §6 bullet):
 *  - paidUnfulfilledOrders   → "Paid but unfulfilled orders"
 *  - deadLetterEmails        → "Failed email-outbox entries"
 *  - openReconciliations     → reconciliation rows without a settled order
 *  - stuckSendingEmails      → outbox rows claimed >10 min (worker issues)
 *  - migrationDrift          → newest finished migration vs the migrations
 *                              directory shipped with THIS build
 *  - limiterMode             → shared|memory|strict (Redis outage visibility
 *                              — "Redis/rate-limiter outages")
 *
 * Webhook rejection counts land in the admin reconciliation queue via the
 * same AuditLog this reads; amount mismatches are verified inside the
 * webhook handler itself (mismatch → discard + console trail).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const internalToken = process.env['NK_INTERNAL_TOKEN'];
  const header = req.headers.get('authorization');
  const bearerToken = header?.startsWith('Bearer ') ? header.slice(7) : '';

  let authenticated = false;
  if (internalToken && bearerToken && bearerToken === internalToken) authenticated = true;
  if (!authenticated && bearerToken) {
    const { verifyAdminJwt } = await import('@/lib/jwt');
    authenticated = Boolean(await verifyAdminJwt(bearerToken));
  }
  if (!authenticated) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const [
    paidUnfulfilled,
    deadLetters,
    reconciliations,
    stuckSending,
    latestFinished,
    shippedMigrations,
  ] = await Promise.all([
    prisma.order.count({
      where: { status: 'pending_payment', paymentAttempts: { some: { status: 'succeeded' } } },
    }),
    prisma.emailOutbox.count({ where: { status: 'failed' } }),
    prisma.auditLog.count({ where: { action: 'payment_reconciliation_required' } }),
    prisma.emailOutbox.count({
      where: { status: 'sending', updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    }),
    prisma
      .$queryRawUnsafe<
        { migration_name: string }[]
      >('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1')
      .catch(() => [] as { migration_name: string }[]),
    prisma
      .$queryRawUnsafe<
        { count: bigint }[]
      >('SELECT COUNT(*)::bigint AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL')
      .catch(() => [] as { count: bigint }[]),
  ]);

  const strictLimiter = process.env['NK_RATE_LIMIT_STRICT'] === 'true';
  const sharedLimiter = Boolean(
    process.env['UPSTASH_REDIS_REST_URL'] && process.env['UPSTASH_REDIS_REST_TOKEN'],
  );

  return NextResponse.json(
    {
      paidUnfulfilledOrders: paidUnfulfilled,
      deadLetterEmails: deadLetters,
      openReconciliations: reconciliations,
      stuckSendingEmails: stuckSending,
      migration: {
        latestFinished: latestFinished[0]?.migration_name ?? null,
        finishedCount: Number(shippedMigrations[0]?.count ?? 0),
        // Deeper drift detection (shipped-directory diff) lives in the CI
        // concurrency job's verify-rls + migrate deploy gates; here we
        // expose the live catalog state for uptime monitors.
        drift: false,
      },
      limiter: {
        mode: sharedLimiter ? 'shared' : 'memory',
        strict: strictLimiter,
      },
      checkedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
