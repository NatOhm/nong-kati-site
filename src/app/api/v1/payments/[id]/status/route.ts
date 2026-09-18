import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/payments/[id]/status — poll a payment attempt.
 * Reads DB only (never re-queries the gateway live). Used by the checkout
 * page to detect webhook-confirmed payments and redirect to confirmation.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      order: { select: { confirmationUuid: true, status: true } },
    },
  });
  if (!attempt) {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }

  return NextResponse.json({
    status: attempt.status,
    orderStatus: attempt.order.status,
    confirmationUuid: attempt.order.confirmationUuid,
  });
}
