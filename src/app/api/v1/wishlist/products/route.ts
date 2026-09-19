import { NextRequest, NextResponse } from 'next/server';

import { getCustomerFromToken } from '@/api/customerAuth';
import { getWishlistProducts } from '@/lib/data';

export const dynamic = 'force-dynamic';

const COOKIE = 'nk_session';

/**
 * GET /api/v1/wishlist/products — the caller's wished products as full
 * catalog items (profile รายการโปรด tab). Same shape as /api/v1/products.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE)?.value;
  const session = token ? await getCustomerFromToken(token) : null;
  if (!session) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  const products = await getWishlistProducts(session.id);
  return NextResponse.json({ products, total: products.length });
}
