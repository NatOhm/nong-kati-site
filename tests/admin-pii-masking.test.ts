/**
 * PII masking assertions (permission-scoped response shaping).
 *
 * The authz matrix proves WHO may call WHAT (401/403/200-class). This file
 * proves WHAT LEAVES the API: for the same endpoint, a role without
 * `customers:read:full` / `orders:read:full` (support_agent) must receive
 * MASKED identity data, while a role holding the permission (order_manager,
 * super_admin) receives the raw values — covering the review finding on
 * customers/orders/topups PII.
 *
 * Handlers are called in-process with real signed JWTs; prisma is mocked to
 * return a known PII fixture so assertions are exact, not heuristic. The
 * masking is the production code path (maskEmail/maskPhone from lib/rbac +
 * the route-level permission branches) — this test cannot pass if a route
 * stops masking or masks the wrong role.
 *
 * Covered endpoints (GET paths that shape customer identity):
 *  - GET /api/v1/admin/customers            (list)      customers:read
 *  - GET /api/v1/admin/customers/[id]       (detail)    customers:read
 *  - GET /api/v1/admin/orders               (list)      orders:read
 *  - GET /api/v1/admin/orders/[id]          (detail)    orders:read
 *  - GET /api/v1/admin/topups               (queue)     topups:read
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'pii-test-secret-0123456789abcdef0123456789abcdef';

/**
 * The exact DB shape each mocked model must answer with (matching the
 * select/include in the real routes). prisma.adminUser.findUnique must
 * answer too — verifyAdminJwt checks live role/status on every call.
 */
const FIXTURE = {
  adminUser: { role: '', status: 'active', sessionsInvalidBefore: null, mustChangePassword: false },
  customer: {
    id: 'cust-1',
    email: 'somchai.prasert@gmail.com',
    fullName: 'สมชาย ประเสริฐ',
    phone: '0812345678',
    status: 'active',
    tier: 'retail',
    emailVerified: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    _count: { orders: 3 },
    orders: [
      {
        orderNumber: 'NK-2026-ABC123',
        status: 'completed',
        totalAmountThb: '26.75',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
    ],
  },
  order: {
    id: 'ord-1',
    orderNumber: 'NK-2026-ABC123',
    customerEmail: 'somchai.prasert@gmail.com',
    customerPhone: '0812345678',
    status: 'completed',
    paymentMethod: 'promptpay',
    subtotalThb: '25',
    vatAmountThb: '1.75',
    discountThb: '0',
    totalAmountThb: '26.75',
    manualFulfilmentReason: null,
    slipImageUrl: null,
    slipUploadedAt: null,
    items: [
      {
        id: 'it-1',
        productNameTh: 'บัตรทดสอบ',
        skuCode: 'SKU-1',
        quantity: 1,
        unitPriceThb: '25',
        lineTotalThb: '25',
        deliveryStatus: 'delivered',
        _count: { giftCodes: 1 },
      },
    ],
    paymentAttempts: [],
    _count: { items: 1 },
    createdAt: new Date('2026-02-01T00:00:00Z'),
    completedAt: new Date('2026-02-01T01:00:00Z'),
  },
  topUp: {
    id: 'top-1',
    amountThb: '100',
    method: 'promptpay',
    reference: 'ref-1',
    status: 'completed',
    createdAt: new Date('2026-02-02T00:00:00Z'),
    customer: { email: 'somchai.prasert@gmail.com', fullName: 'สมชาย ประเสริฐ' },
  },
};

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: { findUnique: vi.fn() },
    customer: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    order: { findMany: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
    topUpLog: { findMany: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return { prismaMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

vi.mock('@/lib/auditLog', () => ({
  writeAuditLog: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.adminUser.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      const m = /^admin-(.+)$/.exec(where.id);
      if (!m) return null;
      return { ...FIXTURE.adminUser, role: m[1] };
    },
  );
  prismaMock.customer.findMany.mockResolvedValue([FIXTURE.customer]);
  prismaMock.customer.findUnique.mockResolvedValue(FIXTURE.customer);
  prismaMock.customer.count.mockResolvedValue(1);
  prismaMock.order.findMany.mockResolvedValue([FIXTURE.order]);
  prismaMock.order.findUnique.mockResolvedValue(FIXTURE.order);
  prismaMock.order.groupBy.mockResolvedValue([]);
  prismaMock.order.aggregate.mockResolvedValue({ _sum: { totalAmountThb: '80.25' } });
  prismaMock.topUpLog.findMany.mockResolvedValue([FIXTURE.topUp]);
  prismaMock.topUpLog.aggregate.mockResolvedValue({ _sum: { amountThb: null }, _count: 0 });
  prismaMock.topUpLog.count.mockResolvedValue(0);
});

import { issueAdminJwt } from '@/lib/jwt';
import { ROLE_PERMISSIONS, type AdminRole } from '@/types/auth';

const tokenFor = (role: AdminRole): Promise<string> =>
  issueAdminJwt(`admin-${role}`, `${role}@test.local`, role, [...ROLE_PERMISSIONS[role]]);

const FULL_ROLES: AdminRole[] = ['super_admin', 'order_manager'];
const MASKED_ROLE: AdminRole = 'support_agent';

const FULL_EMAIL = 'somchai.prasert@gmail.com';
const MASKED_EMAIL = 's***@gmail.com';
const FULL_PHONE = '0812345678';
const MASKED_PHONE = '08****78';

function get(path: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/admin${path}`, {
    headers: { authorization: 'Bearer x' }, // replaced per-call below
  });
}

/** Calls a route GET with a fresh request carrying the role's token. */
async function callGet(
  mod: Record<string, unknown>,
  path: string,
  token: string,
  ctx?: { params: Promise<{ id: string }> },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = new NextRequest(`http://localhost/api/v1/admin${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const res = (await (mod['GET'] as (r: NextRequest, c?: typeof ctx) => Promise<Response>)(
    req,
    ctx,
  )) as Response & { json: () => Promise<unknown> };
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

async function importRoute(path: string): Promise<Record<string, unknown>> {
  return import(`../src/app/api/v1/admin${path}`) as Promise<Record<string, unknown>>;
}

describe('PII masking — customers list', () => {
  it.each(FULL_ROLES)('%s sees the raw customer email', async (role) => {
    const mod = await importRoute('/customers/route.ts');
    const { status, body } = await callGet(mod, '/customers', await tokenFor(role));
    expect(status).toBe(200);
    const rows = body['data'] as Array<{ email: string; fullName: string }>;
    expect(rows[0]?.email).toBe(FULL_EMAIL);
    expect(rows[0]?.fullName).toBe(FIXTURE.customer.fullName);
  });

  it('support_agent sees only the masked email', async () => {
    const mod = await importRoute('/customers/route.ts');
    const { status, body } = await callGet(mod, '/customers', await tokenFor(MASKED_ROLE));
    expect(status).toBe(200);
    const rows = body['data'] as Array<{ email: string }>;
    expect(rows[0]?.email).toBe(MASKED_EMAIL);
    expect(rows[0]?.email).not.toBe(FULL_EMAIL);
  });
});

describe('PII masking — customer detail', () => {
  it('support_agent gets a masked email, full roles get raw', async () => {
    const mod = await importRoute('/customers/[id]/route.ts');
    const ctx = { params: Promise.resolve({ id: 'cust-1' }) };

    const masked = await callGet(mod, '/customers/cust-1', await tokenFor(MASKED_ROLE), ctx);
    expect(masked.status).toBe(200);
    expect(masked.body['email']).toBe(MASKED_EMAIL);

    const full = await callGet(mod, '/customers/cust-1', await tokenFor('order_manager'), ctx);
    expect(full.body['email']).toBe(FULL_EMAIL);
    expect(full.body['email']).not.toBe(MASKED_EMAIL);
  });
});

describe('PII masking — orders list', () => {
  it('support_agent gets masked customerEmail; order_manager (orders:read:full) gets raw', async () => {
    const mod = await importRoute('/orders/route.ts');

    const masked = await callGet(mod, '/orders', await tokenFor(MASKED_ROLE));
    expect(masked.status).toBe(200);
    const rows = masked.body['orders'] as Array<{ customerEmail: string }>;
    expect(rows[0]?.customerEmail).toBe(MASKED_EMAIL);

    const full = await callGet(mod, '/orders', await tokenFor('order_manager'));
    const fullRows = full.body['orders'] as Array<{ customerEmail: string }>;
    expect(fullRows[0]?.customerEmail).toBe(FULL_EMAIL);
  });
});

describe('PII masking — order detail (email + phone)', () => {
  it('support_agent gets masked email AND phone; order_manager gets raw', async () => {
    const mod = await importRoute('/orders/[id]/route.ts');
    const ctx = { params: Promise.resolve({ id: 'ord-1' }) };

    const masked = await callGet(mod, '/orders/ord-1', await tokenFor(MASKED_ROLE), ctx);
    expect(masked.status).toBe(200);
    expect(masked.body['customerEmail']).toBe(MASKED_EMAIL);
    expect(masked.body['customerPhone']).toBe(MASKED_PHONE);

    const full = await callGet(mod, '/orders/ord-1', await tokenFor('order_manager'), ctx);
    expect(full.body['customerEmail']).toBe(FULL_EMAIL);
    expect(full.body['customerPhone']).toBe(FULL_PHONE);
  });
});

describe('PII masking — topups queue', () => {
  it('support_agent gets masked email and NO customerName; super_admin gets raw + name', async () => {
    const mod = await importRoute('/topups/route.ts');

    const masked = await callGet(mod, '/topups', await tokenFor(MASKED_ROLE));
    expect(masked.status).toBe(200);
    const logs = masked.body['logs'] as Array<Record<string, unknown>>;
    expect(logs[0]?.['customerEmail']).toBe(MASKED_EMAIL);
    expect(logs[0]).not.toHaveProperty('customerName');

    const full = await callGet(mod, '/topups', await tokenFor('super_admin'));
    const fullLogs = full.body['logs'] as Array<Record<string, unknown>>;
    expect(fullLogs[0]?.['customerEmail']).toBe(FULL_EMAIL);
    expect(fullLogs[0]?.['customerName']).toBe(FIXTURE.customer.fullName);
  });
});

describe('masking sanity (shared fixture)', () => {
  it('masked forms never contain the raw values', () => {
    expect(MASKED_EMAIL).not.toBe(FULL_EMAIL);
    expect(MASKED_EMAIL).not.toContain('prasert');
    expect(MASKED_PHONE).not.toBe(FULL_PHONE);
    expect(MASKED_PHONE).not.toContain('345678');
    void get;
  });
});
