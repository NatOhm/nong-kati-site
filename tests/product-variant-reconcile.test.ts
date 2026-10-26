/**
 * Variant reconcile in PUT /api/v1/admin/products/[id] — client feedback 19 Oct.
 *
 * Two production bugs pinned here:
 *  1. The old replace-all ran `deleteMany(variants)` for products without
 *     order history, which violated onDelete: Restrict FKs from GiftCode /
 *     CodeUploadBatch / InventorySnapshot → HTTP 500. Every stocked product
 *     in this store became uneditable (and un-movable between categories,
 *     because the editor always sends variants with every save).
 *  2. For products WITH order history it deactivated + re-created every
 *     variant on each save — the "อยู่ ๆ ตัวเลือกก็เพิ่มขึ้น" duplication
 *     (live HBO Max product had 6 variants, 5 labeled "default").
 *
 * Contract: reconcile BY ID — update rows in place, create rows without an
 * id, and for rows the payload dropped delete only when nothing references
 * them, otherwise deactivate. StockMove deltas keyed by variant id.
 *
 * Also covers the /search category fixes from the same feedback round:
 * listing includes the whole subtree (chip counts aggregate children) and
 * chip counts only count active products.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env['NK_JWT_SECRET'] = 'variant-reconcile-test-secret-0123456789abcdef01234567';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    adminUser: { findUnique: vi.fn() },
    product: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    productVariant: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    orderItem: { count: vi.fn() },
    giftCode: { count: vi.fn() },
    codeUploadBatch: { count: vi.fn() },
    inventorySnapshot: { count: vi.fn() },
    stockMove: { createMany: vi.fn() },
    tag: { findMany: vi.fn() },
    category: { findUnique: vi.fn(), findMany: vi.fn() },
    siteSetting: { findUnique: vi.fn() },
    promotion: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)),
  };
  return { prismaMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
// resolveTier() reads the nk_session cookie through next/headers; guests
// resolve to 'retail' and that is all these tests need.
vi.mock('next/headers', () => ({ cookies: async () => new Map() }));
// React 18 (the test runtime) has no `cache`; data.ts imports it from
// 'react' for the per-request tier memo. Identity is the correct stand-in.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T): T => fn,
}));

import { issueAdminJwt } from '@/lib/jwt';
import { ROLE_PERMISSIONS } from '@/types/auth';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  // The reconcile failure path logs server-side; keep test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {});

  prismaMock.adminUser.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      const role = where.id.replace('admin-', '');
      return {
        role,
        status: 'active',
        sessionsInvalidBefore: null,
        mustChangePassword: false,
      };
    },
  );
  prismaMock.product.findUnique.mockImplementation(async ({ include }: { include?: unknown }) =>
    include
      ? {
          id: 'p1',
          name: 'HBO Max 7 4K',
          slug: 'hbo-max-7-4k',
          description: null,
          imageUrl: null,
          isActive: true,
          isFeatured: false,
          tags: [],
          variants: [
            {
              id: 'v1',
              label: '7 วัน',
              price: 100,
              memberPrice: null,
              dealerPrice: null,
              stock: 12,
              costThb: null,
              isActive: true,
              sortOrder: 0,
            },
          ],
        }
      : { id: 'p1', name: 'HBO Max 7 4K', slug: 'hbo-max-7-4k' },
  );
  prismaMock.product.update.mockResolvedValue({});
  prismaMock.product.findMany.mockResolvedValue([]);
  prismaMock.productVariant.findMany.mockResolvedValue([]);
  prismaMock.productVariant.update.mockResolvedValue({});
  prismaMock.productVariant.create.mockResolvedValue({ id: 'vnew' });
  prismaMock.productVariant.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.productVariant.deleteMany.mockResolvedValue({ count: 1 });
  prismaMock.orderItem.count.mockResolvedValue(0);
  prismaMock.giftCode.count.mockResolvedValue(0);
  prismaMock.codeUploadBatch.count.mockResolvedValue(0);
  prismaMock.inventorySnapshot.count.mockResolvedValue(0);
  prismaMock.stockMove.createMany.mockResolvedValue({ count: 0 });
  prismaMock.tag.findMany.mockResolvedValue([]);
  prismaMock.category.findUnique.mockResolvedValue(null);
  prismaMock.category.findMany.mockResolvedValue([]);
  prismaMock.siteSetting.findUnique.mockResolvedValue(null);
  prismaMock.promotion.findMany.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation(
    async (fn: (t: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function putVariants(body: unknown): Promise<Response> {
  const { PUT } = await import('@/app/api/v1/admin/products/[id]/route');
  const token = await issueAdminJwt('admin-super_admin', 'admin@test.local', 'super_admin', [
    ...ROLE_PERMISSIONS.super_admin,
  ]);
  const req = new NextRequest('http://localhost/api/v1/admin/products/p1', {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PUT(req, { params: Promise.resolve({ id: 'p1' }) });
}

describe('PUT admin/products/[id] — variant reconcile', () => {
  it('updates rows in place by id, creates new rows, never deletes (gift-coded save)', async () => {
    prismaMock.productVariant.findMany
      .mockResolvedValueOnce([
        { id: 'v1', stock: 10 },
        { id: 'v2', stock: 3 },
      ])
      .mockResolvedValueOnce([
        { id: 'v1', stock: 12 },
        { id: 'v2', stock: 3 },
        { id: 'vnew', stock: 5 },
      ]);

    const res = await putVariants({
      name: 'HBO Max 7 4K',
      variants: [
        { id: 'v1', label: '7 วัน', price: 100, stock: 12, isActive: true },
        { id: 'v2', label: '30 วัน', price: 250, stock: 3, isActive: true },
        { label: '90 วัน', price: 600, stock: 5, isActive: true },
      ],
    });

    expect(res.status).toBe(200);
    // The old bug: deleteMany (FK 500 on stocked products) or
    // deactivate-all + createMany (variant multiplication). Neither may run.
    expect(prismaMock.productVariant.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.productVariant.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.giftCode.count).not.toHaveBeenCalled(); // nothing dropped

    expect(prismaMock.productVariant.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.productVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v1' },
        data: expect.objectContaining({ stock: 12, label: '7 วัน' }),
      }),
    );
    expect(prismaMock.productVariant.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: { name: 'HBO Max 7 4K' },
      }),
    );

    // StockMove keyed by variant id: changed rows move, untouched rows don't.
    const moves = (
      prismaMock.stockMove.createMany.mock.calls[0]?.[0] as {
        data: { variantId: string; delta: number; stockAfter: number }[];
      }
    ).data;
    expect(moves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variantId: 'v1', delta: 2, stockAfter: 12 }),
        expect.objectContaining({ variantId: 'vnew', delta: 5, stockAfter: 5 }),
      ]),
    );
    expect(moves.some((m) => m.variantId === 'v2')).toBe(false);
  });

  it('deactivates a dropped variant that owns gift codes instead of deleting it', async () => {
    prismaMock.productVariant.findMany
      .mockResolvedValueOnce([
        { id: 'v1', stock: 10 },
        { id: 'v2', stock: 3 },
      ])
      .mockResolvedValueOnce([{ id: 'v1', stock: 10 }]);
    prismaMock.giftCode.count.mockResolvedValue(4);

    const res = await putVariants({
      name: 'HBO Max 7 4K',
      variants: [{ id: 'v1', label: '7 วัน', price: 100, stock: 10, isActive: true }],
    });

    expect(res.status).toBe(200);
    expect(prismaMock.giftCode.count).toHaveBeenCalledWith({
      where: { variantId: { in: ['v2'] } },
    });
    expect(prismaMock.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['v2'] } },
      data: { isActive: false },
    });
    expect(prismaMock.productVariant.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes a dropped variant only when nothing references it', async () => {
    prismaMock.productVariant.findMany
      .mockResolvedValueOnce([
        { id: 'v1', stock: 10 },
        { id: 'v2', stock: 3 },
      ])
      .mockResolvedValueOnce([{ id: 'v1', stock: 10 }]);

    const res = await putVariants({
      name: 'HBO Max 7 4K',
      variants: [{ id: 'v1', label: '7 วัน', price: 100, stock: 10, isActive: true }],
    });

    expect(res.status).toBe(200);
    expect(prismaMock.productVariant.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['v2'] } },
    });
    expect(prismaMock.productVariant.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a stale variant id with 409 and writes nothing', async () => {
    prismaMock.productVariant.findMany.mockResolvedValueOnce([{ id: 'v1', stock: 10 }]);

    const res = await putVariants({
      name: 'HBO Max 7 4K',
      variants: [{ id: 'vX', label: '7 วัน', price: 100, stock: 10, isActive: true }],
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'VARIANT_NOT_FOUND' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.productVariant.update).not.toHaveBeenCalled();
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('maps reconcile failures to VARIANT_UPDATE_FAILED instead of a raw 500', async () => {
    prismaMock.productVariant.findMany.mockResolvedValueOnce([{ id: 'v1', stock: 10 }]);
    prismaMock.productVariant.update.mockRejectedValueOnce(new Error('FK violation'));

    const res = await putVariants({
      name: 'HBO Max 7 4K',
      variants: [{ id: 'v1', label: '7 วัน', price: 100, stock: 10, isActive: true }],
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'VARIANT_UPDATE_FAILED' });
    expect(console.error).toHaveBeenCalled();
  });
});

describe('category listing vs chip counts (screenshot: "work space (2)" แต่ผลลัพธ์ว่าง)', () => {
  it('getCatalogProducts filters a category slug across the whole subtree', async () => {
    prismaMock.category.findUnique.mockResolvedValue({
      id: 'cat-ws',
      slug: 'workspace',
      parentId: null,
    });
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat-ws', parentId: null },
      { id: 'child-1', parentId: 'cat-ws' },
    ]);
    const fullRow = {
      id: 'p-child',
      name: 'Canva 30 วัน',
      slug: 'canva-30',
      description: null,
      imageUrl: null,
      categoryId: 'child-1',
      isFeatured: false,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      category: { id: 'child-1', name: 'Netflix', slug: 'netflix' },
      variants: [
        {
          id: 'vx',
          label: '30 วัน',
          price: 30,
          costThb: null,
          memberPrice: null,
          dealerPrice: null,
          stock: 4,
          isActive: true,
          sortOrder: 0,
        },
      ],
      aliases: [],
      tags: [],
    };
    prismaMock.product.findMany
      .mockResolvedValueOnce([
        {
          id: 'p-child',
          name: 'Canva 30 วัน',
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
          isFeatured: false,
          variants: [{ price: 30, stock: 4, isActive: true }],
        },
      ])
      .mockResolvedValueOnce([fullRow]);

    const { getCatalogProducts } = await import('@/lib/data');
    const { products, total } = await getCatalogProducts('', 'workspace', 'featured');

    // The where-clause must cover the subtree, not just direct children —
    // the chip counted 2 child products while this listing returned none.
    const keysCall = prismaMock.product.findMany.mock.calls[0]?.[0] as {
      where: { categoryId: { in: string[] }; isActive: boolean };
    };
    expect(keysCall.where.categoryId).toEqual({ in: ['cat-ws', 'child-1'] });
    expect(keysCall.where.isActive).toBe(true);
    expect(total).toBe(1);
    expect(products.map((p) => p.slug)).toContain('canva-30');
  });

  it('category chip counts only active products', async () => {
    const { getCategoriesWithProductCounts } = await import('@/lib/data');
    await getCategoriesWithProductCounts();

    const chipCall = prismaMock.category.findMany.mock.calls
      .map((c: unknown[]) => c[0] as { include?: { _count?: unknown } } | undefined)
      .find((c) => c?.include?._count);
    expect(chipCall).toBeDefined();
    expect(
      (chipCall!.include! as { _count: { select: { products: unknown } } })._count.select.products,
    ).toEqual({ where: { isActive: true } });
  });
});
