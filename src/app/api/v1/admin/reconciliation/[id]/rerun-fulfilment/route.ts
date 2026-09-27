import { NextRequest, NextResponse } from 'next/server';

import { getAdminToken } from '@/lib/adminRequest';
import { prisma } from '@/lib/db';
import { fulfilOrder, scheduleOutboxDrain } from '@/lib/fulfilment';
import { checkPermission } from '@/lib/rbac';
import { recordPaymentReconciliation } from '@/lib/paymentReconciliation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/reconciliation/[id]/rerun-fulfilment — operator action
 * for the reconciliation queue (audit #4 follow-up): re-run fulfilment for
 * a paid order that is still parked (pending_payment with a succeeded
 * attempt, or pending_manual_fulfilment).
 *
 * Idempotent by design:
 *  - The claim is a conditional update (CAS) on the order status, so two
 *    operators pressing at once — or a race with the webhook path — can
 *    never double-allocate gift codes: a losing racer updates 0 rows and
 *    is told the outcome via the live status.
 *  - The delivery-email outbox row is unique per order
 *    (`code_delivery:<orderId>`), so the customer can never receive a
 *    duplicate email — the first committed fulfilment already owns it.
 *  - Completed / refunded orders are answered honestly (ALREADY_SETTLED),
 *    never as a silent success.
 *
 * If the confirmation transaction cannot commit, the order stays parked and
 * the failure lands in the reconciliation queue again (recordPayment-
 * Reconciliation) with a fresh evidence row — the operator loop stays
 * closed. Permission: orders:write (same gate as verify-payment).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = getAdminToken(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'orders:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, orderNumber: true, status: true },
  });
  if (!order) {
    return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 });
  }

  if (order.status === 'completed' || order.status === 'refunded') {
    return NextResponse.json({ error: 'ALREADY_SETTLED', status: order.status }, { status: 409 });
  }

  const isResume = order.status === 'pending_manual_fulfilment';
  const fromStatus = isResume ? 'pending_manual_fulfilment' : 'pending_payment';
  if (!isResume && order.status !== 'pending_payment') {
    // Unknown/intermediate state — do not gamble with it, surface it.
    return NextResponse.json(
      {
        error: 'UNEXPECTED_STATUS',
        status: order.status,
        message: 'สถานะออเดอร์ไม่ตรงกับคิวงาน — ตรวจสอบรายการก่อนดำเนินการต่อ',
      },
      { status: 409 },
    );
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id, status: fromStatus },
          data: { status: 'payment_confirmed' },
        });
        if (claimed.count !== 1) throw new Error('ALREADY_CLAIMED');

        const fulfilment = await fulfilOrder(id, tx, { strict: true });
        if (!fulfilment.success) {
          throw new Error(fulfilment.error ?? 'FULFILMENT_FAILED');
        }

        // The payment is already proven received (queue membership): settle
        // any still-pending attempt so a completed order never keeps one.
        if (!isResume) {
          await tx.paymentAttempt.updateMany({
            where: { orderId: id, status: 'pending' },
            data: { status: 'succeeded', webhookReceivedAt: new Date() },
          });
        }

        return { codesDelivered: fulfilment.codes?.length ?? 0 };
      },
      { isolationLevel: 'Serializable' },
    );

    // Delivery email row committed with the fulfilment — drain now.
    await scheduleOutboxDrain();

    return NextResponse.json({
      status: 'completed',
      resumed: isResume,
      codesDelivered: result.codesDelivered,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    if (msg === 'ALREADY_CLAIMED') {
      // A racer (another operator or the webhook path) did the work — read
      // the live status and report what actually happened.
      const cur = await prisma.order.findUnique({
        where: { id },
        select: { status: true },
      });
      if (cur?.status === 'completed') {
        return NextResponse.json({ status: 'completed', resumed: true, codesDelivered: 0 });
      }
      return NextResponse.json(
        { error: 'ALREADY_CLAIMED', status: cur?.status ?? 'unknown' },
        { status: 409 },
      );
    }

    // Stock hole again (resume path): transaction rolled back cleanly —
    // commit the recovery unit that parks the order for another round.
    // Awaited and verified (audit #4); a failed park leaves fresh evidence.
    if (msg === 'INSUFFICIENT_STOCK') {
      try {
        if (isResume) {
          await prisma.order.update({
            where: { id, status: 'payment_confirmed' },
            data: { status: 'pending_manual_fulfilment' },
          });
        } else {
          await prisma.$transaction(
            async (tx) => {
              const recl = await tx.order.updateMany({
                where: { id, status: 'pending_payment' },
                data: { status: 'pending_manual_fulfilment' },
              });
              if (recl.count !== 1) throw new Error('ALREADY_CLAIMED');
              await tx.paymentAttempt.updateMany({
                where: { orderId: id, status: 'pending' },
                data: { status: 'succeeded', webhookReceivedAt: new Date() },
              });
            },
            { isolationLevel: 'Serializable' },
          );
        }
        return NextResponse.json(
          {
            status: 'pending_manual_fulfilment',
            message: 'โค้ดยังไม่พอ — เติมสต๊อกแล้วกดส่งมอบอีกครั้ง',
          },
          { status: 200 },
        );
      } catch (recoveryErr) {
        const recMsg = recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr);
        await recordPaymentReconciliation({
          trigger: isResume ? 'admin_resume_recovery_failed' : 'admin_verify_recovery_failed',
          orderId: id,
          orderNumber: order.orderNumber,
          paymentRef: null,
          paymentAttemptId: null,
          failureReason: `INSUFFICIENT_STOCK (rerun, ${isResume ? 'resume' : 'fresh'})`,
          recoveryError: recMsg,
        });
        return NextResponse.json(
          {
            error: 'RECONCILIATION_REQUIRED',
            message: 'บันทึกสถานะไม่สำเร็จ — รายการถูกบันทึกไว้ในคิวงานแล้ว',
          },
          { status: 500 },
        );
      }
    }

    // Unexpected failure: the confirmation rolled back entirely and nothing
    // auto-retries an operator action — leave fresh evidence for the queue.
    await recordPaymentReconciliation({
      trigger: isResume ? 'admin_resume_recovery_failed' : 'admin_verify_recovery_failed',
      orderId: id,
      orderNumber: order.orderNumber,
      paymentRef: null,
      paymentAttemptId: null,
      failureReason: msg,
      recoveryError: 'no_recovery_attempted',
    });
    return NextResponse.json({ error: 'RERUN_FAILED' }, { status: 500 });
  }
}
