import { NextResponse } from 'next/server';

import { getManualTransferInfo } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/payments/manual-info — public read of manual transfer
 * instructions (account name/number, promptpay/bank) that checkout renders
 * when the real Omise gateway is not implemented yet. Store owners edit the
 * content in the admin payment settings tab (SiteSetting 'manual-transfer').
 */
export async function GET(): Promise<NextResponse> {
  const info = await getManualTransferInfo();
  return NextResponse.json(info);
}
