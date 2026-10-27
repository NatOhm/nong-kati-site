/**
 * Wallet-payment Discord visibility (critical review fix 2026-10-27).
 *
 * The pay-wallet checkout path commits a full purchase — debit, ledger row,
 * claim, fulfilment (codes + stock), completed — yet was the ONE confirmation
 * path with zero ops-channel visibility: no payment ping, and a variant
 * drained to 0 by wallet spend never raised the sold-out card. This file
 * pins both halves of the fix:
 *
 *  A. WIRING — the real route, in-process (production code path, prisma and
 *     collaborators mocked): a successful payment fires notifyPaymentConfirmed
 *     with the committed order values and hands the order's variant ids to
 *     notifyStockAlertsForVariants (null detached lines filtered out). Every
 *     failure path — no session, insufficient balance, stock hole — stays
 *     silent: notifications fire only after the unit commits.
 *
 *  B. TITLE ALIGNMENT — the real notifiers (notify.ts is mocked for part A,
 *     so these use importActual + a stubbed fetch): the two embed titles now
 *     carry the old Torishop bot's status wording the client asked for —
 *     "พบการซื้อสินค้า" and "สินค้าหมดแล้ว".
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMock, notifyMock, fulfilMock, authMock, ordersMock } = vi.hoisted(() => {
  const prismaMock = {
    $transaction: vi.fn(),
    order: { findUnique: vi.fn(), update: vi.fn() },
    customer: { updateMany: vi.fn() },
    topUpLog: { create: vi.fn() },
    orderItem: { findMany: vi.fn() },
    // Real-notify path (part B) reads settings through this.
    siteSetting: { findUnique: vi.fn() },
  };
  const notifyMock = {
    notifyPaymentConfirmed: vi.fn(async () => undefined),
    notifyStockAlertsForVariants: vi.fn(async () => undefined),
  };
  const fulfilMock = {
    fulfilOrder: vi.fn(),
    scheduleOutboxDrain: vi.fn(async () => undefined),
  };
  const authMock = { getCustomerFromToken: vi.fn() };
  const ordersMock = { claimOrderForConfirmation: vi.fn() };
  return { prismaMock, notifyMock, fulfilMock, authMock, ordersMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/notify', () => notifyMock);
vi.mock('@/lib/fulfilment', () => fulfilMock);
vi.mock('@/api/customerAuth', () => authMock);
vi.mock('@/api/orders', () => ordersMock);

const ORDER = {
  id: 'ord-w1',
  customerId: 'cust-1',
  status: 'pending_payment',
  totalAmountThb: '250',
  orderNumber: 'NK-2026-WAL1',
};

let route: Record<string, unknown>;

beforeAll(async () => {
  // Variable specifier — a literal '.ts' path in an import() trips TS5097
  // under this tsconfig (same pattern as admin-resend-email.test.ts).
  const routePath = '../src/app/api/v1/orders/[id]/pay-wallet/route.ts';
  route = (await import(routePath)) as Record<string, unknown>;
});

function post(cookie?: string): NextRequest {
  return new NextRequest('http://localhost/api/v1/orders/ord-w1/pay-wallet', {
    method: 'POST',
    ...(cookie ? { headers: { cookie } } : {}),
  });
}

async function call(req: NextRequest): Promise<Response> {
  const POST = route['POST'] as (
    r: NextRequest,
    c: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
  return POST(req, { params: Promise.resolve({ id: 'ord-w1' }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getCustomerFromToken.mockResolvedValue({ id: 'cust-1', email: 'somchai@example.test' });
  // tx === prisma surface (topup-notify.test.ts pattern).
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) =>
    fn(prismaMock),
  );
  prismaMock.order.findUnique.mockResolvedValue({ ...ORDER });
  prismaMock.customer.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.topUpLog.create.mockResolvedValue({});
  prismaMock.order.update.mockResolvedValue({});
  ordersMock.claimOrderForConfirmation.mockResolvedValue({ id: ORDER.id });
  fulfilMock.fulfilOrder.mockResolvedValue({ success: true, codes: [] });
  fulfilMock.scheduleOutboxDrain.mockResolvedValue(undefined);
  prismaMock.orderItem.findMany.mockResolvedValue([{ variantId: 'var-1' }, { variantId: null }]);
  prismaMock.siteSetting.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env['NK_DISCORD_WEBHOOK_URL'];
  vi.unstubAllGlobals();
});

describe('A. pay-wallet notification wiring', () => {
  it('a successful wallet payment pings payment-confirmed + stock alerts once', async () => {
    const res = await call(post('nk_session=tok'));

    expect(res.status).toBe(200);
    expect(((await res.json()) as { success?: boolean }).success).toBe(true);
    expect(notifyMock.notifyPaymentConfirmed).toHaveBeenCalledTimes(1);
    expect(notifyMock.notifyPaymentConfirmed).toHaveBeenCalledWith({
      orderNumber: ORDER.orderNumber,
      totalThb: 250,
    });
    expect(notifyMock.notifyStockAlertsForVariants).toHaveBeenCalledTimes(1);
    // Detached line (null variantId) filtered — the helper takes real ids only.
    expect(notifyMock.notifyStockAlertsForVariants).toHaveBeenCalledWith(['var-1']);
  });

  it('no session → 401, nothing claimed, nothing notified', async () => {
    const res = await call(post());

    expect(res.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(notifyMock.notifyPaymentConfirmed).not.toHaveBeenCalled();
    expect(notifyMock.notifyStockAlertsForVariants).not.toHaveBeenCalled();
  });

  it('insufficient balance → 409, silent', async () => {
    prismaMock.customer.updateMany.mockResolvedValue({ count: 0 });

    const res = await call(post('nk_session=tok'));

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe(
      'INSUFFICIENT_BALANCE',
    );
    expect(notifyMock.notifyPaymentConfirmed).not.toHaveBeenCalled();
    expect(notifyMock.notifyStockAlertsForVariants).not.toHaveBeenCalled();
  });

  it('post-commit stock lookup blowing up still answers 200 (payment is committed)', async () => {
    // The variant query runs AFTER the transaction commits but used to sit
    // inside the route's try — one transient DB error returned 500
    // WALLET_PAY_FAILED for a payment that DID succeed, and the checkout UI
    // reacts to that by offering PromptPay again (customer pays twice).
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMock.orderItem.findMany.mockRejectedValue(new Error('Connection terminated unexpectedly'));

    const res = await call(post('nk_session=tok'));

    expect(res.status).toBe(200);
    expect(((await res.json()) as { success?: boolean }).success).toBe(true);
    expect(notifyMock.notifyPaymentConfirmed).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(
      '[pay-wallet] post-commit notification failed:',
      'Connection terminated unexpectedly',
    );
    errSpy.mockRestore();
  });

  it('a rejecting stock-alert helper still answers 200', async () => {
    notifyMock.notifyStockAlertsForVariants.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await call(post('nk_session=tok'));

    expect(res.status).toBe(200);
    expect(((await res.json()) as { success?: boolean }).success).toBe(true);
    errSpy.mockRestore();
  });

  it('stock hole (strict rollback) → 409, silent', async () => {
    fulfilMock.fulfilOrder.mockRejectedValue(new Error('INSUFFICIENT_STOCK'));

    const res = await call(post('nk_session=tok'));

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe(
      'INSUFFICIENT_STOCK',
    );
    expect(notifyMock.notifyPaymentConfirmed).not.toHaveBeenCalled();
    expect(notifyMock.notifyStockAlertsForVariants).not.toHaveBeenCalled();
  });
});

describe('B. embed titles — old Torishop wording (real notify, stubbed fetch)', () => {
  async function realNotify(): Promise<typeof import('@/lib/notify')> {
    return vi.importActual<typeof import('@/lib/notify')>('@/lib/notify');
  }

  function stubFetch(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function titleOf(call: () => Promise<void>): Promise<string> {
    process.env['NK_DISCORD_WEBHOOK_URL'] = 'https://discord.com/api/webhooks/123/tok';
    const fetchMock = stubFetch();
    await call();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { embeds: Array<{ title?: string }> };
    return body.embeds[0]?.title ?? '';
  }

  it('notifyNewOrder carries “พบการซื้อสินค้า”', async () => {
    const { notifyNewOrder } = await realNotify();
    const title = await titleOf(() =>
      notifyNewOrder({
        orderNumber: 'NK-2026-T1',
        email: 'buyer@example.test',
        totalThb: 250,
        itemCount: 1,
        paymentMethod: 'promptpay',
      }),
    );
    expect(title).toBe('🛒 พบการซื้อสินค้า: NK-2026-T1');
  });

  it('notifyStockOutOf carries “สินค้าหมดแล้ว”', async () => {
    const { notifyStockOutOf } = await realNotify();
    const title = await titleOf(() =>
      notifyStockOutOf({ productName: 'Netflix Premium', variantLabel: '4K แชร์' }),
    );
    expect(title).toBe('🚫 สินค้าหมดแล้ว');
  });

  it('notifyStockLow keeps its own wording (ไม่ได้ขอให้เปลี่ยน)', async () => {
    const { notifyStockLow } = await realNotify();
    const title = await titleOf(() =>
      notifyStockLow({ productName: 'Netflix Premium', variantLabel: '4K แชร์', stock: 3 }),
    );
    expect(title).toBe('⚠️ สต๊อกใกล้หมด');
  });
});
