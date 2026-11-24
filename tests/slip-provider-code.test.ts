/**
 * Raw provider code behind a slip verdict (23 พ.ย. 2569).
 *
 * Order NK-2026-000237 was refused as `INVALID_SLIP` while the customer's slip
 * was a real ฿67 Bangkok Bank transfer. The attempt row kept the verdict and a
 * prose `detail` (`fraud: …` for 200500 — the code already gone), so nobody
 * could say WHY without the worker console of the request that produced it,
 * i.e. prod shell access. The probe endpoint exists to answer that from the
 * admin API:
 *
 *   PC1  a provider code survives the mapping (`200500` → INVALID_SLIP still
 *        carries `providerCode: '200500'`, never only the prose detail)
 *   PC2  an undocumented `200xxx` keeps its own code too (that is the class of
 *        answer most worth seeing)
 *   PC3  GET reports what the row already knows with NO provider call (free,
 *        and the only route that works on historic rows)
 *   PC4  GET surfaces a stored `providerCode` when the row has one
 *   PC5  POST re-reads the STORED slip through Slip2Go exactly once and
 *        reports the raw code — while writing nothing at all
 *   PC6  POST without a stored slip file answers 409 and spends no credit
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_SLIP2GO_SECRET'] = 'probe-test-secret';
process.env['NK_SLIP2GO_BASE'] = 'https://slip2go.test';

const h = vi.hoisted(() => {
  const prisma = {
    order: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    paymentAttempt: { update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  };
  return { prisma };
});

vi.mock('@/lib/db', () => ({ prisma: h.prisma }));
vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn(async () => ({
    allowed: true,
    payload: { sub: 'adm-1', perms: ['orders:read', 'orders:write'] },
  })),
}));
vi.mock('@/lib/adminRequest', () => ({ getAdminToken: vi.fn(() => 'admin-token') }));
// Real module pulls React.cache at import time, which the node test env lacks.
vi.mock('@/lib/data', () => ({
  getManualTransferInfo: vi.fn(async () => ({ accountNumber: '199-1-73578-6' })),
}));
vi.mock('@/lib/slipStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/slipStore')>();
  return { ...actual, readSlip: vi.fn(async () => Buffer.from('stored-slip-bytes')) };
});

import { GET, POST } from '@/app/api/v1/admin/orders/[id]/slip-provider-code/route';
import { getManualTransferInfo } from '@/lib/data';
import { verifySlip2Go } from '@/lib/payment/slip2go';
import { readSlip } from '@/lib/slipStore';

const SLIP_URL = '/api/v1/payments/slip-download/0123456789abcdef0123456789abcdef';

const ORDER = {
  id: 'ord-237',
  orderNumber: 'NK-2026-000237',
  // Prisma Decimal arrives as a string through JSON — Number() must cope.
  totalAmountThb: '67.00',
  slipImageUrl: SLIP_URL,
  slipUploadedAt: new Date('2026-11-23T14:11:00.000Z'),
  paymentAttempts: [
    {
      failureReason: 'INVALID_SLIP',
      gatewayStatusCode: 'slip2go',
      slipVerifiedBy: null,
      slipVerifiedRef: null,
      gatewayResponse: {
        provider: 'slip2go',
        error: 'INVALID_SLIP',
        detail: 'fraud: สลิปไม่ถูกต้อง',
        checkedAt: '2026-11-23T14:12:03.000Z',
      },
      updatedAt: new Date('2026-11-23T14:12:03.000Z'),
    },
  ],
};

const CTX = { params: Promise.resolve({ id: 'ord-237' }) };
const URL = 'http://localhost/api/v1/admin/orders/ord-237/slip-provider-code';

const getReq = (): NextRequest =>
  new NextRequest(URL, { headers: { authorization: 'Bearer admin-token' } });

const postReq = (): NextRequest =>
  new NextRequest(URL, { method: 'POST', headers: { authorization: 'Bearer admin-token' } });

/** Answer one provider call the way connect.slip2go.com does. */
function providerSays(code: string, message: string): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ code, message, data: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = providerSays('200500', 'สลิปไม่ถูกต้อง');
  h.prisma.order.findUnique.mockResolvedValue(structuredClone(ORDER));
  (readSlip as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from('slip-bytes'));
  (getManualTransferInfo as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    accountNumber: '199-1-73578-6',
  });
});

describe('the raw code survives the Slip2Go mapping', () => {
  it('PC1 fraud (200500) keeps its code instead of only the prose detail', async () => {
    providerSays('200500', 'สลิปไม่ถูกต้อง');
    const result = await verifySlip2Go({ imageBase64: 'AAAA', expectedAmountThb: 67 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SLIP');
    // The old shape was unreadable evidence: `fraud: <message>`, code gone.
    expect(result.providerCode).toBe('200500');
    expect(result.providerMessage).toBe('สลิปไม่ถูกต้อง');
    expect(result.httpStatus).toBe(200);
  });

  it('PC2 an undocumented 200xxx keeps its own code', async () => {
    providerSays('200777', 'unknown condition');
    const result = await verifySlip2Go({ imageBase64: 'AAAA', expectedAmountThb: 67 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SLIP');
    expect(result.providerCode).toBe('200777');
  });
});

describe('GET reports what the attempt row already knows', () => {
  it('PC3 answers the stored verdict and detail with no provider call (free)', async () => {
    const res = await GET(getReq(), CTX);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      orderNumber: string;
      stored: { verdict: string; provider: string; detail: string; providerCode: string | null };
      slipImage: { available: boolean };
    };
    expect(body.orderNumber).toBe('NK-2026-000237');
    expect(body.stored.verdict).toBe('INVALID_SLIP');
    expect(body.stored.provider).toBe('slip2go');
    expect(body.stored.detail).toContain('fraud:');
    // Rows written before the code was persisted cannot have one.
    expect(body.stored.providerCode).toBeNull();
    expect(body.slipImage.available).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('PC4 surfaces the raw code once the row carries one', async () => {
    const order = structuredClone(ORDER);
    order.paymentAttempts[0]!.gatewayResponse = {
      ...order.paymentAttempts[0]!.gatewayResponse,
      providerCode: '200500',
    } as never;
    h.prisma.order.findUnique.mockResolvedValue(order);

    const body = (await (await GET(getReq(), CTX)).json()) as {
      stored: { providerCode: string | null };
    };
    expect(body.stored.providerCode).toBe('200500');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST re-reads the stored slip through the provider', () => {
  it('PC5 one paid call, raw code returned, nothing written', async () => {
    fetchMock = providerSays('200500', 'สลิปไม่ถูกต้อง');

    const res = await POST(postReq(), CTX);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      matched: boolean;
      verdict: string;
      providerCode: string | null;
      providerMessage: string | null;
      httpStatus: number | null;
      detail: string | null;
      writes: boolean;
    };
    expect(body.matched).toBe(false);
    expect(body.verdict).toBe('INVALID_SLIP');
    expect(body.providerCode).toBe('200500');
    expect(body.providerMessage).toBe('สลิปไม่ถูกต้อง');
    expect(body.httpStatus).toBe(200);
    expect(body.writes).toBe(false);

    // Exactly one credit: one fetch, with the order's own amount.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as {
      payload: { checkCondition: { checkAmount: { amount: string } } };
    };
    expect(sent.payload.checkCondition.checkAmount.amount).toBe('67');

    // Diagnostics only — no verdict, no evidence, no re-check budget touched.
    expect(h.prisma.order.update).not.toHaveBeenCalled();
    expect(h.prisma.paymentAttempt.update).not.toHaveBeenCalled();
    expect(h.prisma.paymentAttempt.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.paymentAttempt.create).not.toHaveBeenCalled();
  });

  it('PC6 no stored slip file → 409 and no credit spent', async () => {
    const order = structuredClone(ORDER);
    order.slipImageUrl = null as never;
    h.prisma.order.findUnique.mockResolvedValue(order);

    const res = await POST(postReq(), CTX);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('SLIP_NOT_AVAILABLE');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
