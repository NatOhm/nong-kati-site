import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * GET /api/v1/admin/orders/[id] — full order detail with items (orders:read).
 * Codes are never included — only their count/status (mask discipline).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'orders:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: { _count: { select: { giftCodes: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!order) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({
    id: order.id,
    orderNumber: order.orderNumber,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotalThb: Number(order.subtotalThb),
    vatAmountThb: Number(order.vatAmountThb),
    discountThb: Number(order.discountThb),
    totalAmountThb: Number(order.totalAmountThb),
    manualFulfilmentReason: order.manualFulfilmentReason,
    createdAt: order.createdAt.toISOString(),
    completedAt: order.completedAt?.toISOString() ?? null,
    items: order.items.map((i) => ({
      id: i.id,
      productNameTh: i.productNameTh,
      skuCode: i.skuCode,
      quantity: i.quantity,
      unitPriceThb: Number(i.unitPriceThb),
      lineTotalThb: Number(i.lineTotalThb),
      deliveryStatus: i.deliveryStatus,
      codesDelivered: i._count.giftCodes,
    })),
  });
}
