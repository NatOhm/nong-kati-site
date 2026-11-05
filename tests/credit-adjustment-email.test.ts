/**
 * Credit adjustments reach the customer's inbox (client ask 2026-11-05:
 * "มีประวัติไว้ในเมลก็สะดวก").
 *
 * The admin "ปรับเครดิต" action used to change a balance, write the ledger row
 * and ping the ops channel — the customer themselves learned about it only by
 * opening กระเป๋าเงิน. This drives the real PATCH route and pins:
 *   E1  a credit is emailed to the customer, with the signed amount and balance,
 *   E2  a deduction is emailed too (that is the row people dispute later),
 *   E3  a mail outage does not fail or undo the adjustment — the response says
 *       `emailed: false` so the admin UI can stop claiming it was sent,
 *   E4  a rejected adjustment (insufficient balance) sends nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'credit-email-test-secret-0123456789abcdef0123456789abc';

const { prismaMock, notifyMock, emailMock } = vi.hoisted(() => ({
  prismaMock: {
    adminUser: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn(), updateMany: vi.fn() },
    topUpLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  notifyMock: { notifyTopUp: vi.fn() },
  emailMock: { sendEmail: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: vi.fn() }));
vi.mock('@/lib/notify', () => notifyMock);
vi.mock('@/lib/email/resend', () => emailMock);

import { issueAdminJwt } from '@/lib/jwt';
import { ROLE_PERMISSIONS } from '@/types/auth';

const CUSTOMER = {
  id: 'cust-1',
  email: 'somchai.prasert@gmail.com',
  walletBalanceThb: '620.50',
};

const token = (): Promise<string> =>
  issueAdminJwt('admin-super_admin', 'super_admin@test.local', 'super_admin', [
    ...ROLE_PERMISSIONS['super_admin'],
  ]);

async function patchCredit(
  amountThb: number,
  note?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const mod = (await import('../src/app/api/v1/admin/customers/[id]/route')) as Record<
    string,
    unknown
  >;
  const handler = mod['PATCH'] as (
    r: NextRequest,
    c: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
  const req = new NextRequest('http://localhost/api/v1/admin/customers/cust-1', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'credit', amountThb, ...(note ? { note } : {}) }),
  });
  const res = await handler(req, { params: Promise.resolve({ id: 'cust-1' }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.adminUser.findUnique.mockResolvedValue({
    role: 'super_admin',
    status: 'active',
    sessionsInvalidBefore: null,
    mustChangePassword: false,
  });
  prismaMock.customer.findUnique.mockResolvedValue(CUSTOMER);
  prismaMock.customer.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.topUpLog.create.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) =>
    cb(prismaMock),
  );
  emailMock.sendEmail.mockResolvedValue({ success: true, messageId: 'em_1' });
});

describe('admin credit adjustment → customer email', () => {
  it('E1: a credit emails the customer the signed amount and new balance', async () => {
    const { status, body } = await patchCredit(500, 'โอนผ่านธนาคาร 05/11');

    expect(status).toBe(200);
    expect(body['emailed']).toBe(true);
    expect(emailMock.sendEmail).toHaveBeenCalledTimes(1);

    const sent = emailMock.sendEmail.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(sent.to).toBe(CUSTOMER.email);
    expect(sent.subject).toContain('เพิ่มเครดิต');
    expect(sent.subject).toContain('+฿500.00');
    expect(sent.html).toContain('฿620.50');
    expect(sent.text).toContain('โอนผ่านธนาคาร 05/11');
  });

  it('E2: a deduction is emailed as a deduction, not as a top-up', async () => {
    await patchCredit(-50);

    const sent = emailMock.sendEmail.mock.calls[0]?.[0] as { subject: string };
    expect(sent.subject).toContain('หักเครดิต');
    expect(sent.subject).toContain('-฿50.00');
  });

  it('E3: a mail failure keeps the adjustment committed and says emailed:false', async () => {
    emailMock.sendEmail.mockResolvedValue({ success: false, error: 'EMAIL_NOT_CONFIGURED' });

    const { status, body } = await patchCredit(500);

    expect(status).toBe(200);
    expect(body['success']).toBe(true);
    expect(body['emailed']).toBe(false);
    // The money moved — the ledger row is the proof the UI reads back.
    expect(prismaMock.topUpLog.create).toHaveBeenCalledTimes(1);
  });

  it('E3b: a mailer that throws is still not a failed adjustment', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    emailMock.sendEmail.mockRejectedValue(new Error('socket hang up'));

    const { status, body } = await patchCredit(500);

    expect(status).toBe(200);
    expect(body['emailed']).toBe(false);
    expect(errSpy).toHaveBeenCalledWith('[admin-credit] adjustment email threw:', 'socket hang up');
  });

  it('E4: a rejected adjustment sends nothing at all', async () => {
    prismaMock.customer.updateMany.mockResolvedValue({ count: 0 });

    const { status } = await patchCredit(500);

    expect(status).toBe(400);
    expect(emailMock.sendEmail).not.toHaveBeenCalled();
  });
});
