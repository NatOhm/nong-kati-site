import { NextRequest, NextResponse } from 'next/server';

import { getSearchSuggestions } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/search/suggest?q=… — Google-style dropdown data.
 * Returns up to 6 active products whose name or alias contains the query,
 * each with its category label. Never throws — an empty list is a fine
 * answer for a bad query.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ suggestions: [] });

  try {
    const suggestions = await getSearchSuggestions(q, 6);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
