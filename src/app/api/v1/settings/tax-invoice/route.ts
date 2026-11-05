import { NextResponse } from 'next/server';

import { getTaxInvoiceConfig } from '@/lib/taxInvoice';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/settings/tax-invoice — public: does checkout offer the
 * ใบกำกับภาษี request? The storefront needs the flag before a cart exists.
 */
export async function GET(): Promise<NextResponse> {
  const config = await getTaxInvoiceConfig();
  return NextResponse.json(
    { enabled: config.enabled },
    { headers: { 'cache-control': 'no-store' } },
  );
}
