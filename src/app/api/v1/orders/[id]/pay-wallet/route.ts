import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getCustomerFromToken } from '@/api/customerAuth';
import { claimOrderForConfirmation } from '@/api/orders';
import { fulfilOrder } from '@/lib/fulfilment';

export const dynamic = 'force-dynamic';

const COOKIE = 'nk_session';

/**
 * POST /api/v1/orders/[id]/pay-wallet — pay a pending order with the
 * customer's wallet credit (เครดิตในกระเป๋า).
 *
 * Atomic per order: the conditional balance deduct, the TopUpLog spend row,
 * the claim (pending_payment → payment_confirmed, coupon counted) and the
 * fulfilment (codes + stock + completed) all join ONE transaction. Any
 * failure — insufficient balance, a racing payment, a stock shortfall —
 * rolls the whole thing back and returns a typed error, so the checkout UI
 * falls back to the PromptPay QR and nothing is half-spent. INSUFFICIENT_
 * STOCK specifically returns to pending_payment with the wallet untouched
 * (order goes to pending_manual_fulfilment via the shared claim+fulfil flow
 * only when payment already succeeded — wallet deducts first, so no).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE)?.value;
  const session = token ? await getCustomerFromToken(token) : null;
  if (!session) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lock the order row while we decide (prevents double-pay races).
      const order = await tx.order.findUnique({
        where: { id },
        select: {
          id: true,
          customerId: true,
          status: true,
          totalAmountThb: true,
          orderNumber: true,
        },
      });
      if (!order || order.customerId !== session.id) {
        return { code: 'ORDER_NOT_FOUND' as const };
      }
      if (order.status !== 'pending_payment') {
        return { code: 'ORDER_NOT_PAYABLE' as const };
      }

      const total = Number(order.totalAmountThb);

      // Conditional deduct: only succeeds if the balance actually covers it.
      // updateMany with a balance guard makes racing checkouts safe — the
      // loser deducts 0 rows and we abort with INSUFFICIENT_BALANCE.
      const deducted = await tx.customer.updateMany({
        where: { id: session.id, walletBalanceThb: { gte: total } },
        data: { walletBalanceThb: { decrement: total } },
      });
      if (deducted.count !== 1) {
        return { code: 'INSUFFICIENT_BALANCE' as const };
      }

      await tx.topUpLog.create({
        data: {
          customerId: session.id,
          amountThb: -total,
          method: 'wallet_spend',
          reference: order.orderNumber,
          status: 'completed',
        },
      });

      // Claim pending_payment → payment_confirmed (counts coupon usage).
      const claimed = await claimOrderForConfirmation(order.id, tx);
      if (!claimed) {
        throw new Error('WALLET_PAY_CLAIM_FAILED');
      }

      const fulfilment = await fulfilOrder(order.id, tx);
      if (!fulfilment.success) {
        if (fulfilment.error === 'INSUFFICIENT_STOCK') {
          // Payment "succeeded" but there is nothing to deliver: keep the
          // claim (manual fulfilment flow resolves it) and commit the spend.
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'pending_manual_fulfilment',
              manualFulfilmentReason: 'INSUFFICIENT_STOCK',
              paymentMethod: 'wallet',
            },
          });
          return {
            code: 'OK_MANUAL_FULFILMENT' as const,
            orderNumber: order.orderNumber,
            total,
          };
        }
        throw new Error(fulfilment.error ?? 'WALLET_PAY_FAILED');
      }

      await tx.order.update({
        where: { id: order.id },
        data: { paymentMethod: 'wallet' },
      });

      return { code: 'OK' as const, orderNumber: order.orderNumber, total };
    });

    if (result.code === 'ORDER_NOT_FOUND') {
      return NextResponse.json({ error: { code: result.code } }, { status: 404 });
    }
    if (result.code === 'ORDER_NOT_PAYABLE' || result.code === 'INSUFFICIENT_BALANCE') {
      return NextResponse.json({ error: { code: result.code } }, { status: 409 });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    // Transaction rolled back — balance, ledger, claim, codes all intact.
    const code = err instanceof Error ? err.message : 'WALLET_PAY_FAILED';
    return NextResponse.json(
      { error: { code: code.startsWith('WALLET_PAY') ? code : 'WALLET_PAY_FAILED' } },
      { status: 500 },
    );
  }
}
