/**
 * End-to-end-ish coverage for the slip flow (client ask 2026-10-17):
 *
 *  1. Automatic verification actually dispatches: Slip2Go first when its
 *     secret is set, SlipOK only otherwise.
 *  2. Provider fallback: a transient Slip2Go failure (outage/quota/config)
 *     retries on SlipOK when it is configured, so a real slip can still
 *     confirm instead of being dumped into the manual queue.
 *  3. Evidence is kept BEFORE the provider is called — the admin fallback
 *     always sees exactly the image the customer submitted, and the failure
 *     response tells the client it can skip a duplicate upload.
 *  4. Admin fallback is reachable: a non-confirming verification pings the
 *     admin (Discord) and slip-upload (pure manual path) pings as well.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  /** Loose shapes — the route under test only reads a few fields. */
  type Row = Record<string, unknown>;
  const prisma = {
    siteSetting: {
      create: vi.fn(async (_args: Row): Promise<Row> => ({})),
      findUnique: vi.fn(async (_args: Row): Promise<Row | null> => null),
    },
    order: {
      update: vi.fn(async (_args: Row): Promise<Row> => ({})),
      findUnique: vi.fn(async (_args: Row): Promise<Row | null> => null),
    },
    paymentAttempt: {
      findFirst: vi.fn(async (_args: Row): Promise<Row | null> => null),
      update: vi.fn(async (_args: Row): Promise<Row> => ({})),
    },
    productVariant: {
      findMany: vi.fn(async (_args: Row): Promise<Row[]> => []),
    },
    // Interactive-tx shape: the mock passes ITSELF as the tx client.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  const orders = {
    getOrderById: vi.fn(async (_id: string): Promise<Row | null> => null),
    claimOrderForConfirmation: vi.fn(
      async (_id: string, ..._rest: unknown[]): Promise<Row | null> => null,
    ),
  };
  const fulfil = {
    fulfilOrder: vi.fn(async (..._args: unknown[]): Promise<Row> => ({ success: true })),
    scheduleOutboxDrain: vi.fn(async () => undefined),
  };
  const notify = {
    getNotificationSettings: vi.fn(async () => ({})),
    notifyPaymentConfirmed: vi.fn(async () => undefined),
    notifyPaymentPending: vi.fn(async () => undefined),
    notifyStockLow: vi.fn(async () => undefined),
    notifyStockOutOf: vi.fn(async () => undefined),
  };
  const slipSec = {
    isValidSlipUploadToken: vi.fn(() => true),
    mintSlipStorageKey: vi.fn(() => 'slip:abc123'),
    slipImageRoute: vi.fn((key: string) => `/api/v1/payments/slip-download/${key.slice(5)}`),
  };
  /** Provider verdicts: success and every failure code we map. */
  interface VerifyOutcome {
    ok: boolean;
    code?: string;
    detail?: string;
    ref?: string;
    amountThb?: number;
    receiverAccount?: string | null;
    receiverName?: string | null;
    transferAt?: string | null;
    raw?: Record<string, unknown>;
  }
  const slipok = {
    isSlipVerificationEnabled: vi.fn(() => false),
    verifySlip: vi.fn(async (_input: unknown): Promise<VerifyOutcome> => ({
      ok: false,
      code: 'NOT_CONFIGURED',
    })),
  };
  const slip2go = {
    isSlip2GoEnabled: vi.fn(() => false),
    verifySlip2Go: vi.fn(async (_input: unknown): Promise<VerifyOutcome> => ({
      ok: false,
      code: 'NOT_CONFIGURED',
    })),
  };
  const rate = {
    getClientIp: vi.fn(() => '203.0.113.9'),
    checkRateLimit: vi.fn(async () => ({ allowed: true })),
  };
  return { prisma, orders, fulfil, notify, slipSec, slipok, slip2go, rate };
});

vi.mock('@/lib/db', () => ({ prisma: h.prisma }));
vi.mock('@/api/orders', () => h.orders);
vi.mock('@/lib/fulfilment', () => h.fulfil);
vi.mock('@/lib/notify', () => h.notify);
vi.mock('@/lib/slipSecurity', () => h.slipSec);
vi.mock('@/lib/payment/slipok', () => h.slipok);
vi.mock('@/lib/payment/slip2go', () => h.slip2go);
vi.mock('@/lib/rateLimit', () => h.rate);
vi.mock('@/lib/paymentReconciliation', () => ({
  recordPaymentReconciliation: vi.fn(async () => 'rec-1'),
}));

const ORDER = {
  id: 'ord-flow',
  orderNumber: 'NK-9001',
  customerEmail: 'buyer@example.test',
  status: 'pending_payment',
  totalAmountThb: 300,
  confirmationUuid: 'cu-flow',
  items: [{ variantId: 'v1' }],
};

const slipOkSuccess = {
  ok: true as const,
  ref: 'SLIP-REF-1',
  amountThb: 300,
  receiverAccount: 'x-3109',
  receiverName: 'ร้านนกกะทา',
  transferAt: null,
  raw: {},
};

/** PNG signature as base64 — enough for the evidence MIME sniff. */
const PNG_B64 = 'iVBORw0KGgo=';

function postVerify(): NextRequest {
  return new NextRequest('http://localhost/api/v1/payments/slip-verify', {
    method: 'POST',
    body: JSON.stringify({ orderId: ORDER.id, token: 'tok', imageBase64: PNG_B64 }),
    headers: { 'content-type': 'application/json' },
  });
}

function postUpload(): NextRequest {
  const form = new FormData();
  form.set('orderId', ORDER.id);
  form.set('token', 'tok');
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
  ]);
  form.set('slip', new File([bytes], 'slip.png', { type: 'image/png' }));
  return new NextRequest('http://localhost/api/v1/payments/slip-upload', {
    method: 'POST',
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.slip2go.isSlip2GoEnabled.mockReturnValue(false);
  h.slipok.isSlipVerificationEnabled.mockReturnValue(false);
  h.rate.checkRateLimit.mockResolvedValue({ allowed: true });
  h.slipSec.isValidSlipUploadToken.mockReturnValue(true);
  h.orders.getOrderById.mockResolvedValue({ ...ORDER });
  h.orders.claimOrderForConfirmation.mockResolvedValue({ id: ORDER.id });
  h.prisma.paymentAttempt.findFirst.mockResolvedValue({ id: 'att-flow' });
  h.prisma.paymentAttempt.update.mockResolvedValue({});
  h.prisma.order.update.mockResolvedValue({});
  h.prisma.siteSetting.create.mockResolvedValue({});
  h.fulfil.fulfilOrder.mockResolvedValue({ success: true });
});

async function callVerify(): Promise<Response> {
  const route = (await import('@/app/api/v1/payments/slip-verify/route')) as unknown as Record<
    string,
    (r: NextRequest) => Promise<Response>
  >;
  return route['POST']!(postVerify());
}

describe('provider dispatch in POST /api/v1/payments/slip-verify', () => {
  it('calls Slip2Go (not SlipOK) when its secret is set', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);

    const res = await callVerify();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('confirmed');
    expect(h.slip2go.verifySlip2Go).toHaveBeenCalledTimes(1);
    expect(h.slipok.verifySlip).not.toHaveBeenCalled();
  });

  it('skips the upstream call when Slip2Go is not configured', async () => {
    h.slipok.isSlipVerificationEnabled.mockReturnValue(true);
    h.slipok.verifySlip.mockResolvedValueOnce(slipOkSuccess);

    const res = await callVerify();
    expect(res.status).toBe(200);
    expect(h.slip2go.verifySlip2Go).not.toHaveBeenCalled();
    expect(h.slipok.verifySlip).toHaveBeenCalledTimes(1);
  });

  it('retries on SlipOK when Slip2Go fails transiently (outage)', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slipok.isSlipVerificationEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({
      ok: false,
      code: 'UPSTREAM_ERROR',
      detail: 'HTTP 502',
    });
    h.slipok.verifySlip.mockResolvedValueOnce(slipOkSuccess);

    const res = await callVerify();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('confirmed');
    expect(h.slip2go.verifySlip2Go).toHaveBeenCalledTimes(1);
    expect(h.slipok.verifySlip).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on a definitive verdict (amount mismatch)', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slipok.isSlipVerificationEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({
      ok: false,
      code: 'AMOUNT_MISMATCH',
      detail: 'slip 250 vs order 300',
    });

    const res = await callVerify();
    expect(res.status).toBe(422);
    expect(h.slipok.verifySlip).not.toHaveBeenCalled();
  });
});

describe('evidence + admin fallback', () => {
  it('stores the slip image BEFORE checking, pings the admin and admits slipStored on failure', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({
      ok: false,
      code: 'AMOUNT_MISMATCH',
      detail: 'slip 250 vs order 300',
    });

    const res = await callVerify();
    expect(res.status).toBe(422);
    const body = (await res.json()) as { slipStored?: boolean; message?: string };
    expect(body.slipStored).toBe(true);
    expect(body.message).toContain('ยอดโอนในสลิปไม่ตรง');

    // The image went to the private slip: namespace and is linked to the
    // order — the admin's จัดการคำสั่งซื้อ panel shows it during manual review.
    expect(h.prisma.siteSetting.create).toHaveBeenCalledTimes(1);
    const created = (
      h.prisma.siteSetting.create.mock.calls[0]![0] as { data: { key: string; value: string } }
    ).data;
    expect(created.key.startsWith('slip:')).toBe(true);
    expect(created.value.startsWith('data:image/png;base64,')).toBe(true);
    expect(h.prisma.order.update).toHaveBeenCalledWith({
      where: { id: ORDER.id },
      data: { slipImageUrl: expect.stringContaining('/slip-download/'), slipUploadedAt: expect.any(Date) },
    });

    // Admin knows a slip is waiting for manual review.
    expect(h.notify.notifyPaymentPending).toHaveBeenCalledWith({
      orderNumber: ORDER.orderNumber,
      totalThb: 300,
      customerEmail: ORDER.customerEmail,
    });
  });

  it('also keeps the evidence when the slip passes', async () => {
    h.slipok.isSlipVerificationEnabled.mockReturnValue(true);
    h.slipok.verifySlip.mockResolvedValueOnce(slipOkSuccess);

    const res = await callVerify();
    expect(res.status).toBe(200);
    expect(h.prisma.siteSetting.create).toHaveBeenCalledTimes(1);
    // Confirmed payments do not need the manual-review ping.
    expect(h.notify.notifyPaymentPending).not.toHaveBeenCalled();
    expect(h.notify.notifyPaymentConfirmed).toHaveBeenCalled();
  });

  it('slip-upload (pure manual path) stores the slip and pings the admin too', async () => {
    const route = (await import('@/app/api/v1/payments/slip-upload/route')) as unknown as Record<
      string,
      (r: NextRequest) => Promise<Response>
    >;
    const res = await route['POST']!(postUpload());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; slipImageUrl: string };
    expect(body.status).toBe('slip_received');
    expect(body.slipImageUrl).toContain('/slip-download/');
    expect(h.prisma.siteSetting.create).toHaveBeenCalledTimes(1);
    expect(h.notify.notifyPaymentPending).toHaveBeenCalledWith({
      orderNumber: ORDER.orderNumber,
      totalThb: 300,
      customerEmail: ORDER.customerEmail,
    });
  });

  it('still rejects a slip upload without a valid capability token', async () => {
    h.slipSec.isValidSlipUploadToken.mockReturnValue(false);
    const route = (await import('@/app/api/v1/payments/slip-upload/route')) as unknown as Record<
      string,
      (r: NextRequest) => Promise<Response>
    >;
    const res = await route['POST']!(postUpload());
    expect(res.status).toBe(403);
    expect(h.prisma.siteSetting.create).not.toHaveBeenCalled();
    expect(h.notify.notifyPaymentPending).not.toHaveBeenCalled();
  });
});