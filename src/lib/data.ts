/**
 * Data Provider — Prisma-backed queries for the catalog.
 * Replaces the M2 seed-data mock with real database queries.
 */

import { cache } from 'react';

import { prisma } from '@/lib/db';
import { normalizeTier, tierPrice, type PriceTier } from '@/lib/pricing';

// ─── Tier-aware price resolution ──────────────────────

/**
 * The requesting customer's price tier for this request.
 * Reads the nk_session cookie via React.cache — one DB hit per request no
 * matter how many product fetchers run (works in server components AND
 * route handlers). Falls back to retail (base prices) for guests.
 */
const getRequestTier = cache(async (): Promise<PriceTier> => {
  const { cookies } = await import('next/headers');
  const token = cookies().get('nk_session')?.value;
  if (!token) return 'retail';
  const { getCustomerFromToken } = await import('@/api/customerAuth');
  const customer = await getCustomerFromToken(token).catch(() => null);
  return customer ? normalizeTier(customer.tier) : 'retail';
});

export function resolveTier(): Promise<PriceTier> {
  return getRequestTier();
}

// ─── Types ────────────────────────────────────────────

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  children: CategoryItem[];
  /** Aggregate product count (set by getCategoriesWithProductCounts / getCategoryBySlug). */
  productCount?: number;
  /** Representative product image for app-tile grids (client mockup style). */
  imageUrl?: string | null;
  /** Slug of that representative product — enables direct package-page links. */
  productSlug?: string | null;
}

export interface ProductVariant {
  id: string;
  label: string;
  /** Retail price — the base that tier prices fall back to. */
  price: number;
  /** Price for this request's tier (== price for retail/guests). */
  effectivePrice: number;
  stock: number;
  isActive: boolean;
  sortOrder: number;
}

export interface ProductItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  categoryId: string;
  category: { id: string; name: string; slug: string };
  variants: ProductVariant[];
  aliases: string[];
  tags: { id: string; name: string; slug: string }[];
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
}

// ─── Category helpers ─────────────────────────────────

function buildCategoryTree(
  cats: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    parentId: string | null;
    sortOrder: number;
    isActive: boolean;
  }[],
): CategoryItem[] {
  const map = new Map<string, CategoryItem>();
  const roots: CategoryItem[] = [];

  for (const cat of cats) {
    map.set(cat.id, {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      parentId: cat.parentId,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      children: [],
    });
  }

  for (const cat of cats) {
    const node = map.get(cat.id)!;
    if (cat.parentId) {
      const parent = map.get(cat.parentId);
      if (parent) parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by sortOrder
  function sortTree(nodes: CategoryItem[]) {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of nodes) sortTree(node.children);
  }
  sortTree(roots);

  return roots;
}

// ─── Category Queries ─────────────────────────────────

export async function getTopLevelCategories(): Promise<CategoryItem[]> {
  const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  return buildCategoryTree(cats);
}

/**
 * Get categories with product counts (for homepage cards).
 * Parent categories show the SUBTREE total (own + all descendants), so a
 * type-level group like แอปดูหนัง/ซีรีส์ counts every app nested under it.
 */
/** Representative product image + slug per category id (app-tile grids). */
async function getCategoryImageMaps(): Promise<{
  firstImage: Map<string, string>;
  firstSlug: Map<string, string>;
}> {
  const imgProducts = await prisma.product.findMany({
    where: { isActive: true, imageUrl: { not: null } },
    select: { categoryId: true, imageUrl: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });
  const firstImage = new Map<string, string>();
  const firstSlug = new Map<string, string>();
  for (const p of imgProducts) {
    if (p.imageUrl && !firstImage.has(p.categoryId)) {
      firstImage.set(p.categoryId, p.imageUrl);
      firstSlug.set(p.categoryId, p.slug);
    }
  }
  return { firstImage, firstSlug };
}

export async function getCategoriesWithProductCounts(): Promise<
  (CategoryItem & { productCount: number })[]
> {
  const cats = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  const ownCount = new Map(cats.map((c) => [c.id, c._count.products]));
  const countMap = new Map(cats.map((c) => [c.id, c._count.products]));

  // Representative product image per category (client mockup: app tiles lead
  // with the artwork). First active product image in the subtree; parents
  // inherit their first child's image.
  const { firstImage, firstSlug } = await getCategoryImageMaps();
  const resolveImage = (id: string): { img: string; slug: string } | null => {
    const own = firstImage.get(id);
    if (own) return { img: own, slug: firstSlug.get(id) ?? '' };
    for (const c of cats) {
      if (c.parentId === id) {
        const inherited = resolveImage(c.id);
        if (inherited) {
          firstImage.set(id, inherited.img);
          firstSlug.set(id, inherited.slug);
          return inherited;
        }
      }
    }
    return null;
  };
  for (const c of cats) resolveImage(c.id);

  // Aggregate up the tree: children first (flat list is sorted, but do a
  // proper reverse pass so depth > 2 also lands correctly).
  const byId = new Map(cats.map((c) => [c.id, c]));
  for (const c of [...cats].reverse()) {
    if (c.parentId) {
      countMap.set(c.parentId, (countMap.get(c.parentId) ?? 0) + (countMap.get(c.id) ?? 0));
    }
  }
  void byId;
  const tree = buildCategoryTree(cats);
  function enrich(nodes: CategoryItem[]): (CategoryItem & { productCount: number })[] {
    return nodes.map((n) => ({
      ...n,
      productCount: countMap.get(n.id) ?? ownCount.get(n.id) ?? 0,
      imageUrl: firstImage.get(n.id) ?? null,
      productSlug: firstSlug.get(n.id) ?? null,
      children: enrich(n.children),
    }));
  }
  return enrich(tree);
}

/** All descendant category ids of a category (excluding itself). */
async function getDescendantIds(categoryId: string): Promise<string[]> {
  const cats = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const childrenOf = new Map<string, string[]>();
  for (const c of cats) {
    if (c.parentId) {
      const list = childrenOf.get(c.parentId) ?? [];
      list.push(c.id);
      childrenOf.set(c.parentId, list);
    }
  }
  const out: string[] = [];
  const walk = (id: string) => {
    for (const child of childrenOf.get(id) ?? []) {
      out.push(child);
      walk(child);
    }
  };
  walk(categoryId);
  return out;
}

export async function getCategoryTree(): Promise<CategoryItem[]> {
  const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  return buildCategoryTree(cats);
}

export async function getCategoryBySlug(slug: string): Promise<{
  category: CategoryItem;
  breadcrumb: { id: string; name: string; slug: string }[];
} | null> {
  const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  const tree = buildCategoryTree(cats);
  const { firstImage, firstSlug } = await getCategoryImageMaps();

  function findInTree(
    nodes: CategoryItem[],
    trail: { id: string; name: string; slug: string }[],
  ): { category: CategoryItem; breadcrumb: { id: string; name: string; slug: string }[] } | null {
    for (const node of nodes) {
      const newTrail = [...trail, { id: node.id, name: node.name, slug: node.slug }];
      if (node.slug === slug) return { category: node, breadcrumb: newTrail };
      if (node.children.length > 0) {
        const found = findInTree(node.children, newTrail);
        if (found) return found;
      }
    }
    return null;
  }

  const result = findInTree(tree, []);
  if (!result) return null;
  // Enrich the found node's children with tile artwork + product counts
  // (app-tile grid needs both for the pill and package-page deep link).
  const childCounts = await prisma.category.findMany({
    where: { parentId: result.category.id },
    select: { id: true, _count: { select: { products: { where: { isActive: true } } } } },
  });
  const countOf = new Map(childCounts.map((c) => [c.id, c._count.products]));
  result.category.children = result.category.children.map((c) => ({
    ...c,
    productCount: countOf.get(c.id) ?? 0,
    imageUrl: firstImage.get(c.id) ?? null,
    productSlug: firstSlug.get(c.id) ?? null,
  }));
  return result;
}

export async function getAllCategorySlugs(): Promise<string[]> {
  const cats = await prisma.category.findMany({ select: { slug: true } });
  return cats.map((c) => c.slug);
}

// ─── Product helpers ───────────────────────────────────

function mapProduct(
  p: any,
  cat: { id: string; name: string; slug: string } | null,
  tier: PriceTier = 'retail',
): ProductItem {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    shortDescription: p.description ? p.description.replace(/<[^>]+>/g, '').slice(0, 100) : null,
    imageUrl: p.imageUrl,
    categoryId: p.categoryId,
    category: cat ?? { id: '', name: '', slug: '' },
    variants: (p.variants ?? []).map((v: any) => ({
      id: v.id,
      label: v.label,
      price: Number(v.price),
      effectivePrice: tierPrice(Number(v.price), tier, {
        memberPrice: v.memberPrice != null ? Number(v.memberPrice) : null,
        dealerPrice: v.dealerPrice != null ? Number(v.dealerPrice) : null,
      }),
      stock: v.stock,
      isActive: v.isActive,
      sortOrder: v.sortOrder,
    })),
    aliases: (p.aliases ?? []).map((a: any) => a.alias),
    tags: (p.tags ?? []).map((pt: any) => ({
      id: pt.tag.id,
      name: pt.tag.name,
      slug: pt.tag.slug,
    })),
    isActive: p.isActive,
    isFeatured: p.isFeatured,
    createdAt: p.createdAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

// ─── Product Queries ───────────────────────────────────

export async function getFeaturedProducts(): Promise<ProductItem[]> {
  const products = await prisma.product.findMany({
    where: { isFeatured: true, isActive: true },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: { orderBy: { sortOrder: 'asc' } },
      aliases: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const tier = await resolveTier();
  return products.map((p) => mapProduct(p, p.category, tier));
}

export async function getProductsByCategory(
  slug: string,
  page: number = 1,
  limit: number = 24,
): Promise<{ products: ProductItem[]; total: number }> {
  const cat = await prisma.category.findUnique({ where: { slug } });
  if (!cat) return { products: [], total: 0 };

  // Type-level parent categories show every product in their subtree.
  const descendantIds = await getDescendantIds(cat.id);
  const categoryIds = [cat.id, ...descendantIds];
  const where = { categoryId: { in: categoryIds }, isActive: true };

  const tier = await resolveTier();
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: { orderBy: { sortOrder: 'asc' } },
        aliases: true,
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products: products.map((p) => mapProduct(p, p.category, tier)),
    total,
  };
}

export async function getProductBySlug(slug: string): Promise<ProductItem | null> {
  const p = await prisma.product.findUnique({
    where: { slug, isActive: true },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      aliases: true,
      tags: { include: { tag: true } },
    },
  });

  if (!p) return null;
  return mapProduct(p, p.category, await resolveTier());
}

export async function getAllProductSlugs(): Promise<string[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { slug: true },
  });
  return products.map((p) => p.slug);
}

export type CatalogSort = 'featured' | 'price-asc' | 'price-desc' | 'name-asc' | 'newest';

/**
 * Full catalog query with sorting — used by the "สินค้าทั้งหมด" page.
 * When query is empty, returns every active product.
 *
 * Ordering is computed over the ENTIRE matching set before pagination, so
 * page N+1 continues page N's sequence exactly. Sort keys are fetched with a
 * lightweight select, sorted with deterministic tiebreakers, then only the
 * requested page's ids are hydrated with full includes.
 */
export async function getCatalogProducts(
  query: string,
  categorySlug: string | undefined,
  sort: CatalogSort,
  page: number = 1,
  limit: number = 24,
): Promise<{ products: ProductItem[]; total: number }> {
  const trimmed = query.trim().toLowerCase();
  type CatalogWhere = {
    isActive: boolean;
    OR?: Array<
      | { name: { contains: string; mode: 'insensitive' } }
      | { description: { contains: string; mode: 'insensitive' } }
      | { aliases: { some: { alias: { contains: string; mode: 'insensitive' } } } }
    >;
    categoryId?: string;
  };
  const where: CatalogWhere = { isActive: true };

  if (trimmed) {
    where.OR = [
      { name: { contains: trimmed, mode: 'insensitive' as const } },
      { description: { contains: trimmed, mode: 'insensitive' as const } },
      { aliases: { some: { alias: { contains: trimmed, mode: 'insensitive' as const } } } },
    ];
  }
  if (categorySlug) {
    const cat = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (!cat) return { products: [], total: 0 };
    where.categoryId = cat.id;
  }

  // Lightweight pass: only the fields needed to order the full matching set.
  const keys = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      createdAt: true,
      isFeatured: true,
      variants: { select: { price: true } },
    },
  });

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'th');
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const minPriceOf = (p: (typeof keys)[number]) =>
    p.variants.length ? Math.min(...p.variants.map((v) => Number(v.price))) : null;

  const tier = await resolveTier();

  const cmp: (a: (typeof keys)[number], b: (typeof keys)[number]) => number =
    sort === 'price-asc' || sort === 'price-desc'
      ? (a, b) => {
          // Products without variants sink to the bottom in either direction.
          const pa = minPriceOf(a);
          const pb = minPriceOf(b);
          if (pa === null && pb === null) return byName(a, b) || byId(a, b);
          if (pa === null) return 1;
          if (pb === null) return -1;
          const d = sort === 'price-asc' ? pa - pb : pb - pa;
          return d !== 0 ? d : byName(a, b) || byId(a, b);
        }
      : sort === 'name-asc'
        ? (a, b) => byName(a, b) || byId(a, b)
        : sort === 'newest'
          ? (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || byId(a, b)
          : // featured: featured first, then name, then id — deterministic
            (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || byName(a, b) || byId(a, b);

  keys.sort(cmp);

  const total = keys.length;
  const pageIds = keys.slice((page - 1) * limit, page * limit).map((k) => k.id);
  if (pageIds.length === 0) return { products: [], total };

  const rows = await prisma.product.findMany({
    where: { id: { in: pageIds } },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: { orderBy: { sortOrder: 'asc' } },
      aliases: true,
    },
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));

  return {
    products: pageIds
      .map((id) => rowById.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((p) => mapProduct(p, p.category, tier)),
    total,
  };
}

export async function searchProducts(
  query: string,
  page: number = 1,
  limit: number = 24,
): Promise<{ products: ProductItem[]; total: number; query: string }> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return { products: [], total: 0, query: '' };

  const where = {
    isActive: true,
    OR: [
      { name: { contains: trimmed, mode: 'insensitive' as const } },
      { description: { contains: trimmed, mode: 'insensitive' as const } },
      { aliases: { some: { alias: { contains: trimmed, mode: 'insensitive' as const } } } },
    ],
  };

  const tier = await resolveTier();
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: { orderBy: { sortOrder: 'asc' } },
        aliases: true,
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products: products.map((p) => mapProduct(p, p.category, tier)),
    total,
    query: trimmed,
  };
}

export async function getSearchSuggestions(
  query: string,
  limit: number = 5,
): Promise<{ name: string; slug: string; categoryName: string }[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: trimmed, mode: 'insensitive' } },
        { aliases: { some: { alias: { contains: trimmed, mode: 'insensitive' } } } },
      ],
    },
    include: { category: { select: { name: true } } },
    take: limit,
  });

  return products.map((p) => ({
    name: p.name,
    slug: p.slug,
    categoryName: p.category.name,
  }));
}

/**
 * Wishlist products for the profile รายการโปรด tab — newest wish first.
 */
export async function getWishlistProducts(customerId: string): Promise<ProductItem[]> {
  const wishes = await prisma.wishlistItem.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    include: {
      product: {
        include: {
          category: { select: { id: true, name: true, slug: true } },
          variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          aliases: true,
        },
      },
    },
  });
  const tier = await resolveTier();
  return wishes
    .filter((w) => w.product.isActive)
    .map((w) => mapProduct(w.product, w.product.category, tier));
}

/** Ids the customer has wished — for heart states on cards. */
export async function getWishlistIds(customerId: string): Promise<string[]> {
  const rows = await prisma.wishlistItem.findMany({
    where: { customerId },
    select: { productId: true },
  });
  return rows.map((r) => r.productId);
}

/** How many customers have this product on their wishlist (social proof). */
export async function getProductWishCount(productId: string): Promise<number> {
  return prisma.wishlistItem.count({ where: { productId } });
}

export interface WishRankedProduct {
  product: ProductItem;
  wishCount: number;
}

/**
 * Most-wished active products — the "ลูกค้าคนอื่นก็ถูกใจ" social-proof row.
 * Wishlist ties are broken by newest wish so fresh interest bubbles up.
 */
export async function getMostWishedProducts(
  excludeProductId: string,
  limit = 6,
): Promise<WishRankedProduct[]> {
  const ranked = await prisma.wishlistItem.groupBy({
    by: ['productId'],
    where: { product: { isActive: true, id: { not: excludeProductId } } },
    _count: { productId: true },
    orderBy: [{ _count: { productId: 'desc' } }, { _max: { createdAt: 'desc' } }],
    take: limit,
  });
  if (ranked.length === 0) return [];
  const ids = ranked.map((r) => r.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      aliases: true,
    },
  });
  const tier = await resolveTier();
  const byId = new Map(products.map((p) => [p.id, mapProduct(p, p.category, tier)]));
  return ranked.flatMap((r) => {
    const product = byId.get(r.productId);
    return product ? [{ product, wishCount: r._count.productId }] : [];
  });
}

// ─── Site Settings (announcement bar etc.) ──────────────

export interface AnnouncementContent {
  message: string;
  href: string | null;
  enabled: boolean;
}

/**
 * Read the storefront announcement bar from the DB (SiteSetting key
 * 'announcement'). Falls back to the built-in default when unset or
 * malformed, so the bar never breaks the page render.
 */
export async function getAnnouncement(): Promise<AnnouncementContent> {
  const fallback: AnnouncementContent = {
    message: '🎉 โปรโมชั่นพิเศษ! HBO Max 7 วัน ลดเหลือ ฿25',
    href: '/product/hbo-max-7-4k-4',
    enabled: true,
  };
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: 'announcement' } });
    if (!row) return fallback;
    const parsed = JSON.parse(row.value) as Partial<AnnouncementContent>;
    return {
      message: typeof parsed.message === 'string' ? parsed.message : fallback.message,
      href: typeof parsed.href === 'string' ? parsed.href : null,
      enabled: parsed.enabled !== false,
    };
  } catch {
    return fallback;
  }
}

// ─── Storefront stats (homepage StatsCounter) ───────────

export interface StorefrontStats {
  customers: number;
  products: number;
  itemsSold: number;
  stock: number;
}

/** Real counts for the homepage stats band (client ask: plain numbers). */
export async function getStorefrontStats(): Promise<StorefrontStats> {
  const [customers, products, sold, stock] = await Promise.all([
    prisma.customer.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.orderItem.aggregate({
      where: { order: { status: 'completed' } },
      _sum: { quantity: true },
    }),
    prisma.productVariant.aggregate({
      where: { product: { isActive: true } },
      _sum: { stock: true },
    }),
  ]);
  return {
    customers,
    products,
    itemsSold: sold._sum.quantity ?? 0,
    stock: stock._sum.stock ?? 0,
  };
}

// ─── Hero carousel (admin-managed slides) ───────────────

export interface HeroSlideContent {
  id: string;
  /** Image banner; null = text deal card (label only). */
  imageUrl: string | null;
  /** Promo deal text — the old ticker's role, now admin-editable per slide. */
  label: string | null;
  href: string | null;
  alt: string;
}

/**
 * Active homepage carousel slides in display order. Empty list is normal
 * (carousel not configured yet) — callers hide the section.
 */
export async function getHeroSlides(): Promise<HeroSlideContent[]> {
  try {
    const rows = await prisma.heroSlide.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      imageUrl: r.imageUrl,
      label: r.label,
      href: r.href,
      alt: r.alt,
    }));
  } catch (e) {
    console.error('[data] getHeroSlides failed:', e instanceof Error ? e.message : e);
    return [];
  }
}

// ─── Appearance (runtime theme) ─────────────────────────

export interface AppearanceContent {
  /** Accent color as "#rrggbb"; null = built-in peach. */
  accent: string | null;
  /** Global animation speed: slow | normal | fast | off. */
  speed: 'slow' | 'normal' | 'fast' | 'off';
}

const SPEEDS = ['slow', 'normal', 'fast', 'off'] as const;

/**
 * Read the runtime theme settings (SiteSetting key 'appearance'). Admin sets
 * accent color + animation speed; the layout turns this into CSS vars.
 */
export async function getAppearance(): Promise<AppearanceContent> {
  const fallback: AppearanceContent = { accent: null, speed: 'normal' };
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: 'appearance' } });
    if (!row) return fallback;
    const parsed = JSON.parse(row.value) as Partial<AppearanceContent>;
    return {
      accent:
        typeof parsed.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.accent)
          ? parsed.accent
          : null,
      speed: SPEEDS.includes(parsed.speed as (typeof SPEEDS)[number])
        ? (parsed.speed as AppearanceContent['speed'])
        : 'normal',
    };
  } catch {
    return fallback;
  }
}

// ─── Store info (footer/contact) ─────────────────────────

export interface StoreInfoContent {
  name: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  line: string | null;
  facebook: string | null;
}

/**
 * Read editable store info (SiteSetting key 'store-info') used by the
 * footer and contact surfaces. Nulls mean "use the built-in default".
 */
export async function getStoreInfo(): Promise<StoreInfoContent> {
  const empty: StoreInfoContent = {
    name: null,
    description: null,
    email: null,
    phone: null,
    line: null,
    facebook: null,
  };
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: 'store-info' } });
    if (!row) return empty;
    const parsed = JSON.parse(row.value) as Partial<StoreInfoContent>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
    return {
      name: str(parsed.name),
      description: str(parsed.description),
      email: str(parsed.email),
      phone: str(parsed.phone),
      line: str(parsed.line),
      facebook: str(parsed.facebook),
    };
  } catch {
    return empty;
  }
}
