import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { decryptCode } from '@/lib/crypto/giftCode';
import { getCustomerFromToken } from '@/api/customerAuth';

export const dynamic = 'force-dynamic';

const COOKIE = 'nk_session';

/**
 * GET /api/v1/account/codes — every delivered gift code across the
 * signed-in customer's orders (account โค้ดที่ซื้อ page). Plaintext is
 * decrypted server-side per row and never logged. Requires a customer
 * session — guest orders surface their codes through the confirmation-UUID
 * pages instead.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE)?.value;
  const session = token ? await getCustomerFromToken(token) : null;
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const rows = await prisma.giftCode.findMany({
    where: {
      status: 'delivered',
      orderId: { not: null },
      order: { customerId: session.id },
    },
    orderBy: { deliveredAt: 'desc' },
    select: {
      id: true,
      codeEncrypted: true,
      nonce: true,
      deliveredAt: true,
      order: { select: { orderNumber: true, status: true } },
      orderItem: {
        select: { productNameTh: true, denominationThb: true, quantity: true },
      },
    },
  });

  return NextResponse.json({
    codes: rows.map((row) => ({
      id: row.id,
      code: decryptCode(row.codeEncrypted, row.nonce),
      product: row.orderItem?.productNameTh ?? '',
      denomination: Number(row.orderItem?.denominationThb ?? 0),
      orderNumber: row.order?.orderNumber ?? '',
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      used: row.order?.status === 'completed',
    })),
  });
}
