import { NextRequest, NextResponse } from 'next/server';

import { getCustomerFromToken } from '@/api/customerAuth';
import { getWishlistIds } from '@/lib/data';

export const dynamic = 'force-dynamic';

const COOKIE = 'nk_session';

/**
 * GET /api/v1/wishlist/ids — just the productIds the caller has wished,
 * for heart-state hydration on product grids.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE)?.value;
  const session = token ? await getCustomerFromToken(token) : null;
  if (!session) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  const productIds = await getWishlistIds(session.id);
  return NextResponse.json({ productIds });
}
