/**
 * Admin top-up review keeps the slip (13 Nov 2026).
 *
 * `TopUpLog.reference` holds the transfer-slip path
 * (/api/v1/payments/slip-download/…) the admin just looked at. The review
 * endpoint also accepts an optional note — and wrote that note straight over
 * `reference`, so after approving or rejecting, ประวัติเติมเงิน no longer had
 * any evidence of the transfer. The admin table's ReferenceCell still splits
 * the column on '|' into slip + note, which is the shape the route must write.
 *
 * T1–T4 pin it: append after the slip, leave the column alone with no note,
 * keep the note alone on a row with no slip, and the same on reject.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMock, creditMock, notifyMock } = vi.hoisted(() => {
  const prismaMock = {
    topUpLog: { findUnique: vi.fn(), updateMany: vi.fn() },
    customer: { update: vi.fn() },
    $transaction: vi.fn(),
  };
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock),
  );
  return {
    prismaMock,
    creditMock: { incrementWalletBalance: vi.fn(async () => 500) },
    notifyMock: { notifyTopUp: vi.fn() },
  };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/walletCredit', () => creditMock);
vi.mock('@/lib/notify', () => notifyMock);
vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn(async () => ({
    allowed: true,
    payload: { sub: 'adm-1', email: 'admin@test.local' },
  })),
}));
vi.mock('@/lib/adminRequest', () => ({ getAdminToken: vi.fn(() => 'token') }));
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: vi.fn() }));

import { POST } from '@/app/api/v1/admin/topups/[id]/route';

const SLIP = '/api/v1/payments/slip-download/tl-1';

function pending(reference: string | null): void {
  prismaMock.topUpLog.findUnique.mockResolvedValue({
    id: 'tl-1',
    status: 'pending',
    customerId: 'cus-1',
    amountThb: 100,
    reference,
    customer: { email: 'somchai@example.test' },
  });
  prismaMock.topUpLog.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.customer.update.mockResolvedValue({ walletBalanceThb: '500' });
}

async function review(body: Record<string, unknown>): Promise<number> {
  const req = new NextRequest('http://localhost/api/v1/admin/topups/tl-1', {
    method: 'POST',
    headers: { authorization: 'Bearer x', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req, { params: Promise.resolve({ id: 'tl-1' }) });
  return res.status;
}

function written(): { status?: string; reference?: string } {
  const call = prismaMock.topUpLog.updateMany.mock.calls.at(-1);
  return (call?.[0] as { data: { status?: string; reference?: string } }).data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('admin top-up review — the slip survives the note', () => {
  it('T1 appends the note after the slip path instead of overwriting it', async () => {
    pending(SLIP);
    expect(await review({ action: 'approve', note: 'โอนตรงยอด' })).toBe(200);
    expect(written().reference).toBe(`${SLIP}|โอนตรงยอด`);
  });

  it('T2 leaves the reference untouched when no note is sent', async () => {
    pending(SLIP);
    expect(await review({ action: 'approve' })).toBe(200);
    expect(written()).not.toHaveProperty('reference');
  });

  it('T3 keeps the note alone on a row that has no slip path', async () => {
    pending(null);
    expect(await review({ action: 'reject', note: 'ไม่พบเงินเข้า' })).toBe(200);
    expect(written().reference).toBe('ไม่พบเงินเข้า');
  });

  it('T4 a rejection with a note preserves the slip too', async () => {
    pending(SLIP);
    expect(await review({ action: 'reject', note: 'ยอดไม่ตรง' })).toBe(200);
    expect(written().reference).toBe(`${SLIP}|ยอดไม่ตรง`);
    expect(written().status).toBe('failed');
  });
});
