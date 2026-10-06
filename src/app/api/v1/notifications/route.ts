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
 * Combines active coupons (code-based) and promotions (automatic).
 * Rendered fresh on every open so nothing goes stale. The only stored
 * state is NotificationRead (per customer per coupon) powering the unread
 * badge; guests see the list with no read-tracking. Promotions aren't
 * tracked as read — they're automatic, always visible.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const now = new Date();

  // Active coupons (code-based)
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

  // Active promotions (automatic, no code needed)
  const promotions = await prisma.promotion.findMany({
    where: {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
    select: {
      id: true,
      name: true,
      description: true,
      discountType: true,
      discountValue: true,
      scope: true,
      productIds: true,
      minSpendThb: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // Read state only matters for signed-in customers (coupons only).
  const session = await requireCustomer(req);
  let readCouponIds: string[] = [];
  if (session && coupons.length > 0) {
    const reads = await prisma.notificationRead.findMany({
      where: { customerId: session.id, couponId: { in: coupons.map((c) => c.id) } },
      select: { couponId: true },
    });
    readCouponIds = reads.map((r) => r.couponId);
  }

  const items: Array<{
    id: string;
    code?: string;
    title: string;
    body: string;
    expiresAt: string | null;
    read: boolean;
  }> = [];

  // Coupons first (code-based, tracked as read)
  for (const c of coupons) {
    const value =
      c.discountType === 'percent'
        ? `${Number(c.discountValue).toLocaleString('th-TH')}%`
        : `${Number(c.discountValue).toLocaleString('th-TH')}฿`;
    items.push({
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
    });
  }

  // Promotions second (automatic, not tracked as read)
  for (const p of promotions) {
    const value =
      p.discountType === 'percent'
        ? `${Number(p.discountValue).toLocaleString('th-TH')}%`
        : `${Number(p.discountValue).toLocaleString('th-TH')}฿`;
    const scopeLabel =
      p.scope === 'all'
        ? 'ทุกสินค้า'
        : p.productIds && p.productIds.trim()
            ? `${JSON.parse(p.productIds).length} สินค้า`
            : 'สินค้าเจาะจง';
    items.push({
      id: p.id,
      title: `ส่วนลดอัตโนมัติ: ${p.name}`,
      body:
        p.description ??
        `ลด ${value} สำหรับ ${scopeLabel}${
          p.minSpendThb && Number(p.minSpendThb) > 0
            ? ` (ขั้นต่ำ ${Number(p.minSpendThb).toLocaleString('th-TH')}฿)`
            : ''
        }`,
      expiresAt: p.expiresAt?.toISOString() ?? null,
      read: false, // promotions are automatic — always show as new
    });
  }

  return NextResponse.json({
    items,
    unread: items.filter((i) => !i.read).length,
  });
}

/** POST — mark every currently-visible coupon as read for this customer. */
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
