import { NextRequest, NextResponse } from 'next/server';

import { getCustomerFromToken } from '@/api/customerAuth';
import { getWishlistProducts } from '@/lib/data';
import { prisma } from '@/lib/db';

const COOKIE = 'nk_session';

export const dynamic = 'force-dynamic';

async function requireCustomer(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;
  return getCustomerFromToken(token);
}

/**
 * GET /api/v1/wishlist — the caller's wishlist. Default returns productIds
 * plus full product items (profile รายการโปรด section); `?idsOnly=1`
 * returns just the ids for heart-state hydration on product grids.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireCustomer(req);
  if (!session) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }
  const idsOnly = req.nextUrl.searchParams.get('idsOnly') === '1';
  const counts = req.nextUrl.searchParams.get('counts') === '1';
  const rows = await prisma.wishlistItem.findMany({
    where: { customerId: session.id },
    select: { productId: true },
  });
  const productIds = rows.map((r) => r.productId);
  if (idsOnly) return NextResponse.json({ productIds, products: [] });
  if (counts) {
    const grouped = await prisma.wishlistItem.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _count: { productId: true },
    });
    return NextResponse.json({
      productIds,
      products: [],
      counts: Object.fromEntries(grouped.map((g) => [g.productId, g._count.productId])),
    });
  }
  const products = await getWishlistProducts(session.id);
  return NextResponse.json({ productIds, products });
}

/**
 * POST /api/v1/wishlist {productId} — toggle the wish (idempotent heart).
 * Returns the new state so the heart UI flips instantly.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireCustomer(req);
  if (!session) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  let body: { productId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'BAD_REQUEST' } }, { status: 400 });
  }
  const productId = typeof body.productId === 'string' ? body.productId : null;
  if (!productId) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST' } }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }

  const existing = await prisma.wishlistItem.findUnique({
    where: { customerId_productId: { customerId: session.id, productId } },
  });

  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
    const wishCount = await prisma.wishlistItem.count({ where: { productId } });
    return NextResponse.json({ wished: false, wishCount });
  }
  await prisma.wishlistItem.create({ data: { customerId: session.id, productId } });
  const wishCount = await prisma.wishlistItem.count({ where: { productId } });
  return NextResponse.json({ wished: true, wishCount });
}
