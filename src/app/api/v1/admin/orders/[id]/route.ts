import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission, maskEmail, maskPhone } from '@/lib/rbac';

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

  // Response shaping by permission (finding #5): without orders:read:full
  // (support_agent), customer PII leaves this API masked — hiding fields in
  // the UI would not protect the response itself.
  const fullAccess = check.payload!.perms.includes('orders:read:full');

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: { _count: { select: { giftCodes: true } } },
        orderBy: { createdAt: 'asc' },
      },
      paymentAttempts: {
        where: { slipVerifiedRef: { not: null } },
        select: { slipVerifiedRef: true, slipVerifiedAt: true, slipReceiverAccount: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!order) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const slipVerification = order.paymentAttempts[0] ?? null;

  return NextResponse.json({
    id: order.id,
    orderNumber: order.orderNumber,
    customerEmail: fullAccess ? order.customerEmail : maskEmail(order.customerEmail),
    customerPhone: fullAccess ? order.customerPhone : maskPhone(order.customerPhone),
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotalThb: Number(order.subtotalThb),
    vatAmountThb: Number(order.vatAmountThb),
    discountThb: Number(order.discountThb),
    totalAmountThb: Number(order.totalAmountThb),
    manualFulfilmentReason: order.manualFulfilmentReason,
    slipVerification: slipVerification
      ? {
          ref: slipVerification.slipVerifiedRef,
          verifiedAt: slipVerification.slipVerifiedAt?.toISOString() ?? null,
          receiverAccount: slipVerification.slipReceiverAccount,
        }
      : null,
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
