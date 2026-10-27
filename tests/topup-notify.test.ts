/**
 * Top-up Discord notification gate (client ask 2026-10-27).
 *
 * Three notifications were requested for the ops channel; two already existed
 * (new order = พบการซื้อสินค้า, out of stock = สินค้าหมดแล้ว). The third —
 * พบการเติมเงินเข้าระบบ — had NO notifier at all: admin wallet credits landed
 * with only an audit row, so money arriving was silent unless someone opened
 * the customers list.
 *
 * This file drives the REAL PATCH /api/v1/admin/customers/[id] credit branch
 * in-process (real signed JWT, production route code, prisma mocked) and pins:
 *  - a positive credit fires notifyTopUp exactly once, with the committed
 *    email / amount / resulting balance (fired after the transaction, not in it)
 *  - a debit adjustment shares the same branch and must stay silent
 *  - a failed credit (write predicate rejected) must stay silent
 *
 * notify.ts is mocked, so this asserts the WIRING; the embed payload itself is
 * a thin wrapper over sendDiscordEmbed shared by every other notification.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'topup-notify-test-secret-0123456789abcdef0123456789abcdef';

const { prismaMock, notifyMock } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn(), updateMany: vi.fn() },
    topUpLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  const notifyMock = { notifyTopUp: vi.fn() };
  return { prismaMock, notifyMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: vi.fn() }));
vi.mock('@/lib/notify', () => notifyMock);

import { issueAdminJwt } from '@/lib/jwt';
import { ROLE_PERMISSIONS } from '@/types/auth';

const CUSTOMER = {
  id: 'cust-1',
  email: 'somchai.prasert@gmail.com',
  walletBalanceThb: '620.50',
};

const token = (): Promise<string> =>
  issueAdminJwt(
    'admin-super_admin',
    'super_admin@test.local',
    'super_admin',
    [...ROLE_PERMISSIONS['super_admin']],
  );

async function patchCredit(
  mod: Record<string, unknown>,
  bearer: string,
  amountThb: number,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = new NextRequest('http://localhost/api/v1/admin/customers/cust-1', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'credit', amountThb }),
  });
  const handler = mod['PATCH'] as (
    r: NextRequest,
    c: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
  const res = (await handler(req, { params: Promise.resolve({ id: 'cust-1' }) })) as Response & {
    json: () => Promise<unknown>;
  };
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

beforeEach(() => {
  notifyMock.notifyTopUp.mockReset();
  prismaMock.adminUser.findUnique.mockResolvedValue({
    role: 'super_admin',
    status: 'active',
    sessionsInvalidBefore: null,
    mustChangePassword: false,
  });
  prismaMock.customer.findUnique.mockResolvedValue(CUSTOMER);
  prismaMock.customer.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.topUpLog.create.mockResolvedValue({});
  // The route's transaction runs against the same mock surface (tx === prisma).
  prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) =>
    cb(prismaMock),
  );
});

describe('top-up notification (พบการเติมเงินเข้าระบบ)', () => {
  it('a positive credit pings notifyTopUp once with the committed values', async () => {
    const mod = (await import('../src/app/api/v1/admin/customers/[id]/route')) as Record<
      string,
      unknown
    >;

    const { status, body } = await patchCredit(mod, await token(), 500);

    expect(status).toBe(200);
    expect(body['success']).toBe(true);
    expect(notifyMock.notifyTopUp).toHaveBeenCalledTimes(1);
    expect(notifyMock.notifyTopUp).toHaveBeenCalledWith({
      customerEmail: CUSTOMER.email,
      amountThb: 500,
      balanceAfterThb: 620.5,
    });
  });

  it('a debit adjustment (negative amount) does not ping', async () => {
    const mod = (await import('../src/app/api/v1/admin/customers/[id]/route')) as Record<
      string,
      unknown
    >;

    const { status } = await patchCredit(mod, await token(), -50);

    expect(status).toBe(200);
    expect(notifyMock.notifyTopUp).not.toHaveBeenCalled();
  });

  it('a rejected credit does not ping', async () => {
    const mod = (await import('../src/app/api/v1/admin/customers/[id]/route')) as Record<
      string,
      unknown
    >;
    prismaMock.customer.updateMany.mockResolvedValue({ count: 0 });

    const { status, body } = await patchCredit(mod, await token(), 500);

    expect(status).toBe(400);
    expect(body['error']).toBe('INSUFFICIENT_BALANCE');
    expect(notifyMock.notifyTopUp).not.toHaveBeenCalled();
  });
});