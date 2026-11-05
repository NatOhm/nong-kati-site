import { NextResponse } from 'next/server';

import { getCategoriesWithProductCounts } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/categories — public category tree (roots with nested children,
 * each carrying its live product count). Already rate-limited in
 * lib/rateLimit.ts, but the route never existed.
 *
 * Added for the mobile drawer (client feedback 2026-11-02: "3 ขีดไม่ซิงก์
 * หมวดหมู่"): the drawer hardcoded four category links whose slugs (movie-series,
 * music, chinese-apps, editing) do not exist, so every one of them 404'd and
 * nothing followed an admin's category changes. One reader now serves the
 * homepage cards and the drawer, so they cannot disagree again.
 *
 * A failed query answers 500 rather than an empty 200: the drawer already
 * renders without a category section, and a fake "no categories" would hide a
 * real outage.
 */
export async function GET(): Promise<NextResponse> {
  const categories = await getCategoriesWithProductCounts();
  return NextResponse.json({ categories });
}
