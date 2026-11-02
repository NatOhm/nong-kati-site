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
import { readFileSync } from 'node:fs';
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
      create: vi.fn(async (_args: Row): Promise<Row> => ({ id: 'att-new' })),
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
    notifyStockAlertsForVariants: vi.fn(async () => undefined),
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
    verifySlip: vi.fn(
      async (_input: unknown): Promise<VerifyOutcome> => ({
        ok: false,
        code: 'NOT_CONFIGURED',
      }),
    ),
  };
  const slip2go = {
    isSlip2GoEnabled: vi.fn(() => false),
    verifySlip2Go: vi.fn(
      async (_input: unknown): Promise<VerifyOutcome> => ({
        ok: false,
        code: 'NOT_CONFIGURED',
      }),
    ),
  };
  const rate = {
    getClientIp: vi.fn(() => '203.0.113.9'),
    checkRateLimit: vi.fn(async () => ({ allowed: true })),
  };
  // Route reads the store receiving account via getManualTransferInfo —
  // mocked here because the real module pulls React.cache at import time,
  // which does not exist in the vitest environment.
  const manualTransfer = {
    getManualTransferInfo: vi.fn(
      async (): Promise<Row> => ({
        enabled: true,
        accountName: 'ร้านนกกะทา',
        accountNumber: null,
        accountType: 'bank',
        bankName: null,
        qrImageUrl: null,
      }),
    ),
  };
  /** Delivered codes for the 200 body (client ask: show the product on the page). */
  const codes = {
    getDeliveredCodes: vi.fn(async (_orderId: string): Promise<Row[]> => []),
  };
  return { prisma, orders, fulfil, notify, slipSec, slipok, slip2go, rate, manualTransfer, codes };
});

vi.mock('@/lib/db', () => ({ prisma: h.prisma }));
vi.mock('@/api/orders', () => h.orders);
vi.mock('@/lib/fulfilment', () => h.fulfil);
vi.mock('@/lib/notify', () => h.notify);
vi.mock('@/lib/slipSecurity', () => h.slipSec);
vi.mock('@/lib/delivery/customerCodes', () => h.codes);
vi.mock('@/lib/payment/slipok', () => h.slipok);
vi.mock('@/lib/payment/slip2go', () => h.slip2go);
vi.mock('@/lib/rateLimit', () => h.rate);
vi.mock('@/lib/data', () => ({
  getManualTransferInfo: (...args: unknown[]) =>
    (h.manualTransfer.getManualTransferInfo as (...a: unknown[]) => unknown)(...args),
}));
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
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
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
  h.manualTransfer.getManualTransferInfo.mockResolvedValue({
    enabled: true,
    accountName: 'ร้านนกกะทา',
    accountNumber: null,
    accountType: 'bank',
    bankName: null,
    qrImageUrl: null,
  });
  h.fulfil.fulfilOrder.mockResolvedValue({ success: true });
  h.codes.getDeliveredCodes.mockResolvedValue([]);
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
    // Fix C: the audit label records the real provider, not a hardcoded one.
    expect(h.prisma.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slipVerifiedBy: 'slip2go:auto' }),
      }),
    );
  });

  it('creates the pending attempt when the manual-transfer checkout never made one', async () => {
    // Production path: checkout shows the bank account and never calls
    // /payments/initiate, the only other creator of a PaymentAttempt. Before
    // this guard the bank said yes and the confirmation had nowhere to land
    // (409 NO_PENDING_ATTEMPT), so every real slip fell back to manual review.
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    h.prisma.paymentAttempt.findFirst.mockResolvedValue(null);

    const res = await callVerify();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('confirmed');
    expect(h.prisma.paymentAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: ORDER.id,
        paymentMethod: 'promptpay',
        gatewayName: 'slip2go',
        status: 'pending',
      }),
      select: { id: true },
    });
    expect(h.prisma.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'att-new' },
        data: expect.objectContaining({ slipVerifiedRef: 'SLIP-REF-1' }),
      }),
    );
    expect(h.fulfil.fulfilOrder).toHaveBeenCalled();
  });

  it('returns the delivered product + code on the confirming response (no-store)', async () => {
    // Client ask 2026-11-01: "can the product be shown on the webpage when
    // payment transaction is correct and fulfil". The codes ride on the very
    // request that proved the slip, so the payment screen needs no reload and
    // no second endpoint — and it must never be cached.
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    h.codes.getDeliveredCodes.mockResolvedValueOnce([
      { code: 'M365-AAAA-BBBB', productName: 'Microsoft 365 30 วัน', denomination: 18 },
    ]);

    const res = await callVerify();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      confirmationUuid: string;
      codes: Array<{ code: string; productName: string; denomination: number }>;
    };
    expect(body.status).toBe('confirmed');
    expect(body.confirmationUuid).toBe(ORDER.confirmationUuid);
    expect(body.codes).toEqual([
      { code: 'M365-AAAA-BBBB', productName: 'Microsoft 365 30 วัน', denomination: 18 },
    ]);
    expect(res.headers.get('cache-control')).toContain('no-store');
    // The ops card names the buyer (client ask 2026-11-01).
    expect(h.notify.notifyPaymentConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: ORDER.orderNumber, customerEmail: ORDER.customerEmail }),
    );
  });

  it('answers a verified-but-unrecordable slip in Thai, never a bare machine code', async () => {
    // The client's screenshot was `NO_PENDING_ATTEMPT` printed in red on the
    // payment screen. If the attempt write ever fails again, the bank already
    // confirmed the money — the answer must say that and reach the admin.
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    h.prisma.paymentAttempt.findFirst.mockResolvedValueOnce(null);
    h.prisma.paymentAttempt.create.mockRejectedValueOnce(new Error('db down'));

    const res = await callVerify();
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; message: string; slipStored: boolean };
    // The code stays in the body for logs/tests, but the sentence is Thai and
    // says the payment was verified and a human will finish it.
    expect(body.error).toBe('NO_PENDING_ATTEMPT');
    expect(body.message).toContain('ธนาคารยืนยันการชำระเงิน');
    expect(body.message).not.toContain('NO_PENDING_ATTEMPT');
    expect(body.slipStored).toBe(true);
    expect(h.notify.notifyPaymentPending).toHaveBeenCalled();
  });

  it('passes the store receiving account to Slip2Go for the receiver check', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({ ...slipOkSuccess, receiverAccount: 'x-5786' });
    h.manualTransfer.getManualTransferInfo.mockResolvedValueOnce({
      enabled: true,
      accountName: 'ร้านนกกะทา',
      accountNumber: '123-456-5786',
      accountType: 'bank',
      bankName: null,
      qrImageUrl: null,
    });

    const res = await callVerify();
    expect(res.status).toBe(200);
    expect(h.slip2go.verifySlip2Go).toHaveBeenCalledWith(
      expect.objectContaining({ expectedReceiverDigits: '1234565786' }),
    );
  });

  it('skips the upstream call when Slip2Go is not configured', async () => {
    h.slipok.isSlipVerificationEnabled.mockReturnValue(true);
    h.slipok.verifySlip.mockResolvedValueOnce(slipOkSuccess);

    const res = await callVerify();
    expect(res.status).toBe(200);
    expect(h.slip2go.verifySlip2Go).not.toHaveBeenCalled();
    expect(h.slipok.verifySlip).toHaveBeenCalledTimes(1);
    expect(h.prisma.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slipVerifiedBy: 'slipok:auto' }),
      }),
    );
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

  it('does NOT retry or confirm on a wrong-account slip (receiver mismatch)', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slipok.isSlipVerificationEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({
      ok: false,
      code: 'RECEIVER_MISMATCH',
      detail: 'receiver …9999 vs store …5786',
    });

    const res = await callVerify();
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe('RECEIVER_MISMATCH');
    // A wrong-account slip must never be retried on the other provider
    // hoping for a pass, and must never reach fulfilment.
    expect(h.slipok.verifySlip).not.toHaveBeenCalled();
    expect(h.fulfil.fulfilOrder).not.toHaveBeenCalled();
    // The failed check is stamped on the pending attempt for the admin UI
    // (slipCheck) — the order itself stays payable for manual review.
    expect(h.prisma.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: 'att-flow' },
      data: expect.objectContaining({
        failureReason: 'RECEIVER_MISMATCH',
        gatewayStatusCode: 'slip2go',
      }),
    });
  });

  it('applies the receiver policy after a Slip2Go SUCCESS (provider 200200 is not enough)', async () => {
    // The provider said the slip is fine while reporting an account the
    // store does not own — the route's receiverPolicy compare is the guard.
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({
      ...slipOkSuccess,
      receiverAccount: 'xxx-x-x9999-x',
    });
    h.manualTransfer.getManualTransferInfo.mockResolvedValueOnce({
      enabled: true,
      accountName: 'ร้านนกกะทา',
      accountNumber: '123-456-5786',
      accountType: 'bank',
      bankName: null,
      qrImageUrl: null,
    });

    const res = await callVerify();
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string; slipStored?: boolean; detail?: string };
    expect(body.error).toBe('RECEIVER_MISMATCH');
    expect(body.slipStored).toBe(true);
    expect(body.detail).toContain('9999'); // last-4 only, never the full number
    // Order stays payable for manual review; evidence was kept first.
    expect(h.fulfil.fulfilOrder).not.toHaveBeenCalled();
    // Local receiver guard verdict is stamped for the admin UI to show.
    expect(h.prisma.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: 'att-flow' },
      data: expect.objectContaining({
        failureReason: 'RECEIVER_MISMATCH',
        gatewayStatusCode: 'slip2go',
      }),
    });
    expect(h.prisma.siteSetting.create).toHaveBeenCalledTimes(1);
  });

  it('closes the SlipOK-fallback gap: wrong receiver on the fallback path 422s too', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slipok.isSlipVerificationEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({
      ok: false,
      code: 'UPSTREAM_ERROR',
      detail: 'HTTP 502',
    });
    h.slipok.verifySlip.mockResolvedValueOnce({
      ...slipOkSuccess,
      receiverAccount: 'xxx-x-x9999-x',
    });
    h.manualTransfer.getManualTransferInfo.mockResolvedValueOnce({
      enabled: true,
      accountName: 'ร้านนกกะทา',
      accountNumber: '123-456-5786',
      accountType: 'bank',
      bankName: null,
      qrImageUrl: null,
    });

    const res = await callVerify();
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe('RECEIVER_MISMATCH');
    expect(h.slipok.verifySlip).toHaveBeenCalledTimes(1);
    expect(h.fulfil.fulfilOrder).not.toHaveBeenCalled();
    // Fallback-path failure is stamped with the provider that produced it.
    expect(h.prisma.paymentAttempt.update).toHaveBeenCalledWith({
      where: { id: 'att-flow' },
      data: expect.objectContaining({
        failureReason: 'RECEIVER_MISMATCH',
        gatewayStatusCode: 'slipok',
      }),
    });
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
      data: {
        slipImageUrl: expect.stringContaining('/slip-download/'),
        slipUploadedAt: expect.any(Date),
      },
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

/** JSON entry point with a caller-chosen body (multipart covers the rest). */
function postJson(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/payments/slip-verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('entry-point boundaries (adversarial pass, 30 ต.ค.)', () => {
  it('rejects a bad capability token with 403 before any provider call or evidence write', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slipSec.isValidSlipUploadToken.mockReturnValue(false);

    const res = await callVerify();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('INVALID_UPLOAD_TOKEN');
    // Ordering: an order ID alone must not be able to spend quota or make
    // us store arbitrary images.
    expect(h.slip2go.verifySlip2Go).not.toHaveBeenCalled();
    expect(h.prisma.siteSetting.create).not.toHaveBeenCalled();
    expect(h.prisma.order.update).not.toHaveBeenCalled();
  });

  it('answers 409 for an order that is no longer payable, before touching a provider', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.orders.getOrderById.mockResolvedValue({ ...ORDER, status: 'paid' });

    const res = await callVerify();
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('ORDER_NOT_PAYABLE');
    expect(h.slip2go.verifySlip2Go).not.toHaveBeenCalled();
    expect(h.prisma.siteSetting.create).not.toHaveBeenCalled();
  });

  it('maps a duplicate slip (provider 200501 → INVALID_SLIP) to 422 without fulfilling', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({
      ok: false,
      code: 'INVALID_SLIP',
      detail: 'duplicate: รายการนี้ถูกบันทึกไปแล้ว',
    });

    const res = await callVerify();
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error?: string;
      message?: string;
      slipStored?: boolean;
    };
    expect(body.error).toBe('INVALID_SLIP');
    expect(body.message).toContain('ตรวจสลิปไม่ผ่าน');
    // The slip stays in the admin queue, order still payable.
    expect(body.slipStored).toBe(true);
    expect(h.fulfil.fulfilOrder).not.toHaveBeenCalled();
  });

  it('caps the JSON path at MAX_IMAGE_BYTES (the multipart path already did)', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    // ~7 MB of base64 → decodes above the 5 MB ceiling.
    const huge = 'A'.repeat(7 * 1024 * 1024);
    const route = (await import('@/app/api/v1/payments/slip-verify/route')) as unknown as Record<
      string,
      (r: NextRequest) => Promise<Response>
    >;

    const res = await route['POST']!(
      postJson({ orderId: ORDER.id, token: 'tok', imageBase64: huge }),
    );
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toBe('FILE_TOO_LARGE');
    // Never buffered into the evidence row, never forwarded upstream.
    expect(h.slip2go.verifySlip2Go).not.toHaveBeenCalled();
    expect(h.prisma.siteSetting.create).not.toHaveBeenCalled();
  });

  it('keeps checking when the evidence write fails — slipStored:false, verdict still returned', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({
      ok: false,
      code: 'AMOUNT_MISMATCH',
      detail: 'slip 250 vs order 300',
    });
    h.prisma.siteSetting.create.mockRejectedValueOnce(new Error('db down'));

    const res = await callVerify();
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string; slipStored?: boolean };
    expect(body.error).toBe('AMOUNT_MISMATCH');
    expect(body.slipStored).toBe(false);
    expect(h.slip2go.verifySlip2Go).toHaveBeenCalledTimes(1);
  });

  it('warns (not silently) when no store account is configured — the deliberate fail-open', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    h.manualTransfer.getManualTransferInfo.mockResolvedValueOnce({
      enabled: true,
      accountName: 'ร้านนกกะทา',
      accountNumber: null, // unconfigured → receiver check skipped by design
      accountType: 'bank',
      bankName: null,
      qrImageUrl: null,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const res = await callVerify();
      expect(res.status).toBe(200);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('receiver check skipped'));
    } finally {
      warn.mockRestore();
    }
  });
});

/**
 * Confirmation-transaction reliability (2026-11-01 live pass).
 *
 * A genuine ฿9 slip (order NK-2026-000183) was approved by Slip2Go and then
 * lost to Prisma P2028 — "Transaction not found … old closed transaction" —
 * because the confirmation `$transaction` ran on the 5s default on a cold
 * worker. The customer got a 500 ("ส่งโค้ดไม่สำเร็จ") after the bank had said
 * yes, and the order sat at pending_payment until someone re-posted the slip.
 *
 * Contract now: the transaction is sized for this path's real latency, a lost
 * transaction is retried once automatically, and a delivery failure after
 * approval is answered as verified-but-pending (parked for the team) instead
 * of as a failure — while a second POST still answers ORDER_NOT_PAYABLE.
 */
describe('confirmation transaction budget + retry (live P2028, 2026-11-01)', () => {
  const txSpy = (): ReturnType<typeof vi.fn> =>
    h.prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

  const p2028 = (): Error =>
    Object.assign(
      new Error(
        'Transaction not found. Transaction ID is invalid, refers to an old closed ' +
          'transaction Prisma does not have information about anymore.',
      ),
      { code: 'P2028' },
    );

  beforeEach(() => {
    // Restore the pass-through implementation a previous case may have spent.
    txSpy().mockImplementation(async (fn: unknown) =>
      (fn as (tx: unknown) => Promise<unknown>)(h.prisma),
    );
  });

  it('sizes the transaction above the 5s default and retries once when it expires', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    txSpy().mockImplementationOnce(async () => {
      throw p2028();
    });

    const res = await callVerify();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('confirmed');

    // One automatic retry, with a budget this path can actually fit in.
    expect(txSpy()).toHaveBeenCalledTimes(2);
    expect(txSpy().mock.calls[0]![1]).toMatchObject({ timeout: 30000 });
    // A retry after a rollback re-runs the guarded claim — never a second
    // provider call and never a second delivery.
    expect(h.slip2go.verifySlip2Go).toHaveBeenCalledTimes(1);
    expect(h.fulfil.fulfilOrder).toHaveBeenCalledTimes(1);
  });

  it('stops after one retry and parks the order instead of 5xx-ing the customer', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    txSpy()
      .mockImplementationOnce(async () => {
        throw p2028();
      })
      .mockImplementationOnce(async () => {
        throw p2028();
      });

    const res = await callVerify();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; paymentVerified: boolean };
    expect(body.status).toBe('pending_manual_fulfilment');
    expect(body.paymentVerified).toBe(true);
    // Two confirmation attempts + the parking transaction. A third attempt
    // would have hit the restored default and answered 'confirmed' — so this
    // also proves the retry is bounded.
    expect(txSpy()).toHaveBeenCalledTimes(3);
    expect(h.prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending_manual_fulfilment' }),
      }),
    );
  });

  it('a delivery failure after approval answers verified-but-pending, never "failed"', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    h.fulfil.fulfilOrder.mockResolvedValueOnce({ success: false, error: 'CATALOG_LINE_DETACHED' });

    const res = await callVerify();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      message: string;
      paymentVerified: boolean;
    };
    // SlipUploadPanel flips to its paid state on exactly these fields.
    expect(body.status).toBe('pending_manual_fulfilment');
    expect(body.paymentVerified).toBe(true);
    expect(body.message).toContain('ตรวจสลิปผ่านแล้ว');
    // The old wording claimed the charge as a whole had failed.
    expect(body.message).not.toContain('ส่งโค้ดไม่สำเร็จ');
  });

  it('still refuses a second POST for a spent order — 409, no second delivery', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    // The first post already claimed the order.
    h.orders.claimOrderForConfirmation.mockResolvedValueOnce(null);

    const res = await callVerify();
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('ORDER_NOT_PAYABLE');
    expect(h.fulfil.fulfilOrder).not.toHaveBeenCalled();
  });
});

describe('checkout page consumes the confirmed answer', () => {
  // The panel shows the codes; the page only has to drop the cart and keep
  // the paid state. Asserted at source level because the checkout page is a
  // single 750-line client component with no render harness.
  const page = readFileSync('src/app/checkout/page.tsx', 'utf8');

  it('wires every slip panel to the paid handler, not the raw setState', () => {
    expect(page).toContain('onConfirmed={handleSlipConfirmed}');
    expect(page).not.toContain('onConfirmed={setSlipConfirmed}');
  });

  it('the paid handler clears the cart (the order is already paid)', () => {
    const handler = /handleSlipConfirmed = useCallback\(([\s\S]{0,400}?)\]/.exec(page)?.[1] ?? '';
    expect(handler).toContain('setSlipConfirmed(status)');
    expect(handler).toContain('clearCart()');
  });
});

describe('the confirmed panel stays on screen', () => {
  // Regression: the checkout page rendered <SlipUploadPanel> behind
  // `!slipConfirmed`, so the moment verification succeeded the panel — the
  // only thing that shows the bought product and its code — unmounted, and
  // the customer saw a green line where the code had been.
  const page = readFileSync('src/app/checkout/page.tsx', 'utf8');

  it('never gates the slip panel on !slipConfirmed', () => {
    expect(page).not.toContain('order && !slipConfirmed && paymentState');
    expect(page).not.toContain('order && !slipConfirmed &&');
  });

  it('still hides it once the QR flow reports success', () => {
    expect(page).toContain("order && paymentState?.status !== 'succeeded'");
    expect(page).toContain("order && paymentState.status !== 'succeeded'");
  });
});
