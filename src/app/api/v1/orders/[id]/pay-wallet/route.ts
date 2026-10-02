import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getCustomerFromToken } from '@/api/customerAuth';
import { claimOrderForConfirmation } from '@/api/orders';
import { fulfilOrder, scheduleOutboxDrain } from '@/lib/fulfilment';

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
 * The transaction runs SERIALIZABLE and retries on write-conflict (see
 * runWalletPayment below) so that two claims racing on the same coupon +
 * customer cannot both clear the per-customer cap.
 */
type WalletTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Serializable wrapper with retry on write-conflict.
 *
 * The coupon per-customer cap is a read-then-act check: claimOrderForConfirmation
 * counts CouponRedemption rows for (couponId, customerId) and compares that
 * count against the coupon's VARIABLE perCustomerLimit (admin-settable, null =
 * unlimited — see model Coupon in prisma/schema.prisma). Under READ COMMITTED two
 * wallet claims racing on the same coupon + customer can both read a count under
 * the cap, both insert, and both commit — the cap is silently over-granted. No
 * unique constraint can close this: a @@unique([couponId, customerId]) would
 * hard-cap every coupon at ONE (ignoring perCustomerLimit > 1) and its violation
 * would be swallowed by the idempotency catch in claimOrderForConfirmation, which
 * treats "Unique constraint" as an already-recorded retry.
 *
 * SERIALIZABLE makes the losing transaction fail with P2034 instead of
 * double-granting; re-running it re-reads the winner's redemption row and the
 * cap then rejects it with COUPON_PER_CUSTOMER_LIMIT.
 *
 * Mirrors runStaffMutation (api/adminStaff.ts). The other claim call sites —
 * verify-payment, slip-verify and omise — already run Serializable; this was the
 * only STRICT (non-paidExternally) call site still on READ COMMITTED.
 */
async function runWalletPayment<T>(fn: (tx: WalletTx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' });
    } catch (e) {
      const isConflict =
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code?: string }).code === 'P2034';
      if (!isConflict || attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
  throw new Error('unreachable'); // loop always returns or throws
}

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
    const result = await runWalletPayment(async (tx) => {
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

      // Strict: a stock hole rolls back the entire payment (review H3).
      const fulfilment = await fulfilOrder(order.id, tx, { strict: true });
      if (!fulfilment.success) {
        // Unreachable in strict mode (every failure rethrows) — kept as a
        // type-level safety net.
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
    // Audit #2: the unit committed — codes delivered, wallet debited, and the
    // code-delivery outbox row promised. Kick the delivery worker after the
    // response; a failure to send never undoes the payment (the row stays
    // pending for the retry paths).
    await scheduleOutboxDrain();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    // Transaction rolled back — balance, ledger, claim, codes all intact.
    const code = err instanceof Error ? err.message : 'WALLET_PAY_FAILED';
    // Review H3: a stock hole surfaces as a clean 409 — the customer's
    // balance is untouched (the transaction rolled back) and PromptPay
    // remains available in the UI.
    if (code === 'INSUFFICIENT_STOCK') {
      return NextResponse.json({ error: { code: 'INSUFFICIENT_STOCK' } }, { status: 409 });
    }
    // Review M4: losing a coupon race (limit reached between order creation
    // and claim) is a client-facing 409, not a server error — the checkout
    // UI can then offer payment without the coupon.
    if (
      code === 'COUPON_USAGE_LIMIT' ||
      code === 'COUPON_PER_CUSTOMER_LIMIT' ||
      code === 'COUPON_NO_LONGER_VALID'
    ) {
      return NextResponse.json({ error: { code } }, { status: 409 });
    }
    return NextResponse.json(
      { error: { code: code.startsWith('WALLET_PAY') ? code : 'WALLET_PAY_FAILED' } },
      { status: 500 },
    );
  }
}
