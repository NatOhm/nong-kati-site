import { NextRequest, NextResponse } from 'next/server';

import { getCustomerFromToken } from '@/api/customerAuth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const COOKIE = 'nk_session';

async function requireCustomer(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;
  return getCustomerFromToken(token);
}

/**
 * Live promo notifications (storefront bell) — no mock data.
 * The items ARE the currently-active coupons (percent/amount promos),
 * rendered fresh on every open, so nothing can go stale. The only stored
 * state is NotificationRead (per customer per coupon) powering the unread
 * badge; guests see the list with no read-tracking.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const now = new Date();

  const coupons = await prisma.coupon.findMany({
    where: {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
    select: {
      id: true,
      code: true,
      description: true,
      discountType: true,
      discountValue: true,
      minSpendThb: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // Read state only matters for signed-in customers.
  const session = await requireCustomer(req);
  let readCouponIds: string[] = [];
  if (session && coupons.length > 0) {
    const reads = await prisma.notificationRead.findMany({
      where: { customerId: session.id, couponId: { in: coupons.map((c) => c.id) } },
      select: { couponId: true },
    });
    readCouponIds = reads.map((r) => r.couponId);
  }

  const items = coupons.map((c) => {
    const value =
      c.discountType === 'percent'
        ? `${Number(c.discountValue).toLocaleString('th-TH')}%`
        : `${Number(c.discountValue).toLocaleString('th-TH')}฿`;
    return {
      id: c.id,
      code: c.code,
      title: `โปรโมชั่น: ส่วนลด ${value}`,
      body:
        c.description ??
        `ใช้โค้ด ${c.code} รับส่วนลด ${value}${
          c.minSpendThb && Number(c.minSpendThb) > 0
            ? ` เมื่อซื้อครบ ${Number(c.minSpendThb).toLocaleString('th-TH')}฿`
            : ''
        }`,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      read: readCouponIds.includes(c.id),
    };
  });

  return NextResponse.json({ items, unread: items.filter((i) => !i.read).length });
}

/** POST — mark every currently-visible promo as read for this customer. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireCustomer(req);
  if (!session) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  const now = new Date();
  const coupons = await prisma.coupon.findMany({
    where: {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
    select: { id: true },
  });
  if (coupons.length > 0) {
    await prisma.notificationRead.createMany({
      data: coupons.map((c) => ({ customerId: session.id, couponId: c.id })),
      skipDuplicates: true,
    });
  }
  return NextResponse.json({ success: true });
}
