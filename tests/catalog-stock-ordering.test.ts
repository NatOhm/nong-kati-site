/**
 * Stock-aware catalog ordering — storefront review finding #3 (2026-10-05).
 *
 * The claim under test: the category page rendered `createdAt desc` with no
 * sort control, no availability filter and NO pagination, and
 * `getCatalogProducts`' ordering key select never even fetched `stock`
 * (`variants: { select: { price: true } }`). So no sort in the app could
 * have been stock-aware, and a sold-out product could occupy the default
 * first page ahead of everything purchasable.
 *
 * Contracts pinned here:
 *  1. Availability LEADS every sort. Not as one more option — burying a
 *     purchasable product under sold-out ones should not be reachable by
 *     forgetting a sort.
 *  2. Ordering is computed over the whole matching set before slicing, so
 *     page 2 continues page 1 exactly and nothing repeats or vanishes.
 *  3. Determinism: equal-key products fall back to name then id, so two
 *     identical requests return the same page.
 *  4. `availableOnly` filters on ACTIVE variants only — the same set
 *     `createOrder` accepts, so the catalog can never advertise
 *     availability the order route then rejects with OUT_OF_STOCK.
 *  5. `available` sort puts the best-stocked purchasable product first.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    category: { findUnique: vi.fn(), findMany: vi.fn() },
    product: { findMany: vi.fn() },
    siteSetting: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
// resolveTier() reads the nk_session cookie through next/headers; guests
// resolve to 'retail' and that is all these ordering tests need.
vi.mock('next/headers', () => ({ cookies: async () => new Map() }));
// React 18 (the test runtime) has no `cache`; data.ts imports it from
// 'react' for the per-request tier memo. Identity is the correct stand-in.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T): T => fn,
}));

interface Key {
  id: string;
  name: string;
  createdAt: Date;
  isFeatured: boolean;
  variants: { price: number; stock: number; isActive: boolean }[];
}

const DAY = 86_400_000;
const T0 = new Date('2026-01-01T00:00:00.000Z');

/** key(id, {stock, price, featured, ageDays}) — one active variant. */
function key(
  id: string,
  opts: { stock: number; price?: number; featured?: boolean; ageDays?: number } = {
    stock: 0,
  },
): Key {
  return {
    id,
    name: id.toUpperCase(),
    createdAt: new Date(T0.getTime() - (opts.ageDays ?? 0) * DAY),
    isFeatured: opts.featured ?? false,
    variants: [{ price: opts.price ?? 100, stock: opts.stock, isActive: true }],
  };
}

/** Full row for the hydration pass. */
function row(k: Key): Record<string, unknown> {
  return {
    id: k.id,
    name: k.name,
    slug: k.id,
    description: null,
    shortDescription: null,
    imageUrl: null,
    categoryId: 'c1',
    isActive: true,
    isFeatured: k.isFeatured,
    createdAt: k.createdAt,
    aliases: [],
    tags: [],
    variants: k.variants.map((v, i) => ({
      id: `${k.id}-v${i}`,
      label: 'std',
      price: v.price,
      memberPrice: null,
      dealerPrice: null,
      stock: v.stock,
      isActive: v.isActive,
      sortOrder: 1,
    })),
  };
}

/**
 * Route `product.findMany` by shape: the ordering pass carries `select`,
 * the hydration pass carries `include`.
 */
function serve(keys: Key[]): void {
  prismaMock.product.findMany.mockImplementation(
    async (args: Record<string, unknown>) =>
      args['select'] ? keys : keys.filter((k) => true).map(row),
  );
}

const ids = (products: { id: string }[]): string[] => products.map((p) => p.id);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.category.findUnique.mockResolvedValue({ id: 'c1', slug: 'steam' });
  prismaMock.category.findMany.mockResolvedValue([]);
  prismaMock.product.findMany.mockImplementation(async () => []);
});

describe('availability leads every sort', () => {
  const SORTS = ['featured', 'available', 'price-asc', 'price-desc', 'name-asc', 'newest'] as const;

  it.each(SORTS)('%s puts every purchasable product ahead of every sold-out one', async (sort) => {
    // Deliberately hostile: the sold-out products win EVERY other key.
    const keys: Key[] = [
      key('a-soldout-cheap-featured-newest', { stock: 0, price: 1, featured: true }),
      key('b-soldout-cheapest', { stock: 0, price: 2 }),
      key('c-instock-dear', { stock: 1, price: 9999 }),
      key('d-instock-cheaper', { stock: 3, price: 500 }),
    ];
    serve(keys);

    const { getCatalogProducts } = await import('@/lib/data');
    const { products } = await getCatalogProducts('', undefined, sort, 1, 24);
    const out = ids(products);

    // Membership, not order: within each availability band the requested
    // sort still rules (e.g. 'available' puts the 3-in-stock first,
    // 'price-asc' puts the cheaper one first). What must hold for EVERY
    // sort is that the band itself is correct.
    expect(new Set(out.slice(0, 2))).toEqual(new Set(['c-instock-dear', 'd-instock-cheaper']));
    expect(new Set(out.slice(2))).toEqual(
      new Set(['a-soldout-cheap-featured-newest', 'b-soldout-cheapest']),
    );
  });

  it('treats an inactive variant with stock as NOT purchasable', async () => {
    // A hidden variant with stock must not count — createOrder filters
    // `isActive: true`, so promoting on it would advertise an OUT_OF_STOCK
    // rejection at checkout.
    const keys: Key[] = [
      key('ghost', { stock: 0 }),
      {
        ...key('real', { stock: 0 }),
        variants: [{ price: 10, stock: 99, isActive: false }],
      },
    ];
    serve(keys);

    const { getCatalogProducts } = await import('@/lib/data');
    const { products } = await getCatalogProducts('', undefined, 'available', 1, 24);
    expect(ids(products)).toEqual(['ghost', 'real']);
  });
});

describe('the ordering select actually fetches stock', () => {
  // This is the line whose ABSENCE caused the original bug. A behavioural
  // test alone cannot catch its removal, because a prisma mock returns
  // whatever the test hands it regardless of `select` — so the shape of the
  // select has to be asserted directly.
  it.each([
    ['getCatalogProducts', (m: typeof import('@/lib/data')) => m.getCatalogProducts('', undefined, 'available', 1, 24)],
    [
      'getProductsByCategory',
      (m: typeof import('@/lib/data')) => m.getProductsByCategory('steam', 1, 24, 'available'),
    ],
  ])('%s selects stock and isActive on the ordering pass', async (_name, run) => {
    serve([key('a', { stock: 1 })]);
    const mod = await import('@/lib/data');
    await run(mod);

    const args = (
      prismaMock.product.findMany.mock.calls as unknown as [
        { select?: { variants?: { select: Record<string, boolean> } } },
      ][]
    )[0]![0];
    expect(args.select?.variants?.select).toMatchObject({
      price: true,
      stock: true,
      isActive: true,
    });
  });
});

describe("the 'available' sort", () => {
  it('orders purchasable products by descending stock', async () => {
    serve([
      key('one', { stock: 1 }),
      key('five', { stock: 5 }),
      key('three', { stock: 3 }),
      key('none', { stock: 0 }),
    ]);

    const { getCatalogProducts } = await import('@/lib/data');
    const { products } = await getCatalogProducts('', undefined, 'available', 1, 24);
    expect(ids(products)).toEqual(['five', 'three', 'one', 'none']);
  });
});

describe('availableOnly filter', () => {
  it('adds an active-variant stock>0 predicate to the query', async () => {
    serve([key('a', { stock: 2 })]);

    const { getCatalogProducts } = await import('@/lib/data');
    await getCatalogProducts('', undefined, 'featured', 1, 24, true);

    const args = (prismaMock.product.findMany.mock.calls as unknown as [
      { where: Record<string, unknown> },
    ][])[0]![0];
    expect(args.where['variants']).toEqual({ some: { stock: { gt: 0 }, isActive: true } });
  });

  it('omits the predicate when the filter is off', async () => {
    serve([key('a', { stock: 0 })]);

    const { getCatalogProducts } = await import('@/lib/data');
    await getCatalogProducts('', undefined, 'featured', 1, 24, false);

    const args = (prismaMock.product.findMany.mock.calls as unknown as [
      { where: Record<string, unknown> },
    ][])[0]![0];
    expect(args.where['variants']).toBeUndefined();
  });
});

describe('pagination is a slice of one global order', () => {
  it('page 2 continues page 1 — no repeats, no gaps', async () => {
    const keys: Key[] = [
      key('p1', { stock: 5 }),
      key('p2', { stock: 4 }),
      key('p3', { stock: 0 }),
      key('p4', { stock: 2 }),
      key('p5', { stock: 1 }),
    ];
    serve(keys);

    const { getCatalogProducts } = await import('@/lib/data');
    const first = await getCatalogProducts('', undefined, 'available', 1, 2);
    const second = await getCatalogProducts('', undefined, 'available', 2, 2);
    const third = await getCatalogProducts('', undefined, 'available', 3, 2);

    expect(first.total).toBe(5);
    // Availability leads, then descending stock: p1(5) p2(4) p4(2) p5(1)
    // then the sold-out p3. The slice must follow THAT order, not the
    // insertion order — which is exactly what a per-page DB sort got wrong.
    expect(ids(first.products)).toEqual(['p1', 'p2']);
    expect(ids(second.products)).toEqual(['p4', 'p5']);
    expect(ids(third.products)).toEqual(['p3']);

    const seen = [...ids(first.products), ...ids(second.products), ...ids(third.products)];
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('does not mutate the caller-visible key order (sort copies)', async () => {
    const keys = [key('b', { stock: 1 }), key('a', { stock: 1 })];
    serve(keys);

    const { getCatalogProducts } = await import('@/lib/data');
    await getCatalogProducts('', undefined, 'available', 1, 24);
    // The stub hands back the same array every call; if orderCatalogKeys
    // sorted in place, a second call would see a pre-sorted list and the
    // test below could not distinguish a correct re-sort from a stale one.
    expect(keys.map((k) => k.id)).toEqual(['b', 'a']);
  });

  it('returns an empty page past the end without breaking total', async () => {
    serve([key('a', { stock: 1 })]);
    const { getCatalogProducts } = await import('@/lib/data');
    const res = await getCatalogProducts('', undefined, 'available', 9, 24);
    expect(res.products).toEqual([]);
    expect(res.total).toBe(1);
  });
});

describe('determinism', () => {
  it('equal-key products fall back to name then id', async () => {
    const keys = [
      { ...key('zzz', { stock: 4 }), name: 'Zebra' },
      { ...key('aaa', { stock: 4 }), name: 'Alpha' },
    ];
    serve(keys);

    const { getCatalogProducts } = await import('@/lib/data');
    const a = ids((await getCatalogProducts('', undefined, 'available', 1, 24)).products);
    const b = ids((await getCatalogProducts('', undefined, 'available', 1, 24)).products);
    expect(a).toEqual(b);
    expect(a).toEqual(['aaa', 'zzz']);
  });
});

describe('getProductsByCategory — the category page path', () => {
  beforeEach(() => {
    prismaMock.category.findUnique.mockResolvedValue({ id: 'c1', slug: 'steam' });
    prismaMock.category.findMany.mockResolvedValue([{ id: 'c1', parentId: null }]);
  });

  it('is stock-aware too, and no longer hard-orders by createdAt', async () => {
    serve([key('soldout', { stock: 0, ageDays: 0 }), key('instock', { stock: 3, ageDays: 99 })]);

    const { getProductsByCategory } = await import('@/lib/data');
    const res = await getProductsByCategory('steam');

    // 'soldout' is the NEWEST product — the exact situation the review
    // reported, where a sold-out item owned the top of page 1.
    expect(ids(res.products)).toEqual(['instock', 'soldout']);
  });

  it('honours the sort and availability arguments from the URL', async () => {
    serve([
      key('a', { stock: 1 }),
      key('b', { stock: 9 }),
      key('c', { stock: 5 }),
    ]);

    const { getProductsByCategory } = await import('@/lib/data');
    const res = await getProductsByCategory('steam', 1, 24, 'available', false);
    expect(ids(res.products)).toEqual(['b', 'c', 'a']);

    const args = (prismaMock.product.findMany.mock.calls as unknown as [
      { where: Record<string, unknown> },
    ][])[0]![0];
    expect(args.where['variants']).toBeUndefined();
  });

  it('passes the availability predicate through when asked', async () => {
    serve([key('a', { stock: 1 })]);
    const { getProductsByCategory } = await import('@/lib/data');
    await getProductsByCategory('steam', 1, 24, 'featured', true);

    const args = (prismaMock.product.findMany.mock.calls as unknown as [
      { where: Record<string, unknown> },
    ][])[0]![0];
    expect(args.where['variants']).toEqual({ some: { stock: { gt: 0 }, isActive: true } });
  });

  it('no longer issues the old skip/take ordering query', async () => {
    serve([key('a', { stock: 1 })]);
    const { getProductsByCategory } = await import('@/lib/data');
    await getProductsByCategory('steam');

    const calls = (
      prismaMock.product.findMany.mock.calls as unknown as [
        Record<string, unknown>,
      ][]
    ).map(([a]) => a);
    // Ordering pass must never paginate in the DB — that is what made the
    // old page-1/page-2 sequences disagree.
    expect(calls[0]!['skip']).toBeUndefined();
    expect(calls[0]!['orderBy']).toBeUndefined();
  });
});