import { NextRequest, NextResponse } from 'next/server';

import { getCustomerFromToken } from '@/api/customerAuth';
import { prisma } from '@/lib/db';

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

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [customer, topups, monthSpendAgg, allTimeSpendAgg] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: session.id },
      select: { walletBalanceThb: true },
    }),
    prisma.topUpLog.findMany({
      where: { customerId: session.id, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      take: 20,
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
  ]);

  const monthTopups = topups
    .filter((t) => t.createdAt >= monthStart)
    .reduce((sum, t) => sum + Number(t.amountThb), 0);

  return NextResponse.json({
    balanceThb: Number(customer?.walletBalanceThb ?? 0),
    topupThisMonthThb: monthTopups,
    spendThisMonthThb: Number(monthSpendAgg._sum.totalAmountThb ?? 0),
    lifetimeSpendThb: Number(allTimeSpendAgg._sum.totalAmountThb ?? 0),
    topups: topups.map((t) => ({
      id: t.id,
      amountThb: Number(t.amountThb),
      method: t.method,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}
