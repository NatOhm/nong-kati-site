/**
 * Data Provider — Prisma-backed queries for the catalog.
 * Replaces the M2 seed-data mock with real database queries.
 */

import { prisma } from '@/lib/db';

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
}

export interface ProductVariant {
  id: string;
  label: string;
  price: number;
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
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
}

// ─── Category helpers ─────────────────────────────────

function buildCategoryTree(
  cats: { id: string; name: string; slug: string; icon: string | null; parentId: string | null; sortOrder: number; isActive: boolean }[],
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

  return findInTree(tree, []);
}

export async function getAllCategorySlugs(): Promise<string[]> {
  const cats = await prisma.category.findMany({ select: { slug: true } });
  return cats.map((c) => c.slug);
}

// ─── Product helpers ───────────────────────────────────

function mapProduct(
  p: any,
  cat: { id: string; name: string; slug: string } | null,
): ProductItem {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    shortDescription: p.description
      ? p.description.replace(/<[^>]+>/g, '').slice(0, 100)
      : null,
    imageUrl: p.imageUrl,
    categoryId: p.categoryId,
    category: cat ?? { id: '', name: '', slug: '' },
    variants: (p.variants ?? []).map((v: any) => ({
      id: v.id,
      label: v.label,
      price: Number(v.price),
      stock: v.stock,
      isActive: v.isActive,
      sortOrder: v.sortOrder,
    })),
    aliases: (p.aliases ?? []).map((a: any) => a.alias),
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

  return products.map((p) => mapProduct(p, p.category));
}

export async function getProductsByCategory(
  slug: string,
  page: number = 1,
  limit: number = 24,
): Promise<{ products: ProductItem[]; total: number }> {
  const cat = await prisma.category.findUnique({ where: { slug } });
  if (!cat) return { products: [], total: 0 };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: { categoryId: cat.id, isActive: true },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: { orderBy: { sortOrder: 'asc' } },
        aliases: true,
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.count({ where: { categoryId: cat.id, isActive: true } }),
  ]);

  return {
    products: products.map((p) => mapProduct(p, p.category)),
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
    },
  });

  if (!p) return null;
  return mapProduct(p, p.category);
}

export async function getAllProductSlugs(): Promise<string[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { slug: true },
  });
  return products.map((p) => p.slug);
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
    products: products.map((p) => mapProduct(p, p.category)),
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
      name: { contains: trimmed, mode: 'insensitive' },
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
