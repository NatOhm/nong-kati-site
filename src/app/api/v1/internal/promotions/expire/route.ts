import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { notifyPromotionExpired } from '@/lib/notify';

/**
 * POST /api/v1/internal/promotions/expire — promotion expiry tick.
 * Called by cron or manually. Marks expired promotions as inactive
 * and sends Discord notifications.
 *
 * Auth: x-cron-token or x-outbox-token (same as order expiry).
 */
export const dynamic = 'force-dynamic';

function getCronToken(req: NextRequest): string {
  return (
    req.headers.get('x-cron-token') ??
    req.headers.get('x-outbox-token') ??
    ''
  );
}

// In production, this would be a real cron secret from env.
const CRON_TOKEN = process.env['CRON_SECRET'] ?? '';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = getCronToken(req);

  // Allow unauthenticated in dev/test, but require token in production.
  if (process.env.NODE_ENV === 'production' && token !== CRON_TOKEN) {
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
