/**
 * POST /api/v1/internal/settings/slip-retention — prune old slip evidence.
 *
 * Slip uploads and every verify attempt upsert the image as base64 into
 * SiteSetting under a `slip:*` key (up to ~6.7 MB per row) and nothing ever
 * deleted them (audit finding 3, 2026-10-26): the table backs every page's
 * settings reads, it grew ~1–2 GB/month at 20–40 paid orders/day, and the
 * images carry bank account numbers (PDPA — that exposure grew with the rows).
 *
 * Retention is 30 days from LAST write: each verify re-touches the row, so a
 * still-contested slip is never pruned out from under the admin. After that
 * the download route answers 404 — the accepted trade-off, since dispute
 * evidence gets reviewed in the first days.
 *
 * Auth mirrors the sibling expiry sweeps (NK_CRON_SECRET via x-cron-token or
 * Bearer, timing-safe, unconfigured secret = 503 fail-closed); no admin-JWT
 * fallback because no panel action needs this sweep.
 *
 * Scheduled by .github/workflows/prod-health-monitor.yml on its DAILY tick —
 * the sweep filters on updatedAt, which is a full-table pass on shared
 * Postgres, so once a day (not every 10 minutes) is the right cadence.
 */
import { NextRequest, NextResponse } from 'next/server';

import { constantTimeEquals } from '@/lib/crypto';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Evidence (and payment data) older than this is deleted, not archived. */
const RETENTION_DAYS = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env['NK_CRON_SECRET'];
  if (!secret) {
    // Not configured → disabled, fail-closed: unauthenticated pruning would
    // let anyone destroy live payment evidence.
    return NextResponse.json({ error: 'RETENTION_DISABLED' }, { status: 503 });
  }

  const bearer = req.headers.get('authorization');
  // x-cron-token is canonical; x-outbox-token accepted so an operator reuses
  // one header across every internal tick.
  const headerToken =
    req.headers.get('x-cron-token') ?? req.headers.get('x-outbox-token') ?? '';
  const bearerToken = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  const token = headerToken || bearerToken;

  if (!token || !constantTimeEquals(token, secret)) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const { count } = await prisma.siteSetting.deleteMany({
    where: { key: { startsWith: 'slip:' }, updatedAt: { lt: cutoff } },
  });

  return NextResponse.json({ ok: true, deleted: count, cutoff: cutoff.toISOString() });
}
