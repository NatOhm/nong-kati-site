/**
 * Admin orders contract — `slipCheck.detail`.
 *
 * The receiver diagnostic (`receiver …1786 vs store …5786`) is the only thing
 * that tells an admin WHICH account a rejected slip was paid into. It is
 * produced by checkReceiverMatch, stored in `PaymentAttempt.gatewayResponse`,
 * and read by FOUR endpoints — so it can disappear in two silent ways: a
 * select stops asking for `gatewayResponse`, or one mapper stops copying the
 * field. Neither breaks a build, a type, or any other test: the tooltip just
 * stops naming the account.
 *
 * This file calls each producer in-process (prisma mocked to a known attempt)
 * and fails on either mistake. `/admin/orders/[id]` is included because it was
 * exactly that bug — the detail modal, the screen where the money is approved,
 * never selected `gatewayResponse` at all.
 *
 * Authz/masking are covered by admin-authz-matrix and admin-pii-masking; here
 * checkPermission is stubbed so the assertion is about the payload shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'orders-contract-secret-0123456789abcdef0123456789ab';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    order: { findMany: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn() },
    customer: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/adminRequest', () => ({ getAdminToken: () => 'admin-token' }));
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: vi.fn() }));
vi.mock('@/lib/crypto/giftCode', () => ({ decryptCode: vi.fn() }));
vi.mock('@/lib/rbac', () => ({
  maskEmail: (email: string | null) => email,
  maskPhone: (phone: string | null) => phone,
  checkPermission: vi.fn(async () => ({
    allowed: true,
    payload: {
      sub: 'admin-1',
      email: 'admin@test.local',
      perms: ['orders:read', 'orders:read:full', 'customers:read', 'customers:read:full'],
    },
  })),
}));

/** The exact string the receiver rule stored for a 735 THB Bangkok Bank slip. */
const DETAIL = 'receiver …1786 vs store …5786';
const CHECKED_AT = new Date('2026-11-22T05:00:00Z');

function attempt(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slipVerifiedRef: null,
    amountThb: '735',
    slipVerifiedAt: null,
    slipReceiverAccount: '199-1-xxx786',
    slipVerifiedBy: null,
    failureReason: 'RECEIVER_MISMATCH',
    gatewayStatusCode: '200401',
    gatewayResponse: { detail: DETAIL },
    updatedAt: CHECKED_AT,
    ...over,
  };
}

function orderRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ord-1',
    orderNumber: 'NK-2026-000735',
    customerEmail: 'buyer@example.com',
    customerPhone: '0812345678',
    status: 'pending_payment',
    paymentMethod: 'promptpay',
    subtotalThb: '735',
    vatAmountThb: '0',
    discountThb: '0',
    totalAmountThb: '735',
    manualFulfilmentReason: null,
    requiresTaxInvoice: false,
    confirmationUuid: 'cu-1',
    slipImageUrl: '/slips/735.jpg',
    slipUploadedAt: new Date('2026-11-22T04:59:00Z'),
    createdAt: new Date('2026-11-22T04:58:00Z'),
    completedAt: null,
    _count: { items: 1 },
    paymentAttempts: [attempt()],
    items: [],
    ...over,
  };
}

/** The `paymentAttempts` select a route asked prisma for. */
function attemptFields(arg: unknown): Record<string, unknown> {
  const q = arg as {
    select?: { paymentAttempts?: { select?: Record<string, unknown> } };
    include?: { paymentAttempts?: { select?: Record<string, unknown> } };
  };
  return q.select?.paymentAttempts?.select ?? q.include?.paymentAttempts?.select ?? {};
}

type Row = { slipCheck: Record<string, unknown> | null; slipReceiver?: unknown };

async function call(
  path: string,
  handler: 'GET' | 'GET_search' | 'GET_customerHistory',
  ctx?: { params: Promise<{ id: string }> },
): Promise<Record<string, unknown>> {
  const mod = (await import(`../src/app/api/v1/admin/orders/${path}`)) as Record<string, unknown>;
  const req = new NextRequest(`http://localhost/api/v1/admin/orders/contract`, {
    method: 'GET',
    headers: { authorization: 'Bearer admin-token' },
  });
  const res = (await (mod[handler] as (r: NextRequest, c?: unknown) => Promise<Response>)(
    req,
    ctx,
  )) as Response;
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.order.findMany.mockResolvedValue([orderRow()]);
  prismaMock.order.findUnique.mockResolvedValue(orderRow());
  prismaMock.order.groupBy.mockResolvedValue([]);
  prismaMock.customer.findUnique.mockResolvedValue({
    id: 'cust-1',
    email: 'buyer@example.com',
    phoneNumber: '0812345678',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    _count: { orders: 1 },
  });
});

describe('admin orders → slipCheck.detail', () => {
  it('GET /admin/orders — selects gatewayResponse and returns the stored detail', async () => {
    const body = await call('route.ts', 'GET');
    const rows = body['orders'] as Row[];
    expect(rows[0]?.slipCheck).toEqual({
      provider: '200401',
      error: 'RECEIVER_MISMATCH',
      detail: DETAIL,
      checkedAt: '2026-11-22T05:00:00.000Z',
    });
    expect(attemptFields(prismaMock.order.findMany.mock.calls[0]![0])).toMatchObject({
      gatewayResponse: true,
    });
  });

  it('GET /admin/orders/search — the endpoint the orders page loads carries it too', async () => {
    const body = await call('search.ts', 'GET_search');
    const rows = body['orders'] as Row[];
    expect(rows[0]?.slipCheck?.['detail']).toBe(DETAIL);
    expect(attemptFields(prismaMock.order.findMany.mock.calls[0]![0])).toMatchObject({
      gatewayResponse: true,
    });
  });

  it('GET /admin/orders/:id — the detail modal names the account before confirming', async () => {
    const body = await call('[id]/route.ts', 'GET', { params: Promise.resolve({ id: 'ord-1' }) });
    expect((body['slipCheck'] as Record<string, unknown>)?.['detail']).toBe(DETAIL);
    expect(attemptFields(prismaMock.order.findUnique.mock.calls[0]![0])).toMatchObject({
      gatewayResponse: true,
    });
  });

  it('GET /admin/customers/:id/history — customer history carries it', async () => {
    const body = await call('search.ts', 'GET_customerHistory', {
      params: Promise.resolve({ id: 'cust-1' }),
    });
    const rows = body['orders'] as Row[];
    expect(rows[0]?.slipCheck?.['detail']).toBe(DETAIL);
    expect(attemptFields(prismaMock.order.findMany.mock.calls[0]![0])).toMatchObject({
      gatewayResponse: true,
    });
  });
});

describe('admin orders → slipReceiver (which account the bank reported)', () => {
  /** The masked account `slipReceiverView()` exposes; never the full number. */
  const RECEIVER = { masked: '199-1-xxx786', last4: '1786' };

  it('all four producers carry it and ask prisma for the column', async () => {
    const list = (await call('route.ts', 'GET'))['orders'] as Row[];
    const search = (await call('search.ts', 'GET_search'))['orders'] as Row[];
    const detail = await call('[id]/route.ts', 'GET', {
      params: Promise.resolve({ id: 'ord-1' }),
    });
    const history = (await call('search.ts', 'GET_customerHistory', {
      params: Promise.resolve({ id: 'cust-1' }),
    }))['orders'] as Row[];

    expect(list[0]?.['slipReceiver']).toEqual(RECEIVER);
    expect(search[0]?.['slipReceiver']).toEqual(RECEIVER);
    expect(detail['slipReceiver']).toEqual(RECEIVER);
    expect(history[0]?.['slipReceiver']).toEqual(RECEIVER);
    expect(attemptFields(prismaMock.order.findMany.mock.calls[0]![0])).toMatchObject({
      slipReceiverAccount: true,
    });
    expect(attemptFields(prismaMock.order.findUnique.mock.calls[0]![0])).toMatchObject({
      slipReceiverAccount: true,
    });
  });

  it('a manual slip nobody read yet stays null — the UI then demands a read', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      orderRow({
        paymentAttempts: [attempt({ failureReason: null, gatewayResponse: null, slipReceiverAccount: null })],
      }),
    ]);
    const rows = (await call('route.ts', 'GET'))['orders'] as Row[];
    expect(rows[0]?.['slipReceiver']).toBeNull();
  });
});

describe('admin orders → slipCheck.detail never invents a diagnostic', () => {
  it('a passed check carries no detail; a legacy row and a malformed value degrade to null', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      // Rejected once, then passed on retry: a stale detail must not survive.
      orderRow({
        paymentAttempts: [
          attempt({
            slipVerifiedRef: 'ref-735',
            slipVerifiedAt: CHECKED_AT,
            slipVerifiedBy: 'slip2go',
            failureReason: null,
            gatewayResponse: { detail: 'stale detail from the failed attempt' },
          }),
        ],
      }),
      // Rows written before the diagnostic existed (column null).
      orderRow({ id: 'ord-2', paymentAttempts: [attempt({ gatewayResponse: null })] }),
      // A JSON column can hold anything.
      orderRow({ id: 'ord-3', paymentAttempts: [attempt({ gatewayResponse: { detail: 42 } })] }),
    ]);

    const body = await call('route.ts', 'GET');
    const [passed, legacy, malformed] = body['orders'] as Row[];

    expect(passed?.slipCheck).toEqual({
      provider: 'slip2go',
      error: null,
      detail: null,
      checkedAt: '2026-11-22T05:00:00.000Z',
    });
    // The verdict still reaches the admin — only the extra line is absent.
    expect(legacy?.slipCheck).toMatchObject({ error: 'RECEIVER_MISMATCH', detail: null });
    expect(malformed?.slipCheck).toMatchObject({ error: 'RECEIVER_MISMATCH', detail: null });
  });
});
