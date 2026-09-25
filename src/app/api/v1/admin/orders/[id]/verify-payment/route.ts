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
 * Admin confirms the customer's payment slip: claim from pending_payment,
 * coupon reservation, fulfilment (gift codes, stock, moves) and the payment
 * attempt settlement commit in ONE serializable transaction — a failure
 * anywhere rolls the whole confirmation back. If codes run short, the order
 * lands in pending_manual_fulfilment (admin restocks and retries). Discord
 * gets a payment-confirmed ping plus low-stock warnings.
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

  // Review #5: a pending_manual_fulfilment order (restocked after a code
  // shortage) must RESUME — the old path claimed only pending_payment and
  // returned 409 NOT_PAYABLE forever. Claim that state atomically, fulfil in
  // the same transaction (partial allocations roll back), and do NOT touch
  // coupon usage again — it was already counted at first confirmation.
  const existing = await getOrderById(id);
  if (!existing) return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });

  if (existing.status === 'pending_manual_fulfilment') {
    const resume = await prisma
      .$transaction(
        async (tx) => {
          const claimed = await tx.order.updateMany({
            where: { id, status: 'pending_manual_fulfilment' },
            data: { status: 'payment_confirmed' },
          });
          if (claimed.count !== 1) throw new Error('ALREADY_CLAIMED');
          const result = await fulfilOrder(id, tx);
          if (!result.success) throw new Error(result.error ?? 'FULFILMENT_FAILED');
          return result;
        },
        { isolationLevel: 'Serializable' },
      )
      .catch(async (e: unknown) => {
        if (e instanceof Error && e.message === 'ALREADY_CLAIMED') {
          return null;
        }
        // Shortage again → back to pending_manual_fulfilment for another round.
        if (e instanceof Error && e.message === 'INSUFFICIENT_STOCK') {
          await prisma.order.update({
            where: { id },
            data: {
              status: 'pending_manual_fulfilment',
              manualFulfilmentReason: 'INSUFFICIENT_STOCK',
            },
          });
          return NextResponse.json({
            status: 'pending_manual_fulfilment',
            message: 'ยังส่งมอบไม่ได้ — โค้ดยังไม่พอ โปรดเติมสต๊อกเพิ่มแล้วกดส่งมอบอีกครั้ง',
          }) as unknown as ReturnType<typeof fulfilOrder>;
        }
        throw e;
      });
    if (resume === null) {
      return NextResponse.json(
        { error: 'ALREADY_CONFIRMED', status: 'completed' },
        { status: 409 },
      );
    }
    if (resume instanceof NextResponse) return resume;

    return NextResponse.json({
      status: 'completed',
      resumed: true,
      codesDelivered: resume.codes?.length ?? 0,
    });
  }

  // Fresh confirmation path (review High): claim + coupon reservation +
  // fulfilment + attempt settlement must commit as ONE unit — separate steps
  // could leave a paid order with coupons committed and its attempt still
  // pending, recoverable only by hand. Any failure rolls everything back.
  let claimed: Awaited<ReturnType<typeof claimOrderForConfirmation>> = null;
  let codesDelivered = 0;
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const claimedInTx = await claimOrderForConfirmation(id, tx);
        if (!claimedInTx) throw new Error('NOT_PAYABLE');
        // Strict: any fulfilment failure (stock hole, lost code race)
        // rethrows and rolls the whole confirmation back.
        const fulfilment = await fulfilOrder(id, tx, { strict: true });
        if (!fulfilment.success) throw new Error(fulfilment.error ?? 'FULFILMENT_FAILED');
        // Settle the pending attempt (slip verified manually) inside the
        // same unit — a completed order never keeps a pending attempt.
        await tx.paymentAttempt.updateMany({
          where: { orderId: id, status: 'pending' },
          data: { status: 'succeeded', webhookReceivedAt: new Date() },
        });
        return { claimed: claimedInTx, codes: fulfilment.codes?.length ?? 0 };
      },
      { isolationLevel: 'Serializable' },
    );
    claimed = result.claimed;
    codesDelivered = result.codes;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'NOT_PAYABLE') {
      if (existing.status === 'completed') {
        return NextResponse.json(
          { error: 'ALREADY_CONFIRMED', status: existing.status },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: 'NOT_PAYABLE', status: existing.status }, { status: 409 });
    }
    // Coupon guards (review Medium): losing a limit race inside the claim
    // now rolls back the WHOLE confirmation — nothing is half-committed.
    if (
      msg === 'COUPON_USAGE_LIMIT' ||
      msg === 'COUPON_PER_CUSTOMER_LIMIT' ||
      msg === 'COUPON_NO_LONGER_VALID'
    ) {
      return NextResponse.json(
        { error: msg, message: 'โค้ดส่วนลดนี้ใช้ไม่ได้อีกต่อไป — ยังไม่มีการตัดสถานะใด ๆ' },
        { status: 409 },
      );
    }
    // Shortage: the transaction rolled back cleanly (order still
    // pending_payment, coupon un-counted). Commit the recovery unit:
    // re-claim (counts the coupon once), settle the attempt, park the order
    // for restock-and-resume — same shape as the slip-verify recovery.
    if (msg === 'INSUFFICIENT_STOCK') {
      await prisma
        .$transaction(
          async (tx) => {
            const recl = await claimOrderForConfirmation(id, tx);
            if (!recl) throw new Error('ALREADY_CLAIMED');
            await tx.paymentAttempt.updateMany({
              where: { orderId: id, status: 'pending' },
              data: { status: 'succeeded', webhookReceivedAt: new Date() },
            });
            await tx.order.update({
              where: { id },
              data: {
                status: 'pending_manual_fulfilment',
                manualFulfilmentReason: 'INSUFFICIENT_STOCK',
              },
            });
          },
          { isolationLevel: 'Serializable' },
        )
        .catch(() => undefined);
      return NextResponse.json(
        {
          status: 'pending_manual_fulfilment',
          message: 'ชำระเงินยืนยันแล้ว แต่โค้ดไม่พอ — โปรดเติมสต๊อกแล้วกดส่งมอบอีกครั้ง',
        },
        { status: 200 },
      );
    }
    console.error('[verify-payment] confirmation transaction failed:', msg);
    return NextResponse.json({ error: 'FULFILMENT_FAILED' }, { status: 500 });
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
    codesDelivered,
  });
}
