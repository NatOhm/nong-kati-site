/**
 * Wallet credit primitives — one place that moves store credit.
 *
 * Three flows now add money to a customer's wallet: an admin adjustment
 * (api/adminCustomers.ts), a refund paid as credit, and an approved
 * bank-transfer top-up. They must all land a balance change and a ledger row
 * together, or the customer's ประวัติการเดินเงิน disagrees with their balance
 * (the exact complaint that started this round).
 */

import type { Prisma } from '@prisma/client';

/** Method labels shared by the customer wallet, profile and admin history. */
export const WALLET_METHOD_LABEL: Record<string, string> = {
  promptpay: 'พร้อมเพย์',
  credit_card: 'บัตรเครดิต',
  bank_transfer: 'โอนเงินผ่านบัญชีธนาคาร',
  manual: 'เจ้าหน้าที่ตรวจสลิป',
  slip: 'สลิปโอนเงิน',
  admin_credit: 'แอดมินเติมเครดิต',
  refund_credit: 'เงินคืนเข้ากระเป๋า',
  wallet_spend: 'ใช้เครดิตซื้อสินค้า',
};

export function roundThb(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Increment the balance inside the caller's transaction and return the new
 * total. Credit only — debits keep their own atomic predicate (see
 * adminAdjustCustomerCredit) so they cannot overdraw.
 */
export async function incrementWalletBalance(
  tx: Prisma.TransactionClient,
  customerId: string,
  amountThb: number,
): Promise<number> {
  const amount = roundThb(amountThb);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('INVALID_AMOUNT');
  const updated = await tx.customer.update({
    where: { id: customerId },
    data: { walletBalanceThb: { increment: amount } },
    select: { walletBalanceThb: true },
  });
  return Number(updated.walletBalanceThb);
}

/** Increment the balance AND write the matching completed ledger row. */
export async function recordWalletCredit(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    amountThb: number;
    method: string;
    reference?: string | null;
  },
): Promise<number> {
  const amount = roundThb(input.amountThb);
  const balance = await incrementWalletBalance(tx, input.customerId, amount);
  await tx.topUpLog.create({
    data: {
      customerId: input.customerId,
      amountThb: amount,
      method: input.method,
      reference: input.reference ? input.reference.slice(0, 190) : null,
      status: 'completed',
    },
  });
  return balance;
}
