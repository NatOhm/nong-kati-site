/**
 * Inventory shelf panel — Phase 1 server contracts (2026-10-21).
 *
 * Two additive changes back the unified codes panel:
 *  1. POST /admin/stock/bulk accepts an optional `variantId` that pins EVERY
 *     pasted record to one variant. The inventory dialog's เติมบัญชี button
 *     needs it: a paste opened from a specific variant must land in THAT
 *     variant, not spread by round-robin across all of them. An unknown /
 *     inactive variant is an honest 400 — never a silent fallback, which
 *     would put accounts on the wrong shelf.
 *  2. GET /admin/inventory now returns the FULL variants[] array per product
 *     (additive — every previous field is unchanged). The codes dialog needs
 *     real tabs for multi-variant products; previously only variants[0] was
 *     reachable from this page at all.
 *
 * Harness mirrors tests/admin-stored-accounts.test.ts: real JWTs, real
 * crypto, prisma replaced by a mock that passes itself as the tx client.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'variants-shelf-test-secret-0123456789abcdef0123456789';
process.env['NK_GIFT_CODE_ENCRYPTION_KEY'] = 'a'.repeat(64);
process.env['NK_GIFT_CODE_ENCRYPTION_KEY_V2'] = 'b'.repeat(64);

const { prismaMock, auditMock } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: {
      findUnique: vi.fn(async () => ({
        role: 'super_admin',
        status: 'active',
        sessionsInvalidBefore: null,
        mustChangePassword: false,
      })),
    },
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(async () => [] as Record<string, unknown>[]),
    },
    giftCode: {
      findMany: vi.fn(async () => [] as Record<string, unknown>[]),
      createMany: vi.fn(async (_d: Record<string, unknown>) => ({ count: 0 })),
    },
    // Phase 2: every applied paste plan records a batch row for correlation.
    codeUploadBatch: {
      create: vi.fn(async () => ({ id: 'batch_test_1' })),
    },
    productVariant: {
      findUnique: vi.fn(async (_w?: unknown) => ({ stock: 5 })),
      update: vi.fn(async (_d: Record<string, unknown>) => ({})),
    },
    stockMove: {
      create: vi.fn(async (_d: Record<string, unknown>) => ({})),
      findMany: vi.fn(async () => [] as Record<string, unknown>[]),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };
  const auditMock = {
    writeAuditLog: vi.fn(async (_entry: Record<string, unknown>) => ({})),
  };
  return { prismaMock, auditMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => auditMock);

const BULK = '../src/app/api/v1/admin/stock/bulk/route';
const INVENTORY = '../src/app/api/v1/admin/inventory/route';

let token = '';

beforeEach(async () => {
  vi.clearAllMocks();
  if (!token) {
    const { issueAdminJwt } = await import('@/lib/jwt');
    token = await issueAdminJwt('adm_root', 'oil@test.local', 'super_admin', [
      'products:write',
      'inventory:read',
    ]);
  }
});

/** Two active variants — the multi-variant shape the tabs exist for. */
function productRow(): Record<string, unknown> {
  return {
    id: 'prod_1',
    name: 'Netflix',
    variants: [
      { id: 'var_30', label: '30 วัน', stock: 5 },
      { id: 'var_60', label: '60 วัน', stock: 2 },
    ],
  };
}

const post = async (body: Record<string, unknown>): Promise<Response> => {
  const mod = (await import(/* @vite-ignore */ BULK)) as Record<string, unknown>;
  const fn = mod['POST'] as (r: NextRequest) => Promise<Response>;
  return fn(
    new NextRequest('http://localhost/x', {
      method: 'POST',
      headers: { cookie: `nk_admin_at=${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
};

describe('POST /stock/bulk — variantId pins the whole paste', () => {
  beforeEach(() => {
    prismaMock.product.findUnique.mockResolvedValue(productRow());
  });

  it('routes EVERY record to the pinned variant, ignoring round-robin', async () => {
    const res = await post({
      productId: 'prod_1',
      format: 'short',
      raw: 'user1:pass1\nuser2:pass2\nuser3:pass3',
      variantId: 'var_60',
      apply: true,
    });
    expect(res.status).toBe(200);

    // All three accounts landed on the pinned variant — not spread.
    const created = prismaMock.giftCode.createMany.mock.calls[0]![0] as {
      data: { variantId: string }[];
    };
    expect(created.data).toHaveLength(3);
    expect(created.data.map((r) => r.variantId)).toEqual(['var_60', 'var_60', 'var_60']);

    // One plan out, and the audit names the pinned variant.
    const body = (await res.json()) as { results: { variantId: string }[] };
    expect(body.results).toEqual([expect.objectContaining({ variantId: 'var_60' })]);
    const audit = auditMock.writeAuditLog.mock.calls[0]![0] as {
      metadata: Record<string, unknown>;
    };
    expect(audit.metadata['variantId']).toBe('var_60');
  });

  it('preview (apply=false) pins the plans the same way', async () => {
    const res = await post({
      productId: 'prod_1',
      format: 'short',
      raw: 'a:b\nc:d',
      variantId: 'var_30',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: { variantId: string; count: number }[] };
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0]!).toMatchObject({ variantId: 'var_30', count: 2 });
    // Preview never writes.
    expect(prismaMock.giftCode.createMany).not.toHaveBeenCalled();
  });

  it('400 UNKNOWN_VARIANT for a variant that is not on this product', async () => {
    const res = await post({
      productId: 'prod_1',
      format: 'short',
      raw: 'a:b',
      variantId: 'var_GHOST',
      apply: true,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('UNKNOWN_VARIANT');
    // A silent fallback here would shelve accounts on the wrong product row.
    expect(prismaMock.giftCode.createMany).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
  });

  it('without variantId the round-robin behaviour is unchanged', async () => {
    const res = await post({
      productId: 'prod_1',
      format: 'short',
      raw: 'a:b\nc:d',
      apply: true,
    });
    expect(res.status).toBe(200);
    // Round-robin = one transaction per variant, one account each.
    const created = prismaMock.giftCode.createMany.mock.calls.flatMap(
      (c) => (c[0] as { data: { variantId: string }[] }).data,
    );
    expect(created.map((r) => r.variantId)).toEqual(['var_30', 'var_60']);
    expect(prismaMock.giftCode.createMany).toHaveBeenCalledTimes(2);
  });
});

describe('GET /admin/inventory — full variants[] per product', () => {
  it('exposes every variant with id/label/stock/codesAvailable (additive)', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      {
        id: 'prod_1',
        sku: 'NETFLIX',
        name: 'Netflix',
        description: null,
        imageUrl: null,
        price: 107,
        costThb: 90,
        isActive: true,
        isFeatured: false,
        category: { name: 'Streaming' },
        variants: [
          { id: 'var_30', label: '30 วัน', stock: 5, price: 107, costThb: 90, _count: { giftCodes: 3 } },
          { id: 'var_60', label: '60 วัน', stock: 2, price: 199, costThb: 170, _count: { giftCodes: 1 } },
        ],
      },
    ]);
    const mod = (await import(/* @vite-ignore */ INVENTORY)) as Record<string, unknown>;
    const fn = mod['GET'] as (r: NextRequest) => Promise<Response>;
    const res = await fn(
      new NextRequest('http://localhost/x', { headers: { cookie: `nk_admin_at=${token}` } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: {
        variantId: string | null;
        variants: { id: string; label: string; stock: number; codesAvailable: number }[];
      }[];
    };
    const item = body.items[0]!;
    // Old fields intact (Hyrum: existing screens depend on them)…
    expect(item.variantId).toBe('var_30');
    // …and the panel gets the full list, not just the first variant.
    expect(item.variants).toEqual([
      { id: 'var_30', label: '30 วัน', stock: 5, codesAvailable: 3 },
      { id: 'var_60', label: '60 วัน', stock: 2, codesAvailable: 1 },
    ]);
  });
});
