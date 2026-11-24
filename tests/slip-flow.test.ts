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
import { CONFIRM_TX_TIMEOUT_MS } from '@/lib/slipConfirmBudget';

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
      // The find-or-create reads the order's timestamp as its claim token…
      findUnique: vi.fn(async (_args: Row): Promise<Row | null> => ({ updatedAt: new Date(0) })),
      // …and claims it with a compare-and-set: 1 row = this caller won,
      // 0 rows = another upload won and this caller must re-read.
      updateMany: vi.fn(async (_args: Row): Promise<{ count: number }> => ({ count: 1 })),
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
  const slipStore = {
    // Slip bytes go to a private file now (src/lib/slipStore.ts), not a row.
    writeSlip: vi.fn(async (_key: string, _bytes: Buffer) => undefined),
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
        accountNumber: '199-1-73578-6',
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
  return { prisma, orders, fulfil, notify, slipSec, slipStore, slipok, slip2go, rate, manualTransfer, codes };
});

vi.mock('@/lib/db', () => ({ prisma: h.prisma }));
vi.mock('@/api/orders', () => h.orders);
vi.mock('@/lib/fulfilment', () => h.fulfil);
vi.mock('@/lib/notify', () => h.notify);
vi.mock('@/lib/slipSecurity', () => h.slipSec);
// Only the disk write is faked: the real magic-byte sniffer stays in place, so
// the MIME assertions below exercise the production sniff (a stub would make
// "a JPEG is declared image/jpeg" vacuous).
vi.mock('@/lib/slipStore', async (importOriginal) => ({
  ...h.slipStore,
  sniffSlipMime: (await importOriginal<typeof import('@/lib/slipStore')>()).sniffSlipMime,
}));
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
  receiverAccount: 'xxx-x-x3578-x',
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
  h.slipStore.writeSlip.mockResolvedValue(undefined);
  h.manualTransfer.getManualTransferInfo.mockResolvedValue({
    enabled: true,
    accountName: 'ร้านนกกะทา',
    accountNumber: '199-1-73578-6',
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

  it('refuses to confirm when the bank names no receiving account (fail closed)', async () => {
    // Audit 2026-11-24. Both providers type the receiver as OPTIONAL
    // (`data.receiver?.account?.bank?.account` / `d.receiver?.account?.value`)
    // and each parser answers ok:true on the success code alone, so a payload
    // without it is reachable. checkReceiverMatch passes anything shorter than
    // 4 digits by design and the provider's own checkReceiver condition is
    // known not to fire (a wrong account still answered 200200), so accepting
    // this would confirm a slip paid to ANY account — and deliver the goods.
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);

    // Two shapes of the same hole: no account at all, and a fully masked line
    // (a present string with zero digits, which checkReceiverMatch also passes).
    for (const receiver of [null, 'xxx-x-xxxx-x']) {
      h.slip2go.verifySlip2Go.mockResolvedValueOnce({
        ...slipOkSuccess,
        receiverAccount: receiver,
      });

      const res = await callVerify();
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: string; message: string; slipStored: boolean };
      expect(body.error).toBe('RECEIVER_MISSING');
      expect(body.message).toContain('ไม่ได้ระบุบัญชีผู้รับ');
      // Nothing was settled and nothing was delivered; the order stays payable.
      expect(body.slipStored).toBe(true);
    }
    expect(h.orders.claimOrderForConfirmation).not.toHaveBeenCalled();
    expect(h.fulfil.fulfilOrder).not.toHaveBeenCalled();
    // The slip is still evidence in the admin queue — a human confirms it.
    expect(h.notify.notifyPaymentPending).toHaveBeenCalled();
  });

  it('fails closed on a store account too short to compare, without spending a credit', async () => {
    // Audit 2026-11-24: a 1–3 digit setting is not an account and can never be
    // compared, but it used to count as "configured" — so the route called the
    // provider and the receiver rule then passed everything.
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.manualTransfer.getManualTransferInfo.mockResolvedValueOnce({
      enabled: true,
      accountName: 'ร้านนกกะทา',
      accountNumber: '12',
      accountType: 'bank',
      bankName: null,
      qrImageUrl: null,
    });

    const res = await callVerify();
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('RECEIVER_UNCONFIGURED');
    expect(h.slip2go.verifySlip2Go).not.toHaveBeenCalled();
    expect(h.orders.claimOrderForConfirmation).not.toHaveBeenCalled();
  });

  it('serializes find-or-create, so two concurrent uploads leave ONE pending attempt', async () => {
    // Audit 2026-11-24: findFirst-then-create let two uploads both read "none"
    // and both INSERT. Nothing double-confirms, but each attempt carries its own
    // paid re-check budget, so concurrent delayed uploads multiplied the shop's
    // provider spend for one order. The read, the claim and the insert now live
    // in ONE transaction, and a conditional write on the parent order decides
    // the winner (see the mechanism test below).
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValue({ ok: false, code: 'SLIP_DELAYED' });

    const created: string[] = [];
    let seq = 0;
    // A real Serializable transaction serializes the two callers on this
    // predicate; model it as a queue so a read+insert OUTSIDE a transaction
    // (the old code) still interleaves and would create two rows.
    let tail: Promise<unknown> = Promise.resolve();
    h.prisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => {
      const run = tail.then(() => fn(h.prisma));
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    });
    h.prisma.paymentAttempt.findFirst.mockImplementation(async () =>
      created.length > 0 ? { id: created.at(-1)! } : null,
    );
    h.prisma.paymentAttempt.create.mockImplementation(async () => {
      seq += 1;
      created.push(`att-${seq}`);
      return { id: `att-${seq}` };
    });
    try {
      const [first, second] = await Promise.all([callVerify(), callVerify()]);

      expect(first.status).toBe(502);
      expect(second.status).toBe(502);
      // The loser reuses the winner's row instead of inserting a twin…
      expect(h.prisma.paymentAttempt.create).toHaveBeenCalledTimes(1);
      expect(created).toEqual(['att-1']);
      // …so both verdicts land on that ONE attempt: one budget, not two.
      const stampedOn = (h.prisma.paymentAttempt.update.mock.calls as unknown[][]).map(
        (call) => (call[0] as { where: { id: string } }).where.id,
      );
      expect(new Set(stampedOn)).toEqual(new Set(['att-1']));
      // Exactly ONE claim write decided it, and it was the conditional write
      // on the parent order — not an engine's gap-lock deadlock.
      const claimCalls = (h.prisma.order.updateMany.mock.calls as unknown[][]).filter(
        (call) => (call[0] as { where: { updatedAt?: unknown } }).where.updatedAt !== undefined,
      );
      expect(claimCalls).toHaveLength(1);
      expect(claimCalls[0]![0]).toMatchObject({
        where: { id: ORDER.id, updatedAt: new Date(0) },
        data: { updatedAt: expect.any(Date) },
      });
      // …and no isolation level is asked of the engine any more.
      const txCalls = (h.prisma.$transaction as unknown as { mock: { calls: unknown[][] } }).mock
        .calls;
      expect(txCalls[0]![1]).toBeUndefined();
    } finally {
      // clearAllMocks keeps implementations, so restore the module defaults.
      h.prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(h.prisma),
      );
      h.prisma.paymentAttempt.findFirst.mockReset();
      h.prisma.paymentAttempt.findFirst.mockResolvedValue({ id: 'att-flow' });
      h.prisma.paymentAttempt.create.mockReset();
      h.prisma.paymentAttempt.create.mockResolvedValue({ id: 'att-new' });
    }
  });

  it('a loser of the conditional claim inserts nothing and adopts the winner attempt', async () => {
    // The mechanism this guard actually rests on: the claim is a
    // compare-and-set on the parent order. Two transactions read the same
    // timestamp; the second one's update matches ZERO rows, so it re-reads and
    // returns the winner's row. No engine error is required for that verdict —
    // which is why the guard no longer depends on Serializable gap-lock
    // deadlocks (engine-specific, and absent where a driver ignores the option).
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValue({ ok: false, code: 'SLIP_DELAYED' });

    const winner = { id: 'att-winner', gatewayResponse: { rechecks: 2 } };
    h.prisma.paymentAttempt.findFirst
      .mockResolvedValueOnce(null) // first pass: nothing committed yet
      .mockResolvedValueOnce(winner); // after losing the claim: the winner's row
    h.prisma.order.updateMany.mockResolvedValueOnce({ count: 0 }); // CAS lost

    const res = await callVerify();
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe('SLIP_DELAYED');

    // It never inserted a twin…
    expect(h.prisma.paymentAttempt.create).not.toHaveBeenCalled();
    // …it claimed with exactly this predicate (a positive, checkable signal)…
    expect(h.prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER.id, updatedAt: new Date(0) },
      data: { updatedAt: expect.any(Date) },
    });
    // …and the verdict landed on the winner's attempt with ITS budget carried
    // forward (2 paid checks already spent, not a fresh 0).
    const stamp = (h.prisma.paymentAttempt.update.mock.calls as unknown[][])[0]![0] as {
      where: { id: string };
      data: { gatewayResponse: { rechecks?: number } };
    };
    expect(stamp.where.id).toBe('att-winner');
    expect(stamp.data.gatewayResponse).toMatchObject({ rechecks: 2 });
    // Two transactions: the lost claim, then the re-read that adopted the row.
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('declares the sniffed image type to the provider — a JPEG is not "image/png"', async () => {
    // This route throws away the multipart file.type and the JSON data-URI
    // prefix, so before the fix every upload reached the provider as PNG.
    // JPEG magic bytes: FF D8 FF E0 …
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({ ...slipOkSuccess });
    const route = (await import('@/app/api/v1/payments/slip-verify/route')) as unknown as Record<
      string,
      (r: NextRequest) => Promise<Response>
    >;
    const res = await route['POST']!(
      new NextRequest('http://localhost/api/v1/payments/slip-verify', {
        method: 'POST',
        body: JSON.stringify({
          orderId: ORDER.id,
          token: 'tok',
          imageBase64: '/9j/4AAQSkZJRgABAQAAAQ==',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    expect(h.slip2go.verifySlip2Go).toHaveBeenCalledWith(
      expect.objectContaining({ imageMime: 'image/jpeg' }),
    );
  });

  it('sends image/png for a PNG upload — the sniff, not a constant', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({ ...slipOkSuccess });
    await callVerify(); // PNG_B64
    expect(h.slip2go.verifySlip2Go).toHaveBeenCalledWith(
      expect.objectContaining({ imageMime: 'image/png' }),
    );
  });

  it('forwards the sniffed type on the SlipOK fallback path too', async () => {
    h.slipok.isSlipVerificationEnabled.mockReturnValue(true);
    h.slipok.verifySlip.mockResolvedValueOnce({ ...slipOkSuccess });
    await callVerify();
    expect(h.slipok.verifySlip).toHaveBeenCalledWith(
      expect.objectContaining({ imageMime: 'image/png' }),
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

  it('records the abandoned provider in the attempt row, not just the last one', async () => {
    // The row used to keep only the final answer, so "why did Slip2Go not
    // answer?" survived only in a log line (audit 2026-11-24).
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slipok.isSlipVerificationEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({
      ok: false,
      code: 'QUOTA_EXCEEDED',
      detail: 'credit 0',
    });
    h.slipok.verifySlip.mockResolvedValueOnce({ ok: false, code: 'INVALID_SLIP', detail: 'bad image' });

    const res = await callVerify();
    expect(res.status).toBe(422);
    expect(h.prisma.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: 'INVALID_SLIP',
          gatewayStatusCode: 'slipok',
          gatewayResponse: expect.objectContaining({
            provider: 'slipok',
            error: 'INVALID_SLIP',
            fallback: { provider: 'slip2go', code: 'QUOTA_EXCEEDED', detail: 'credit 0' },
          }),
        }),
      }),
    );
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
    expect(h.slipStore.writeSlip).toHaveBeenCalledTimes(1);
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
    expect(h.slipStore.writeSlip).toHaveBeenCalledTimes(1);
    const [storedKey, storedBytes] = h.slipStore.writeSlip.mock.calls[0]! as [string, Buffer];
    expect(storedKey.startsWith('slip:')).toBe(true);
    // PNG magic bytes — the file holds the image itself, not a data URL.
    expect(storedBytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
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
    expect(h.slipStore.writeSlip).toHaveBeenCalledTimes(1);
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
    expect(h.slipStore.writeSlip).toHaveBeenCalledTimes(1);
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
    expect(h.slipStore.writeSlip).not.toHaveBeenCalled();
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
    expect(h.slipStore.writeSlip).not.toHaveBeenCalled();
    expect(h.prisma.order.update).not.toHaveBeenCalled();
  });

  it('answers 409 for an order that is no longer payable, before touching a provider', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    // 'payment_confirmed' is a status production actually writes ('paid' is
    // not — a mock with an impossible status proves nothing).
    h.orders.getOrderById.mockResolvedValue({ ...ORDER, status: 'payment_confirmed' });

    const res = await callVerify();
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('ORDER_NOT_PAYABLE');
    expect(h.slip2go.verifySlip2Go).not.toHaveBeenCalled();
    expect(h.slipStore.writeSlip).not.toHaveBeenCalled();
  });

  it('maps a duplicate slip (provider 200501 → SLIP_DUPLICATE) to 422 with an "already confirmed" message', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({
      ok: false,
      code: 'SLIP_DUPLICATE',
      detail: 'duplicate: รายการนี้ถูกบันทึกไปแล้ว',
    });

    const res = await callVerify();
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error?: string;
      message?: string;
      slipStored?: boolean;
    };
    expect(body.error).toBe('SLIP_DUPLICATE');
    // A payment that already succeeded must not read as a bad slip: the
    // customer is told to open the order and see the code.
    expect(body.message).toContain('ถูกใช้ยืนยันคำสั่งซื้อไปแล้ว');
    expect(body.message).toContain('เปิดหน้าคำสั่งซื้อ');
    expect(body.message).not.toContain('ไม่ถูกต้อง');
    // The slip stays in the admin queue, order still payable.
    expect(body.slipStored).toBe(true);
    expect(h.fulfil.fulfilOrder).not.toHaveBeenCalled();
  });

  it('maps SLIP_DELAYED (the bank has not published the slip yet) to 502 — a wait, not an accusation', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({
      ok: false,
      code: 'SLIP_DELAYED',
      detail: '200404: ไม่พบรายการ',
    });

    const res = await callVerify();
    expect(res.status).toBe(502);
    const body = (await res.json()) as {
      error?: string;
      message?: string;
      slipStored?: boolean;
    };
    expect(body.error).toBe('SLIP_DELAYED');
    expect(body.message).toContain('ธนาคารยังไม่พบข้อมูลสลิปนี้');
    expect(body.message).not.toContain('ไม่ถูกต้อง');
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
    expect(h.slipStore.writeSlip).not.toHaveBeenCalled();
  });

  it('keeps checking when the evidence write fails — slipStored:false, verdict still returned', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce({
      ok: false,
      code: 'AMOUNT_MISMATCH',
      detail: 'slip 250 vs order 300',
    });
    h.slipStore.writeSlip.mockRejectedValueOnce(new Error('disk full'));

    const res = await callVerify();
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string; slipStored?: boolean };
    expect(body.error).toBe('AMOUNT_MISMATCH');
    expect(body.slipStored).toBe(false);
    expect(h.slip2go.verifySlip2Go).toHaveBeenCalledTimes(1);
  });

  it('fails CLOSED when no store account is configured — slip parked, never auto-confirmed', async () => {
    // The bank-side checkReceiver is belt-only (the 2026-10-30 live probe sent
    // a wrong accountNumber and still got 200200), so without a store account
    // there is no receiver check at all: any slip confirmed the order. A
    // configuration fault must not spend the customer's money.
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    h.manualTransfer.getManualTransferInfo.mockResolvedValueOnce({
      enabled: true,
      accountName: 'ร้านนกกะทา',
      accountNumber: null, // unconfigured → auto-verify must refuse
      accountType: 'bank',
      bankName: null,
      qrImageUrl: null,
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await callVerify();
      // 503, not 422: the shop's configuration is broken, the slip is fine.
      expect(res.status).toBe(503);
      const body = (await res.json()) as {
        error?: string;
        message?: string;
        slipStored?: boolean;
      };
      expect(body.error).toBe('RECEIVER_UNCONFIGURED');
      // Honest: the admin has the slip, the customer is not told their slip failed.
      expect(body.message).toContain('ยังไม่ได้ตั้งบัญชีรับเงิน');
      expect(body.slipStored).toBe(true);
      expect(h.slipStore.writeSlip).toHaveBeenCalledTimes(1);
      // Never auto-confirmed, and no credit spent on a verdict we must not act on.
      expect(h.fulfil.fulfilOrder).not.toHaveBeenCalled();
      // Neither provider: Slip2Go is the primary, SlipOK the fallback. A credit
      // must not be spent on a verdict we cannot act on.
      expect(h.slip2go.verifySlip2Go).not.toHaveBeenCalled();
      expect(h.slipok.verifySlip).not.toHaveBeenCalled();
      // Parked: the reason is stamped for จัดการคำสั่งซื้อ and the admin is pinged.
      expect(h.prisma.paymentAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failureReason: 'RECEIVER_UNCONFIGURED',
            // No provider ran, so the admin tooltip must not name one.
            gatewayStatusCode: null,
            gatewayResponse: expect.objectContaining({ provider: null }),
          }),
        }),
      );
      expect(h.notify.notifyPaymentPending).toHaveBeenCalledWith(
        expect.objectContaining({ orderNumber: ORDER.orderNumber }),
      );
      // And it is never silent — the misconfiguration is loud in the logs.
      expect(err).toHaveBeenCalledWith(expect.stringContaining('auto-verify refused'));
    } finally {
      err.mockRestore();
    }
  });

  it('treats a symbol-only store account as unconfigured (same fail-closed path)', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    h.manualTransfer.getManualTransferInfo.mockResolvedValueOnce({
      enabled: true,
      accountName: 'ร้านนกกะทา',
      accountNumber: '--- --- ----',
      accountType: 'bank',
      bankName: null,
      qrImageUrl: null,
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await callVerify();
      // 503, not 422: the shop is misconfigured, the slip is not.
      expect(res.status).toBe(503);
      expect(((await res.json()) as { error?: string }).error).toBe('RECEIVER_UNCONFIGURED');
      expect(h.slip2go.verifySlip2Go).not.toHaveBeenCalled();
      expect(h.slipok.verifySlip).not.toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });

  it('never claims the slip reached the admin when the evidence write failed', async () => {
    // The sentence used to say "ส่งสลิปให้แอดมินตรวจสอบให้แล้ว" unconditionally,
    // but a failed writeSlip leaves the client responsible for uploading it via
    // /slip-upload. The message must describe the shop, not a storage claim.
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slipStore.writeSlip.mockRejectedValueOnce(new Error('disk full'));
    h.manualTransfer.getManualTransferInfo.mockResolvedValueOnce({
      enabled: true,
      accountName: 'ร้านนกกะทา',
      accountNumber: null,
      accountType: 'bank',
      bankName: null,
      qrImageUrl: null,
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await callVerify();
      expect(res.status).toBe(503);
      const body = (await res.json()) as {
        error?: string;
        message?: string;
        slipStored?: boolean;
      };
      expect(body.error).toBe('RECEIVER_UNCONFIGURED');
      expect(body.slipStored).toBe(false);
      expect(body.message).toContain('ยังไม่ได้ตั้งบัญชีรับเงิน');
      expect(body.message).not.toContain('ส่งสลิปให้แอดมิน');
      expect(h.slip2go.verifySlip2Go).not.toHaveBeenCalled();
      expect(h.slipok.verifySlip).not.toHaveBeenCalled();
    } finally {
      err.mockRestore();
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

  /**
   * The CONFIRMATION / PARKING transactions — the ones the route sizes with a
   * `timeout`. Since the find-or-create claim (2026-11-24) is a `$transaction`
   * too, but carries only an isolation level, counting raw calls would point
   * this suite at the wrong transaction.
   */
  const confirmCalls = (): unknown[][] =>
    (txSpy().mock.calls as unknown[][]).filter(
      (call) => (call[1] as { timeout?: number } | undefined)?.timeout !== undefined,
    );

  /** Failures to inject into the next confirmations, oldest first. */
  let txFailures: Error[] = [];

  beforeEach(() => {
    // Restore the pass-through implementation a previous case may have spent.
    // A failure is only thrown for a timed (confirm/park) transaction, so the
    // claim still creates the attempt those transactions need.
    txFailures = [];
    txSpy().mockImplementation(async (fn: unknown, opts?: { timeout?: number }) => {
      if (opts?.timeout !== undefined && txFailures.length > 0) throw txFailures.shift()!;
      return (fn as (tx: unknown) => Promise<unknown>)(h.prisma);
    });
  });

  it('sizes the transaction above the 5s default and retries once when it expires', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    txFailures = [p2028()];

    const res = await callVerify();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('confirmed');

    // One automatic retry, with a budget this path can actually fit in.
    expect(confirmCalls()).toHaveLength(2);
    expect(confirmCalls()[0]![1]).toMatchObject({ timeout: CONFIRM_TX_TIMEOUT_MS });
    // A retry after a rollback re-runs the guarded claim — never a second
    // provider call and never a second delivery.
    expect(h.slip2go.verifySlip2Go).toHaveBeenCalledTimes(1);
    expect(h.fulfil.fulfilOrder).toHaveBeenCalledTimes(1);
  });

  it('stops after one retry and parks the order instead of 5xx-ing the customer', async () => {
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    txFailures = [p2028(), p2028()];

    const res = await callVerify();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; paymentVerified: boolean };
    expect(body.status).toBe('pending_manual_fulfilment');
    expect(body.paymentVerified).toBe(true);
    // Two confirmation attempts + the parking transaction. A third
    // confirmation would have hit the restored default and answered
    // 'confirmed' — the retry is bounded.
    expect(confirmCalls()).toHaveLength(3);
    expect(h.prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending_manual_fulfilment' }),
      }),
    );
  });

  it('tells the SAME story when the database rejects the slip as already used (422 SLIP_ALREADY_USED)', async () => {
    // The provider duplicate (SLIP_DUPLICATE) and the unique `slipVerifiedRef`
    // (SLIP_ALREADY_USED) are one customer situation, so they answer with one
    // sentence — the codes differ only for logs and support.
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    h.slip2go.verifySlip2Go.mockResolvedValueOnce(slipOkSuccess);
    txFailures = [new Error('Unique constraint failed on the fields: (`slipVerifiedRef`)')];

    const res = await callVerify();
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error).toBe('SLIP_ALREADY_USED');
    expect(body.message).toContain('ถูกใช้ยืนยันคำสั่งซื้อไปแล้ว');
    expect(body.message).toContain('เปิดหน้าคำสั่งซื้อ');
    expect(body.message).not.toContain('ไม่ถูกต้อง');
    expect(h.fulfil.fulfilOrder).not.toHaveBeenCalled();
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
describe('paid-retry budget across a customer retry (2026-11-23)', () => {
  it('carries gatewayResponse.rechecks forward instead of resetting the budget', async () => {
    // Each background re-check is a paid provider call, capped at 3 per slip.
    // The route stamped a brand-new gatewayResponse on every retry, dropping
    // rechecks, so a resubmit handed the sweep a fresh budget every time.
    h.slip2go.isSlip2GoEnabled.mockReturnValue(true);
    // Persistent, not a single-use value: earlier cases leave queued ones behind
    // (clearAllMocks resets calls, not implementations), and this case must
    // see its own delayed verdict.
    h.slip2go.verifySlip2Go.mockReset();
    h.slip2go.verifySlip2Go.mockResolvedValue({
      ok: false,
      code: 'SLIP_DELAYED',
      detail: '200404: ไม่พบรายการ',
    });
    h.prisma.paymentAttempt.findFirst.mockResolvedValueOnce({
      id: 'att-flow',
      gatewayResponse: { error: 'SLIP_DELAYED', rechecks: 2 },
    });

    const res = await callVerify();
    expect(res.status).toBe(502);
    expect(h.prisma.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: 'SLIP_DELAYED',
          gatewayResponse: expect.objectContaining({ rechecks: 2 }),
        }),
      }),
    );
  });
});
