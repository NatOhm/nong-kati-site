import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['GIFT_CODE_KEY'] ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const { prismaMock, auditMock, state } = vi.hoisted(() => {
  // Interactive-tx shape: the mock passes ITSELF as the tx client, so calls
  // like tx.giftCode.updateMany hit the same top-level mock. This mirrors the
  // pattern already proven in tests/admin-refund.test.ts.
  //
  // `state.deleted` models committed rows so $transaction can implement the
  // ONE semantic that matters here: a callback that RETURNS commits, a
  // callback that THROWS rolls back (snapshot/restore below). Without it a
  // partial-cascade bug would pass this suite silently.
  const state = { deleted: [] as string[] };
  const prismaMock = {
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        state.deleted.push(where.id);
        return { id: where.id, slug: 'deleted' };
      }),
    },
    category: {
      findUnique: vi.fn(),
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
    },
    orderItem: {
      findMany: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    giftCode: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
      deleteMany: vi.fn(async () => ({ count: 3 })),
    },
    codeUploadBatch: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    inventorySnapshot: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    stockMove: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    cartItem: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    productAlias: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    productTag: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    wishlistItem: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(),
  };
  const auditMock = { writeAuditLog: vi.fn(async () => ({ id: 'audit_1' })) };
  return { prismaMock, auditMock, state };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auditLog', () => auditMock);
// The cascade route tests call the real handler; only its auth gates are
// stubbed (permission + bearer), everything else runs for real.
vi.mock('@/lib/rbac', () => ({
  checkPermission: vi.fn(async () => ({ allowed: true, payload: { sub: 'admin_1', email: 'a@b.co' } })),
}));
vi.mock('@/lib/adminRequest', () => ({ getAdminToken: vi.fn(() => 'mock-token') }));

const VARIANT_IDS = ['var_1', 'var_2'];

function seedProduct() {
  prismaMock.product.findUnique.mockResolvedValue({
    id: 'prod_1',
    name: 'น้ำมันทดสอบ',
    slug: 'test-oil',
    variants: VARIANT_IDS.map((id) => ({ id })),
  });
}

// File-level: every describe gets the rollback-aware tx (commit on return,
// snapshot/restore on throw — exactly Prisma's interactive-tx semantics).
beforeEach(() => {
  vi.clearAllMocks();
  state.deleted.length = 0;
  // Defaults for the untyped stubs; tests override per scenario.
  prismaMock.product.findMany.mockResolvedValue([]);
  prismaMock.orderItem.findMany.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const snapshot = [...state.deleted];
    try {
      return await fn(prismaMock);
    } catch (err) {
      state.deleted.length = 0;
      state.deleted.push(...snapshot);
      throw err;
    }
  });
});

describe('purgeProductInTx — hard delete of a catalog product', () => {

  it('refuses with IN_FLIGHT_ORDER when a variant is on a pending/paid order', async () => {
    const { purgeProductInTx, emptyPurgeCounts } = await import('@/lib/catalogPurge');
    seedProduct();
    prismaMock.orderItem.findMany.mockResolvedValue([
      { order: { orderNumber: 'NK-2026-000071' } },
    ] as never);

    const result = await purgeProductInTx(
      prismaMock as never,
      'prod_1',
      { sub: 'admin_1', email: 'a@b.co' },
      null,
      emptyPurgeCounts(),
    );

    expect(result).toEqual({
      ok: false,
      error: 'IN_FLIGHT_ORDER',
      orderNumbers: ['NK-2026-000071'],
    });
    // Must not have touched any catalog rows.
    expect(prismaMock.product.delete).not.toHaveBeenCalled();
    expect(prismaMock.giftCode.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses with ORPHANED_RESERVED_CODE when a delivered code has no order', async () => {
    const { purgeProductInTx, emptyPurgeCounts } = await import('@/lib/catalogPurge');
    seedProduct();
    prismaMock.orderItem.findMany.mockResolvedValue([]);
    prismaMock.giftCode.count.mockResolvedValue(2);

    const result = await purgeProductInTx(
      prismaMock as never,
      'prod_1',
      { sub: 'admin_1', email: 'a@b.co' },
      null,
      emptyPurgeCounts(),
    );

    expect(result).toEqual({ ok: false, error: 'ORPHANED_RESERVED_CODE', count: 2 });
    expect(prismaMock.product.delete).not.toHaveBeenCalled();
  });

  it('deletes catalog rows, writes an audit row, and leaves the parent Order untouched', async () => {
    const { purgeProductInTx, emptyPurgeCounts } = await import('@/lib/catalogPurge');
    seedProduct();
    // No in-flight order, no orphaned code: the purge proceeds.
    prismaMock.orderItem.findMany.mockResolvedValue([]);
    prismaMock.giftCode.count.mockResolvedValue(0);
    const counts = emptyPurgeCounts();

    const result = await purgeProductInTx(
      prismaMock as never,
      'prod_1',
      { sub: 'admin_1', email: 'a@b.co' },
      null,
      counts,
    );

    expect(result).toEqual({ ok: true, name: 'น้ำมันทดสอบ' });

    // Every Restrict child of the variant is cleared BEFORE the product goes,
    // so product.delete does not hit a foreign-key error. Unsold codes are
    // deleted; sold codes and order lines are DETACHED (nullable variantId),
    // never destroyed — history must survive a purge.
    expect(prismaMock.giftCode.deleteMany).toHaveBeenCalledWith({
      where: { variantId: { in: VARIANT_IDS } },
    });
    expect(prismaMock.giftCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ variantId: { in: VARIANT_IDS } }),
        data: expect.objectContaining({ variantId: null }),
      }),
    );
    expect(prismaMock.codeUploadBatch.deleteMany).toHaveBeenCalledWith({
      where: { variantId: { in: VARIANT_IDS } },
    });
    expect(prismaMock.orderItem.updateMany).toHaveBeenCalledWith({
      where: { variantId: { in: VARIANT_IDS } },
      data: { variantId: null },
    });
    // Order lines are detached, never deleted — this is the defect a
    // 2026-10-25 playtest caught when the old code deleted them instead.
    expect(prismaMock.orderItem.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.product.delete).toHaveBeenCalledWith({ where: { id: 'prod_1' } });

    // The parent Order is never deleted — history survives. The mock has no
    // `order` model at all, so any attempt to touch Order would have thrown;
    // we only ever touch OrderItem (the snapshot row) and the catalog.

    // Audit row rides the same tx and names the purge.
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'catalog.product_purge',
        tableName: 'Product',
        recordId: 'prod_1',
        tx: prismaMock,
      }),
    );

    // Counts aggregate the touched rows for the response/audit.
    expect(counts.products).toBe(1);
    expect(counts.variants).toBe(2);
    expect(counts.giftCodesDeleted).toBe(3);
    expect(counts.orderItemsDetached).toBe(1);
  });
});

// ── Category cascade: the atomicity contract ───────────────────────────
// Regression for a real defect (review 2026-10-25): the cascade loop used to
// `return` the refusal from inside the tx callback — Prisma COMMITS a
// normally-returning callback, so products purged before the refusal were
// kept while the client was told "refused". Silent, un-undoable partial
// delete. The refusal must be THROWN so the whole cascade rolls back.
describe('DELETE /api/v1/admin/categories/[id]?cascade=true — refusal rolls back', () => {
  function seedCascade(products: { id: string; name: string }[]) {
    prismaMock.category.findUnique.mockResolvedValue({
      id: 'cat_1',
      name: 'น้ำมันทดสอบ',
      slug: 'test-oil-cat',
      _count: { products: products.length },
    });
    prismaMock.category.count.mockResolvedValue(0); // no child categories
    prismaMock.category.findMany.mockResolvedValue([]); // subtree = self
    prismaMock.product.findMany.mockResolvedValue(products);
    prismaMock.product.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        if (where.id === 'prod_missing') return null;
        if (where.id === 'prod_blocked') {
          return {
            id: 'prod_blocked',
            name: 'บล็อก',
            slug: 'blocked',
            variants: [{ id: 'var_blocked' }],
          };
        }
        return {
          id: where.id,
          name: 'น้ำมันทดสอบ',
          slug: 'test-oil',
          variants: VARIANT_IDS.map((id) => ({ id })),
        };
      },
    );
    // Guard 1: only prod_blocked's variant sits on an in-flight order.
    prismaMock.orderItem.findMany.mockImplementation(
      async ({ where }: { where?: { variantId?: { in?: string[] } } }) =>
        where?.variantId?.in?.includes('var_blocked')
          ? [{ order: { orderNumber: 'NK-2026-000072' } }]
          : [],
    );
    prismaMock.giftCode.count.mockResolvedValue(0);
  }

  async function deleteCascade() {
    const { DELETE } = await import('@/app/api/v1/admin/categories/[id]/route');
    const req = new NextRequest('http://localhost/api/v1/admin/categories/cat_1?cascade=true', {
      method: 'DELETE',
    });
    return DELETE(req, { params: Promise.resolve({ id: 'cat_1' }) });
  }

  it('in-flight refusal on the SECOND product commits nothing — no silent partial delete', async () => {
    seedCascade([
      { id: 'prod_clean', name: 'A' },
      { id: 'prod_blocked', name: 'B' },
    ]);

    const res = await deleteCascade();

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: 'IN_FLIGHT_ORDER',
      orderNumbers: ['NK-2026-000072'],
    });
    // prod_clean WAS purged inside the tx — only a throw-rollback leaves this
    // empty. The old `return`-based code fails exactly here.
    expect(state.deleted).toEqual([]);
    expect(prismaMock.category.deleteMany).not.toHaveBeenCalled();
  });

  it('a product vanishing mid-cascade (NOT_FOUND) also rolls back everything', async () => {
    seedCascade([
      { id: 'prod_clean', name: 'A' },
      { id: 'prod_missing', name: 'B' },
    ]);

    const res = await deleteCascade();

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'NOT_FOUND' });
    expect(state.deleted).toEqual([]);
    expect(prismaMock.category.deleteMany).not.toHaveBeenCalled();
  });

  it('all-clear cascade commits: products and categories go together', async () => {
    seedCascade([{ id: 'prod_clean', name: 'A' }]);

    const res = await deleteCascade();

    expect(res.status).toBe(200);
    expect(state.deleted).toEqual(['prod_clean']);
    expect(prismaMock.category.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['cat_1'] } },
    });
    expect(await res.json()).toMatchObject({ deleted: true, products: 1, categories: 1 });
  });
});

// ── Fulfilment: a purged catalog line must never masquerade as a stock hole
// (review 2026-10-25 finding 3). Before the fix this threw INSUFFICIENT_STOCK,
// which recovery would park as a manual restock — the wrong diagnosis.
describe('fulfilOrder — detached (purged) order line', () => {
  it('fails with CATALOG_LINE_DETACHED, not a fake INSUFFICIENT_STOCK', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'ord_1',
      orderNumber: 'NK-2026-000071',
      status: 'paid',
      items: [
        {
          id: 'oi_1',
          variantId: null, // detached by the catalog purge
          quantity: 1,
          productNameTh: 'น้ำมันทดสอบ',
          denominationThb: 100,
        },
      ],
    });

    const { fulfilOrder } = await import('@/lib/fulfilment');
    await expect(fulfilOrder('ord_1')).rejects.toThrow('CATALOG_LINE_DETACHED');
  });
});
