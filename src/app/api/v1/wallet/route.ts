import { NextRequest, NextResponse } from 'next/server';

import { getCustomerFromToken } from '@/api/customerAuth';
import { prisma } from '@/lib/db';
import { bangkokMonthStart } from '@/lib/bangkokTime';

const COOKIE = 'nk_session';

export const dynamic = 'force-dynamic';

async function requireCustomer(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;
  return getCustomerFromToken(token);
}

/**
 * GET /api/v1/wallet — balance + top-up history (ประวัติการเดินเงิน)
 * plus this month's top-up and spend totals for the profile page.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireCustomer(req);
  if (!session) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  const monthStart = bangkokMonthStart();

  const [customer, topups, monthTopupAgg, monthSpendAgg, allTimeSpendAgg, spendHistory] =
    await Promise.all([
      prisma.customer.findUnique({
        where: { id: session.id },
        select: { walletBalanceThb: true },
      }),
      prisma.topUpLog.findMany({
        where: { customerId: session.id, status: 'completed' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      // This month's TOP-UPS. The old sum walked the 20 newest ledger rows and
      // added every signed amount, so a bank-transfer top-up read as ฿0 while
      // wallet purchases subtracted from it. Aggregate the credit side only, and
      // over the whole month rather than the visible page of rows.
      prisma.topUpLog.aggregate({
        where: {
          customerId: session.id,
          status: 'completed',
          amountThb: { gt: 0 },
          createdAt: { gte: monthStart },
        },
        _sum: { amountThb: true },
      }),
      // Spend this month = completed orders' totals (wallet orders included)
      prisma.order.aggregate({
        where: { customerId: session.id, status: 'completed', createdAt: { gte: monthStart } },
        _sum: { totalAmountThb: true },
      }),
      // ยอดใช้จ่ายสะสมทั้งหมด (client ask: ยอดใช้จ่ายที่เคยซื้อสะสม)
      prisma.order.aggregate({
        where: { customerId: session.id, status: 'completed' },
        _sum: { totalAmountThb: true },
      }),
      // Spending history = completed ORDERS, not wallet ledger rows: a purchase
      // paid by bank transfer or slip never wrote a wallet_spend row, so the
      // ledger alone showed no spending at all (client report).
      prisma.order.findMany({
        where: { customerId: session.id, status: 'completed' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          confirmationUuid: true,
          createdAt: true,
          totalAmountThb: true,
          _count: { select: { items: true } },
        },
      }),
    ]);

  return NextResponse.json({
    balanceThb: Number(customer?.walletBalanceThb ?? 0),
    topupThisMonthThb: Number(monthTopupAgg._sum.amountThb ?? 0),
    spendThisMonthThb: Number(monthSpendAgg._sum.totalAmountThb ?? 0),
    lifetimeSpendThb: Number(allTimeSpendAgg._sum.totalAmountThb ?? 0),
    topups: topups.map((t) => ({
      id: t.id,
      amountThb: Number(t.amountThb),
      method: t.method,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    })),
    spendHistory: spendHistory.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      confirmationUuid: o.confirmationUuid,
      amountThb: Number(o.totalAmountThb),
      itemCount: o._count.items,
      createdAt: o.createdAt.toISOString(),
    })),
  });
}
