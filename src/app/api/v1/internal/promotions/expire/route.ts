import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { notifyPromotionExpired } from '@/lib/notify';

/**
 * POST /api/v1/internal/promotions/expire — promotion expiry tick.
 *
 * Marks promotions whose expiresAt has passed as inactive and sends
 * Discord notifications. Auth + shape mirror the sibling order-expiry
 * route exactly: NK_CRON_SECRET is canonical, admin JWTs are accepted
 * so the panel can trigger a run, and an unconfigured secret fails CLOSED
 * (503) rather than letting an unauthenticated caller expire promotions.
 *
 * Manual re-runs are always safe — the sweep is a status CAS, so
 * concurrent ticks never double-transition one promotion.
 */
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
    // Not configured → disabled, fail-closed. Expiring promotions
    // unauthenticated would let anyone deactivate live promotions.
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

  const now = new Date();

  // Find promotions that have expired and are still marked active
  const expiredPromotions = await prisma.promotion.findMany({
    where: {
      isActive: true,
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      name: true,
      discountType: true,
      discountValue: true,
    },
  });

  if (expiredPromotions.length === 0) {
    return NextResponse.json({
      scanned: 0,
      expired: 0,
      message: 'No promotions to expire',
    });
  }

  // Mark them as inactive
  const ids = expiredPromotions.map((p: { id: string }) => p.id);
  await prisma.promotion.updateMany({
    where: { id: { in: ids } },
    data: { isActive: false },
  });

  // Send Discord notifications (fire-and-forget, failures are OK)
  for (const promo of expiredPromotions) {
    try {
      await notifyPromotionExpired({
        promotionName: promo.name,
        discountType: promo.discountType as 'percent' | 'amount',
        discountValue: Number(promo.discountValue),
      });
    } catch {
      // Notification failures don't break the expiry process
    }
  }

  return NextResponse.json({
    scanned: expiredPromotions.length,
    expired: expiredPromotions.length,
    expiredIds: ids,
  });
}
