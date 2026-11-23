/**
 * POST /api/v1/admin/orders/[id]/slip-receiver — the admin's read of where the
 * money went, for a slip nobody auto-checked.
 *
 * A manual upload (no auto-verify, provider outage, parked slip) has no
 * verdict and, before this action, no receiver data at all. The screen where
 * money is released showed only a picture. This suite pins the contract that
 * makes it safe:
 *
 *   - it is READ ONLY — no order status write, no settlement import;
 *   - it returns the last four digits of the account the bank reported, and
 *     the full masked form only as the bank printed it;
 *   - a mismatch is information, not an error status, and never confirms;
 *   - a provider failure returns 200 with a null receiver (so the UI can show
 *     why and unblock the by-eye path) instead of failing the admin outright;
 *   - an attempt that already carries a verdict (pass or failure) is never
 *     written at all — a read must not overwrite the verdict the confirm
 *     decision rests on;
 *   - a provider that names no account records nothing (no junk attempt row).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { slipNeedsReceiverRead } from '../src/lib/slipCheckReason';

process.env['NK_JWT_SECRET'] = 'slip-receiver-secret-0123456789abcdef0123456';

const h = vi.hoisted(() => ({
  token: 'admin-token' as string | null,
  allowed: true,
  prisma: {
    order: { findUnique: vi.fn(), update: vi.fn() },
    paymentAttempt: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  readSlip: vi.fn(),
  verify: vi.fn(),
  manualInfo: {
    enabled: true,
    accountName: 'Nong Kati',
    accountNumber: '199-1-73578-6' as string | null,
    accountType: 'promptpay',
    bankName: 'Bangkok Bank',
    qrImageUrl: null,
  },
}));

vi.mock('@/lib/db', () => ({ prisma: h.prisma }));
vi.mock('@/lib/adminRequest', () => ({ getAdminToken: () => h.token }));
vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn(async () =>
    h.allowed
      ? { allowed: true, payload: { sub: 'admin-1', email: 'admin@test.local', perms: [] } }
      : { allowed: false, error: 'FORBIDDEN' },
  ),
}));
vi.mock('@/lib/data', () => ({ getManualTransferInfo: vi.fn(async () => h.manualInfo) }));
vi.mock('@/lib/slipStore', () => ({
  readSlip: (...args: unknown[]) => h.readSlip(...args),
  slipKeyFromImageUrl: () => 'a'.repeat(32),
}));
vi.mock('@/lib/payment/slipVerifyFlow', () => ({
  verifySlipImage: (...args: unknown[]) => h.verify(...args),
  primarySlipProvider: () => 'slip2go',
}));

const ORDER_ID = 'ord-735';

function order(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORDER_ID,
    orderNumber: 'NK-2026-000735',
    totalAmountThb: '735',
    slipImageUrl: `/api/v1/payments/slip-download/${'a'.repeat(32)}`,
    ...over,
  };
}

type Body = Record<string, unknown>;

async function post(): Promise<{ status: number; body: Body }> {
  const mod = (await import(
    '../src/app/api/v1/admin/orders/[id]/slip-receiver/route'
  )) as { POST: (r: NextRequest, c: unknown) => Promise<Response> };
  const req = new NextRequest('http://localhost/api/v1/admin/orders/ord-735/slip-receiver', {
    method: 'POST',
    headers: { authorization: 'Bearer admin-token' },
  });
  const res = await mod.POST(req, { params: Promise.resolve({ id: ORDER_ID }) });
  return { status: res.status, body: (await res.json()) as Body };
}

/** The `data` payload of the last paymentAttempt.update call. */
function lastUpdate(): Body {
  const calls = h.prisma.paymentAttempt.update.mock.calls;
  return (calls.at(-1)?.[0] as { data: Body }).data;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.token = 'admin-token';
  h.allowed = true;
  h.prisma.order.findUnique.mockResolvedValue(order());
  h.prisma.order.update.mockResolvedValue({});
  h.prisma.paymentAttempt.findFirst.mockResolvedValue({ id: 'att-1', failureReason: null });
  h.prisma.paymentAttempt.create.mockResolvedValue({ id: 'att-new', failureReason: null });
  h.prisma.paymentAttempt.update.mockResolvedValue({});
  h.readSlip.mockResolvedValue(Buffer.from('fake-jpeg'));
  h.verify.mockResolvedValue({
    ok: true,
    ref: 'ref-735',
    amountThb: 735,
    receiverAccount: '199-1-xxx786',
    verifiedBy: 'slip2go:auto',
    raw: {},
  });
});

describe('slipNeedsReceiverRead — the confirm gate', () => {
  const base = {
    status: 'pending_payment',
    slipImageUrl: '/api/v1/payments/slip-download/abc',
    slipReceiver: null,
  };

  it('holds the first confirmation of a slip with no receiver', () => {
    expect(slipNeedsReceiverRead(base, false)).toBe(true);
    expect(slipNeedsReceiverRead({ ...base, slipReceiver: { masked: '199-1-xxx786', last4: '1786' } }, false)).toBe(false);
    expect(slipNeedsReceiverRead({ ...base, slipImageUrl: null }, false)).toBe(false);
  });

  it('lets a paid order through: pending_manual_fulfilment already recorded the money', () => {
    expect(slipNeedsReceiverRead({ ...base, status: 'pending_manual_fulfilment' }, false)).toBe(false);
  });

  it('never asks for a read on a slip that already carries a verdict', () => {
    expect(slipNeedsReceiverRead(base, true)).toBe(false);
  });
});

describe('POST /admin/orders/:id/slip-receiver — access', () => {
  it('401 without a token, 403 without orders:write', async () => {
    h.token = null;
    expect((await post()).status).toBe(401);

    h.token = 'admin-token';
    h.allowed = false;
    const denied = await post();
    expect(denied.status).toBe(403);
    expect(h.verify).not.toHaveBeenCalled();
  });

  it('404 for an unknown order, 409 when no slip file is stored', async () => {
    h.prisma.order.findUnique.mockResolvedValue(null);
    expect((await post()).status).toBe(404);

    h.prisma.order.findUnique.mockResolvedValue(order());
    h.readSlip.mockResolvedValue(null);
    const missing = await post();
    expect(missing.status).toBe(409);
    expect(missing.body['error']).toBe('NO_STORED_SLIP');
    expect(h.verify).not.toHaveBeenCalled();
  });
});

describe('POST /admin/orders/:id/slip-receiver — reports the account', () => {
  it('returns the last four digits and stores the masked account on the attempt', async () => {
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      slipReceiver: { masked: '199-1-xxx786', last4: '1786' },
      matchesStore: true,
      verdict: null,
    });
    // The read records the account and nothing else — no verdict field.
    expect(lastUpdate()).toEqual({ slipReceiverAccount: '199-1-xxx786' });
  });

  it('names the account even on a receiver mismatch, and never confirms the order', async () => {
    h.verify.mockResolvedValue({
      ok: false,
      code: 'RECEIVER_MISMATCH',
      detail: 'receiver …1789 vs store …5786',
      provider: 'slip2go',
      receiverAccount: 'xxx-x-x1789-x',
    });

    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      slipReceiver: { masked: 'xxx-x-x1789-x', last4: '1789' },
      matchesStore: false,
      verdict: 'RECEIVER_MISMATCH',
    });
    expect(String(body['message'])).toContain('ไม่ใช่บัญชีร้าน');
    expect(lastUpdate()).toMatchObject({ slipReceiverAccount: 'xxx-x-x1789-x' });
    // Read-only by contract: no status change anywhere.
    expect(h.prisma.order.update).not.toHaveBeenCalled();
  });

  it('a provider failure still answers 200 with a null receiver, so the by-eye path unblocks', async () => {
    h.verify.mockResolvedValue({
      ok: false,
      code: 'UPSTREAM_ERROR',
      detail: null,
      provider: 'slip2go',
      receiverAccount: null,
    });

    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body).toMatchObject({ slipReceiver: null, verdict: 'UPSTREAM_ERROR' });
    expect(body['message']).toContain('ขัดข้อง');
    // No account → nothing to record, and no junk attempt row either.
    expect(h.prisma.paymentAttempt.update).not.toHaveBeenCalled();
    expect(h.prisma.paymentAttempt.create).not.toHaveBeenCalled();
  });

  it('never writes an attempt that already carries a verdict', async () => {
    h.prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'att-1',
      failureReason: 'RECEIVER_MISMATCH',
    });
    expect((await post()).status).toBe(200);
    expect(h.prisma.paymentAttempt.update).not.toHaveBeenCalled();

    // A passed check is a verdict too.
    h.prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'att-2',
      failureReason: null,
      slipVerifiedRef: 'ref-735',
    });
    expect((await post()).status).toBe(200);
    expect(h.prisma.paymentAttempt.update).not.toHaveBeenCalled();
  });

  it('creates a pending attempt when the manual upload never made one', async () => {
    h.prisma.paymentAttempt.findFirst.mockResolvedValue(null);

    const { status } = await post();
    expect(status).toBe(200);
    expect(h.prisma.paymentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: ORDER_ID,
          paymentMethod: 'promptpay',
          status: 'pending',
          slipReceiverAccount: '199-1-xxx786',
        }),
      }),
    );
    // Recorded on the row it just created — no second write.
    expect(h.prisma.paymentAttempt.update).not.toHaveBeenCalled();
  });

  it('reuses a stored receiver instead of spending a second credit', async () => {
    h.prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'att-1',
      failureReason: null,
      slipVerifiedRef: null,
      slipReceiverAccount: '199-1-xxx786',
    });
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      slipReceiver: { last4: '1786' },
      matchesStore: true,
      verdict: null,
    });
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.prisma.paymentAttempt.update).not.toHaveBeenCalled();
  });

  it('asks the provider without a store account, and still returns a refusal with the account', async () => {
    h.manualInfo = { ...h.manualInfo, accountNumber: null };
    h.verify.mockResolvedValue({
      ok: false,
      code: 'RECEIVER_UNCONFIGURED',
      detail: 'store receiving account not configured',
      provider: 'slip2go',
      receiverAccount: '199-1-xxx786',
    });

    const { status, body } = await post();
    expect(status).toBe(200);
    expect(h.verify).toHaveBeenCalledWith(
      expect.objectContaining({ storeAccountNumber: null, requireStoreAccount: false }),
    );
    expect(body).toMatchObject({
      slipReceiver: { last4: '1786' },
      matchesStore: null,
      verdict: 'RECEIVER_UNCONFIGURED',
    });
  });
});
