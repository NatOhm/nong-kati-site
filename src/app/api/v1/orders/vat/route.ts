import { NextResponse } from 'next/server';

import { getVatConfig } from '@/lib/promotions';

export const dynamic = 'force-dynamic';

/** Public storefront VAT display config. Totals remain server-authoritative. */
export async function GET(): Promise<NextResponse> {
  const config = await getVatConfig();
  return NextResponse.json(config, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
