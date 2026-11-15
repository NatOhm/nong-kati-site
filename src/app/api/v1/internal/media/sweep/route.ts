/**
 * POST /api/v1/internal/media/sweep — delete image files nothing references.
 *
 * Product photos live on disk under `NK_MEDIA_DIR` (`src/lib/imageStore.ts`),
 * but replacing a product photo only rewrites `Product.imageUrl`: the old file
 * stays forever. The upload route prunes opportunistically after each upload,
 * which means a shop nobody edits never reclaims a replaced photo — and every
 * deploy/backup then carries the dead bytes. This endpoint is that same rule
 * set as a sweep: compare the directory with every reference (`Product.imageUrl`
 * and any non-`image:` `SiteSetting` value), and delete what nothing points at.
 *
 * Safety:
 *   · **dry run by default** — a first run only reports `orphans`; `?apply=1`
 *     deletes. A cron learns the shape before it is allowed to remove anything.
 *   · a file whose name is not a valid image key is never a candidate (a stray
 *     `.partial` or an operator's note is not ours), and anything modified in
 *     the last 24 hours is kept — the admin uploads first, saves afterwards.
 *   · the sweep is idempotent: a second run finds nothing, and a file that is
 *     referenced is never touched, so re-running cannot break a product page.
 *
 * Auth mirrors the sibling internal sweeps: `NK_CRON_SECRET` via `x-cron-token`
 * (or `x-outbox-token` / Bearer), timing-safe; an unconfigured secret fails
 * CLOSED with 503 so nobody can delete media unauthenticated.
 *
 * Scheduled by the daily tick of `.github/workflows/prod-health-monitor.yml`
 * (`?apply=1`), next to the 30-day slip retention: both are directory/storage
 * housekeeping, not per-order work.
 */
import { NextRequest, NextResponse } from 'next/server';

import { constantTimeEquals } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { sweepMediaOrphans } from '@/lib/imageCleanup';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env['NK_CRON_SECRET'];
  if (!secret) {
    // Not configured → disabled, fail-closed: unauthenticated deletion would
    // let anyone wipe the shop's product images.
    return NextResponse.json({ error: 'SWEEP_DISABLED' }, { status: 503 });
  }

  const bearer = req.headers.get('authorization');
  const headerToken =
    req.headers.get('x-cron-token') ?? req.headers.get('x-outbox-token') ?? '';
  const bearerToken = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  const token = headerToken || bearerToken;

  if (!token || !constantTimeEquals(token, secret)) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const apply = ['1', 'true'].includes(
    (req.nextUrl.searchParams.get('apply') ?? '').toLowerCase(),
  );

  const result = await sweepMediaOrphans(prisma, { apply });
  return NextResponse.json({ ok: true, ...result });
}
