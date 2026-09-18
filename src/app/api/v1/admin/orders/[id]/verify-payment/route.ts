import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { claimOrderForConfirmation, getOrderById } from '@/api/orders';
import { fulfilOrder } from '@/lib/fulfilment';
import { getNotificationSettings, notifyPaymentConfirmed, notifyStockLow } from '@/lib/notify';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

/**
 * POST /api/v1/admin/orders/[id]/verify-payment — ระบบตรวจสอบการชำระเงิน.
 * Admin confirms the customer's payment slip: the order is atomically claimed
 * from pending_payment, then fulfilment assigns gift codes, decrements stock,
 * writes stock moves and completes the order in one transaction. If codes run
 * short, the order lands in pending_manual_fulfilment (admin restocks and
 * retries). Discord gets a payment-confirmed ping plus low-stock warnings.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'orders:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const { id } = await ctx.params;

  // Claim atomically — a second admin clicking confirm sees ALREADY_CONFIRMED.
  const claimed = await claimOrderForConfirmation(id);
  if (!claimed) {
    const existing = await getOrderById(id);
    if (!existing) return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });
    if (existing.status === 'completed') {
      return NextResponse.json(
        { error: 'ALREADY_CONFIRMED', status: existing.status },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'NOT_PAYABLE', status: existing.status }, { status: 409 });
  }

  // Fulfil: codes + stock + status in one transaction.
  const fulfilment = await fulfilOrder(id);

  if (!fulfilment.success) {
    if (fulfilment.error === 'INSUFFICIENT_STOCK') {
      await prisma.order.update({
        where: { id },
        data: { status: 'pending_manual_fulfilment', manualFulfilmentReason: 'INSUFFICIENT_STOCK' },
      });
      return NextResponse.json(
        {
          status: 'pending_manual_fulfilment',
          message: 'ชำระเงินยืนยันแล้ว แต่โค้ดไม่พอ — โปรดเติมสต๊อกแล้วกดส่งมอบอีกครั้ง',
        },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: fulfilment.error ?? 'FULFILMENT_FAILED' }, { status: 500 });
  }

  // Mark the latest pending attempt as succeeded (slip verified manually).
  const attempt = await prisma.paymentAttempt.findFirst({
    where: { orderId: id, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
  if (attempt) {
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'succeeded', webhookReceivedAt: new Date() },
    });
  }

  // Notifications (fire-and-forget).
  const cfg = await getNotificationSettings();
  void notifyPaymentConfirmed({
    orderNumber: claimed.orderNumber,
    totalThb: Number(claimed.totalAmountThb),
  });

  // Low-stock check on affected variants.
  const threshold = cfg.lowStockThreshold ?? 5;
  const variantIds = [...new Set(claimed.items.map((i: { variantId: string }) => i.variantId))];
  const lowVariants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, stock: { lte: threshold } },
    include: { product: { select: { name: true } } },
  });
  for (const v of lowVariants) {
    void notifyStockLow({ productName: v.product.name, variantLabel: v.label, stock: v.stock });
  }

  return NextResponse.json({
    status: 'completed',
    codesDelivered: fulfilment.codes?.length ?? 0,
  });
}
