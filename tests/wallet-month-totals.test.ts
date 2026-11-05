/**
 * กระเป๋าเงิน totals (phone-user report, 2026-11-05).
 *
 * Two separate lies in the same endpoint:
 *   1. "เติมเงินในเดือนนี้" was summed by walking the 20 NEWEST ledger rows and
 *      adding every signed amount. A bank-transfer top-up therefore read as
 *      whatever was left after wallet purchases were subtracted from it, and a
 *      month whose rows fell outside that 20-row window read as ฿0.
 *   2. There was no spending history at all for orders paid by bank transfer or
 *      slip — those never write a `wallet_spend` row, so the ledger showed none.
 *
 * The route is called in-process with prisma mocked; the assertions are about
 * which queries it asks for and how it answers, i.e. the wiring that was wrong.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMock, authMock } = vi.hoisted(() => ({
  prismaMock: {
    customer: { findUnique: vi.fn() },
    topUpLog: { findMany: vi.fn(), aggregate: vi.fn() },
    order: { aggregate: vi.fn(), findMany: vi.fn() },
  },
  authMock: { getCustomerFromToken: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/api/customerAuth', () => authMock);

import { GET } from '@/app/api/v1/wallet/route';

const authed = (): void => {
  authMock.getCustomerFromToken.mockResolvedValue({ id: 'cust-1' });
};

function request(withCookie = true): NextRequest {
  return new NextRequest('https://nongkatistore.com/api/v1/wallet', {
    headers: withCookie ? { cookie: 'nk_session=token' } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.customer.findUnique.mockResolvedValue({ walletBalanceThb: '120.00' });
  prismaMock.topUpLog.findMany.mockResolvedValue([]);
  prismaMock.topUpLog.aggregate.mockResolvedValue({ _sum: { amountThb: null } });
  prismaMock.order.aggregate.mockResolvedValue({ _sum: { totalAmountThb: null } });
  prismaMock.order.findMany.mockResolvedValue([]);
});

describe('GET /api/v1/wallet — เติมเงินในเดือนนี้', () => {
  it('W1: sums only positive top-ups from the aggregate, not the 20-row page', async () => {
    authed();
    // The visible ledger is dominated by purchases (negative rows), which is
    // exactly the state the old sum mis-read as "no top-up this month".
    prismaMock.topUpLog.findMany.mockResolvedValue([
      { id: 't1', amountThb: '-300.00', method: 'wallet_spend', status: 'completed', createdAt: new Date() },
      { id: 't2', amountThb: '-150.00', method: 'wallet_spend', status: 'completed', createdAt: new Date() },
    ]);
    prismaMock.topUpLog.aggregate.mockResolvedValue({ _sum: { amountThb: '500.00' } });

    const res = await GET(request());
    const body = (await res.json()) as { topupThisMonthThb: number };

    expect(res.status).toBe(200);
    expect(body.topupThisMonthThb).toBe(500);

    const args = prismaMock.topUpLog.aggregate.mock.calls[0]?.[0] as {
      where: { amountThb?: { gt?: number }; createdAt?: { gte?: Date } };
    };
    expect(args.where.amountThb).toEqual({ gt: 0 });
    expect(args.where.createdAt?.gte).toBeInstanceOf(Date);
  });

  it('W2: spending history comes from completed orders, with amounts and item counts', async () => {
    authed();
    prismaMock.order.aggregate
      .mockResolvedValueOnce({ _sum: { totalAmountThb: '320.00' } })
      .mockResolvedValueOnce({ _sum: { totalAmountThb: '1990.00' } });
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: 'o1',
        orderNumber: 'NK-2026-000201',
        confirmationUuid: 'uuid-1',
        createdAt: new Date('2026-11-04T03:00:00.000Z'),
        totalAmountThb: '320.00',
        _count: { items: 2 },
      },
    ]);

    const res = await GET(request());
    const body = (await res.json()) as {
      spendThisMonthThb: number;
      lifetimeSpendThb: number;
      spendHistory: { orderNumber: string; amountThb: number; itemCount: number }[];
    };

    expect(body.spendThisMonthThb).toBe(320);
    expect(body.lifetimeSpendThb).toBe(1990);
    expect(body.spendHistory).toEqual([
      {
        id: 'o1',
        orderNumber: 'NK-2026-000201',
        confirmationUuid: 'uuid-1',
        amountThb: 320,
        itemCount: 2,
        createdAt: '2026-11-04T03:00:00.000Z',
      },
    ]);
    // Only paid orders are spending — pending/expired must never appear.
    expect(prismaMock.order.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { customerId: 'cust-1', status: 'completed' },
    });
  });

  it('W3: no session cookie is a 401, never a zeroed wallet', async () => {
    const res = await GET(request(false));
    expect(res.status).toBe(401);
    expect(prismaMock.customer.findUnique).not.toHaveBeenCalled();
  });
});
