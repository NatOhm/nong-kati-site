/**
 * "เติมเงินในเดือนนี้" — the formula itself, not just the wiring (2026-11-05).
 *
 * `wallet-month-totals.test.ts` pins WHICH queries the route asks for, but it
 * hands the route a canned `_sum` (฿500). That proves the wiring and nothing
 * about the number on the customer's card: a route that still summed the wrong
 * rows would pass it.
 *
 * This suite calls the real `GET /api/v1/wallet` against a fake `prisma` that
 * FILTERS a fixture ledger using the where-clause semantics the database would
 * apply (`amountThb > 0`, `status = completed`, `createdAt >= month start`,
 * `take`), then asserts the response. The formula under test is the route's;
 * the fake only implements filtering, sorting and summing.
 *
 * Pinned:
 *   M1  25 credits in one month = ฿750.00. On this exact fixture the OLD
 *       formula (sum the 20 newest ledger rows, signed) answers ฿580 — the
 *       figure a phone showed — so a revert is a red test, not a quiet wrong
 *       number.
 *   M2  the total is not clipped by the 20-row page the profile lists.
 *   M3  `wallet_spend` rows never subtract from the total.
 *   M4  last month's credits and credits that are not `completed` are out.
 *   M5  completed orders feed the spend card only — never the top-up card.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const holder = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));
const authMock = vi.hoisted(() => ({ getCustomerFromToken: vi.fn() }));

vi.mock('@/lib/db', () => ({ prisma: holder.prisma }));
vi.mock('@/api/customerAuth', () => authMock);

import { GET } from '@/app/api/v1/wallet/route';
import { bangkokMonthStart } from '@/lib/bangkokTime';

const HOUR = 3_600_000;
const CUSTOMER = 'cust-1';

type LedgerRow = {
  id: string;
  customerId: string;
  amountThb: string;
  method: string;
  status: string;
  createdAt: Date;
};

type OrderRow = {
  id: string;
  orderNumber: string;
  confirmationUuid: string;
  customerId: string;
  status: string;
  totalAmountThb: string;
  itemCount: number;
  createdAt: Date;
};

type Query = {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  take?: number;
};

type Range = { gt?: number; gte?: Date; lt?: number; lte?: Date };

/** The subset of Prisma's where-clause semantics these queries use. */
function matches(row: Record<string, unknown>, where: Query['where']): boolean {
  if (!where) return true;

  return Object.entries(where).every(([field, cond]) => {
    const value = row[field];
    if (cond instanceof Date) return (value as Date).getTime() === cond.getTime();

    if (cond && typeof cond === 'object') {
      const range = cond as Range;
      const time = value instanceof Date ? value.getTime() : Number(value);
      if (range.gt !== undefined && !(Number(value) > range.gt)) return false;
      if (range.gte !== undefined && !(time >= range.gte.getTime())) return false;
      if (range.lt !== undefined && !(Number(value) < range.lt)) return false;
      if (range.lte !== undefined && !(time <= range.lte.getTime())) return false;
      return true;
    }

    return value === cond;
  });
}

function newestFirst<T extends { createdAt: Date }>(rows: T[], orderBy?: Query['orderBy']): T[] {
  const dir = orderBy?.['createdAt'] === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => dir * (a.createdAt.getTime() - b.createdAt.getTime()));
}

/**
 * A prisma stand-in backed by rows, not by canned return values: every call
 * filters the same ledger the way Postgres would, so the number the route
 * returns is derived from the data instead of from the test.
 */
function fakeDb(ledger: LedgerRow[], orders: OrderRow[], balanceThb: number): Record<string, unknown> {
  return {
    customer: {
      findUnique: async () => ({ walletBalanceThb: String(balanceThb) }),
    },
    topUpLog: {
      findMany: async (args: Query) => {
        const filtered = ledger.filter((r) => matches(r as unknown as Record<string, unknown>, args.where));
        const ordered = newestFirst(filtered, args.orderBy);
        return args.take === undefined ? ordered : ordered.slice(0, args.take);
      },
      aggregate: async (args: Query) => {
        const filtered = ledger.filter((r) =>
          matches(r as unknown as Record<string, unknown>, args.where),
        );
        if (filtered.length === 0) return { _sum: { amountThb: null } };
        const total = filtered.reduce((sum, r) => sum + Number(r.amountThb), 0);
        return { _sum: { amountThb: String(total) } };
      },
    },
    order: {
      aggregate: async (args: Query) => {
        const filtered = orders.filter((o) =>
          matches(o as unknown as Record<string, unknown>, args.where),
        );
        if (filtered.length === 0) return { _sum: { totalAmountThb: null } };
        const total = filtered.reduce((sum, o) => sum + Number(o.totalAmountThb), 0);
        return { _sum: { totalAmountThb: String(total) } };
      },
      findMany: async (args: Query) => {
        const filtered = orders.filter((o) =>
          matches(o as unknown as Record<string, unknown>, args.where),
        );
        const ordered = newestFirst(filtered, args.orderBy);
        const page = args.take === undefined ? ordered : ordered.slice(0, args.take);
        return page.map((o) => ({ ...o, _count: { items: o.itemCount } }));
      },
    },
  };
}

/**
 * The month the local drive reproduced: 25 credits totalling ฿750 — nineteen
 * ฿30 top-ups and one ฿10 top-up (the newest 20 rows, ฿580) plus five older
 * rows of ฿30/฿30/฿30/฿30/฿50 (฿170) — with two ฿500 wallet purchases earlier
 * in the month, a ฿500 top-up from LAST month and a ฿400 top-up still pending.
 */
function monthLedger(monthStart: Date): LedgerRow[] {
  const rows: LedgerRow[] = [];
  let seq = 0;
  let hour = 0;

  const at = (hours: number): Date => new Date(monthStart.getTime() + 60_000 + hours * HOUR);

  const add = (
    hours: number,
    amountThb: number,
    method: string,
    status = 'completed',
    createdAt?: Date,
  ): void => {
    rows.push({
      id: `t${++seq}`,
      customerId: CUSTOMER,
      amountThb: String(amountThb),
      method,
      status,
      createdAt: createdAt ?? at(hours),
    });
  };

  add(++hour, -500, 'wallet_spend');
  for (const amount of [30, 30, 30, 30, 50]) add(++hour, amount, 'bank_transfer');
  add(++hour, -500, 'wallet_spend');
  for (let i = 0; i < 19; i++) add(++hour, 30, 'promptpay');
  add(++hour, 10, 'bank_transfer');

  // Newest row of all: a top-up that is not completed yet, and one from last month.
  add(hour + 2, 400, 'promptpay', 'pending');
  add(0, 500, 'promptpay', 'completed', new Date(monthStart.getTime() - HOUR));

  return rows;
}

function orderThisMonth(monthStart: Date, amountThb: number): OrderRow {
  return {
    id: 'ord-1',
    orderNumber: 'NK-2026-009001',
    confirmationUuid: 'uuid-901',
    customerId: CUSTOMER,
    status: 'completed',
    totalAmountThb: String(amountThb),
    itemCount: 2,
    createdAt: new Date(monthStart.getTime() + 5 * HOUR),
  };
}

function request(): NextRequest {
  return new NextRequest('https://nongkatistore.com/api/v1/wallet', {
    headers: { cookie: 'nk_session=token' },
  });
}

type WalletBody = {
  topupThisMonthThb: number;
  spendThisMonthThb: number;
  lifetimeSpendThb: number;
  topups: { id: string; amountThb: number; method: string }[];
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getCustomerFromToken.mockResolvedValue({ id: CUSTOMER });
});

describe('GET /api/v1/wallet — เติมเงินในเดือนนี้ (formula)', () => {
  it('M1: 25 credits in the month read ฿750.00, never the ฿580 of the 20-row sum', async () => {
    const monthStart = bangkokMonthStart();
    const ledger = monthLedger(monthStart);
    Object.assign(holder.prisma, fakeDb(ledger, [orderThisMonth(monthStart, 9000)], 5000));

    const body = (await (await GET(request())).json()) as WalletBody;

    // Sanity: the month really holds 25 credit rows worth ฿750.
    const credits = ledger.filter(
      (r) => r.status === 'completed' && Number(r.amountThb) > 0 && r.createdAt >= monthStart,
    );
    expect(credits).toHaveLength(25);
    expect(credits.reduce((s, r) => s + Number(r.amountThb), 0)).toBe(750);

    // Premise for the guard below: summing the newest 20 rows the way the old
    // route did (as they come back from the page query) gives exactly the
    // number the phone showed.
    const page = (await (holder.prisma['topUpLog'] as { findMany: (a: Query) => Promise<LedgerRow[]> })
      .findMany({
        where: { customerId: CUSTOMER, status: 'completed' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }));
    expect(page).toHaveLength(20);
    expect(page.reduce((s, r) => s + Number(r.amountThb), 0)).toBe(580);

    expect(body.topupThisMonthThb).toBe(750);
    expect(body.topupThisMonthThb).not.toBe(580);
  });

  it('M2: the total is not clipped by the 20-row page the profile lists', async () => {
    const monthStart = bangkokMonthStart();
    Object.assign(
      holder.prisma,
      fakeDb(monthLedger(monthStart), [orderThisMonth(monthStart, 9000)], 5000),
    );

    const body = (await (await GET(request())).json()) as WalletBody;

    // The ledger list itself is capped at 20 rows (a UI page), yet all 25
    // credits of the month are counted in the total.
    expect(body.topups).toHaveLength(20);
    expect(body.topupThisMonthThb).toBe(750);
  });

  it('M3: wallet purchases never subtract from the top-up total', async () => {
    const monthStart = bangkokMonthStart();
    const at = (h: number): Date => new Date(monthStart.getTime() + 60_000 + h * HOUR);
    // Newest rows first: a purchase sits ABOVE the top-ups, exactly the shape
    // that made the old signed sum read as "no top-up this month".
    const ledger: LedgerRow[] = [
      { id: 'p1', customerId: CUSTOMER, amountThb: '-100', method: 'wallet_spend', status: 'completed', createdAt: at(9) },
      { id: 'c1', customerId: CUSTOMER, amountThb: '30', method: 'promptpay', status: 'completed', createdAt: at(8) },
      { id: 'c2', customerId: CUSTOMER, amountThb: '30', method: 'promptpay', status: 'completed', createdAt: at(7) },
      { id: 'c3', customerId: CUSTOMER, amountThb: '30', method: 'bank_transfer', status: 'completed', createdAt: at(6) },
    ];
    Object.assign(holder.prisma, fakeDb(ledger, [], 200));

    const body = (await (await GET(request())).json()) as WalletBody;

    expect(body.topupThisMonthThb).toBe(90);
    expect(body.topupThisMonthThb).not.toBe(-10); // the old signed sum
  });

  it('M4: last month’s credits and unfinished credits are excluded', async () => {
    const monthStart = bangkokMonthStart();
    Object.assign(
      holder.prisma,
      fakeDb(monthLedger(monthStart), [orderThisMonth(monthStart, 9000)], 5000),
    );

    const body = (await (await GET(request())).json()) as WalletBody;

    // ฿500 belongs to last month and ฿400 is still pending: counting either
    // would answer 1250 or 1150.
    expect(body.topupThisMonthThb).toBe(750);
  });

  it('M5: a completed order feeds the spend card, never the top-up card', async () => {
    const monthStart = bangkokMonthStart();
    Object.assign(
      holder.prisma,
      fakeDb(monthLedger(monthStart), [orderThisMonth(monthStart, 9000)], 5000),
    );

    const body = (await (await GET(request())).json()) as WalletBody;

    expect(body.spendThisMonthThb).toBe(9000);
    expect(body.lifetimeSpendThb).toBe(9000);
    expect(body.topupThisMonthThb).toBe(750);
  });
});
