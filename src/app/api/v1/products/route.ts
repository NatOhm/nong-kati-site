import { NextRequest, NextResponse } from 'next/server';

import { getCatalogProducts, type CatalogSort } from '@/lib/data';

export const dynamic = 'force-dynamic';

const SORTS: CatalogSort[] = [
  'featured',
  'available',
  'price-asc',
  'price-desc',
  'name-asc',
  'newest',
];

/**
 * GET /api/v1/products — the live catalog (profile สินค้าทั้งหมด /
 * แนะนำ tabs). Same data source as the /search page; active products only.
 *
 * `?available=1` drops sold-out products entirely; availability already
 * leads every sort, so an in-stock product is never buried by sold-out
 * ones on any other sort (review #3).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sortParam = req.nextUrl.searchParams.get('sort') ?? 'featured';
  const sort: CatalogSort = SORTS.includes(sortParam as CatalogSort)
    ? (sortParam as CatalogSort)
    : 'featured';
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1') || 1);
  const limit = Math.min(
    48,
    Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? '24') || 24),
  );
  const availableOnly = req.nextUrl.searchParams.get('available') === '1';

  const { products, total } = await getCatalogProducts(
    '',
    undefined,
    sort,
    page,
    limit,
    availableOnly,
  );

  return NextResponse.json({
    products,
    total,
    page,
    limit,
    availableOnly,
    hasMore: page * limit < total,
  });
}
