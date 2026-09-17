import { NextResponse } from 'next/server';

import { getAnnouncement } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/announcement — public read of the storefront announcement bar.
 */
export async function GET(): Promise<NextResponse> {
  const announcement = await getAnnouncement();
  return NextResponse.json(announcement);
}
