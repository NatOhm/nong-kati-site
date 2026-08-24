/**
 * Mock Data Provider — Uses seed data for M2 catalog without requiring a database.
 * When Prisma + PostgreSQL are configured, swap these to use the real services.
 * Source of truth: 06-database.md §22 seed data.
 */

import { seedCategories } from '@/seed-data/categories';
import { seedProducts } from '@/seed-data/products';

// Re-export types used by the API surface
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

// ─── Category helpers ─────────────────────────────────────

interface RawCategory {
  id: string;
  parentId: string | null;
  slug: string;
  nameTh: string;
  iconName: string | null;
  sortOrder: number;
  isActive: boolean;
}

function mapCategory(raw: RawCategory): CategoryItem {
  return {
    id: raw.id,
    name: raw.nameTh,
    slug: raw.slug,
    icon: raw.iconName,
    parentId: raw.parentId,
    sortOrder: raw.sortOrder,
    isActive: raw.isActive,
    children: [],
  };
}

function buildCategoryTree(flat: RawCategory[]): CategoryItem[] {
  const map = new Map<string, CategoryItem>();
  const roots: CategoryItem[] = [];

  for (const cat of flat) {
    map.set(cat.id, mapCategory(cat));
  }

  for (const cat of flat) {
    const node = map.get(cat.id)!;
    if (cat.parentId) {
      const parent = map.get(cat.parentId);
      if (parent) {
        parent.children.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

const categoryTree = buildCategoryTree(seedCategories as unknown as RawCategory[]);

// ─── Category Queries ─────────────────────────────────────

export function getTopLevelCategories(): CategoryItem[] {
  return categoryTree;
}

export function getCategoryTree(): CategoryItem[] {
  return categoryTree;
}

export function getCategoryBySlug(slug: string): {
  category: CategoryItem;
  breadcrumb: { id: string; name: string; slug: string }[];
} | null {
  function findInTree(
    nodes: CategoryItem[],
    trail: { id: string; name: string; slug: string }[],
  ): { category: CategoryItem; breadcrumb: { id: string; name: string; slug: string }[] } | null {
    for (const node of nodes) {
      const newTrail = [...trail, { id: node.id, name: node.name, slug: node.slug }];
      if (node.slug === slug) {
        return { category: node, breadcrumb: newTrail };
      }
      if (node.children.length > 0) {
        const found = findInTree(node.children, newTrail);
        if (found) return found;
      }
    }
    return null;
  }

  return findInTree(categoryTree, []);
}

export function getAllCategorySlugs(): string[] {
  function collectSlugs(nodes: CategoryItem[]): string[] {
    const slugs: string[] = [];
    for (const node of nodes) {
      slugs.push(node.slug);
      if (node.children.length > 0) {
        slugs.push(...collectSlugs(node.children));
      }
    }
    return slugs;
  }
  return collectSlugs(categoryTree);
}

// ─── Product helpers ───────────────────────────────────────

interface RawProduct {
  id: string;
  slug: string;
  nameTh: string;
  descriptionTh: string | null;
  thumbnailUrl: string | null;
  categoryId: string;
  isFeatured: boolean;
  status: string;
  variants: {
    id: string;
    skuCode: string;
    faceValueThb: string;
    salePriceThb: string;
    inStock: boolean;
    isLowStock: boolean;
    sortOrder: number;
    status: string;
  }[];
}

function mapProduct(raw: RawProduct, cat: CategoryItem | undefined): ProductItem {
  return {
    id: raw.id,
    name: raw.nameTh,
    slug: raw.slug,
    description: raw.descriptionTh,
    shortDescription: raw.descriptionTh
      ? raw.descriptionTh.replace(/<[^>]+>/g, '').slice(0, 100)
      : null,
    imageUrl: raw.thumbnailUrl,
    categoryId: raw.categoryId,
    category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : { id: '', name: '', slug: '' },
    variants: raw.variants.map((v) => ({
      id: v.id,
      label: `${v.faceValueThb} THB`,
      price: parseFloat(v.salePriceThb),
      stock: v.inStock ? (v.isLowStock ? 5 : 50) : 0,
      isActive: v.status === 'active',
      sortOrder: v.sortOrder,
    })),
    aliases: [],
    isActive: raw.status === 'published',
    isFeatured: raw.isFeatured,
    createdAt: new Date().toISOString(),
  };
}

function findCategoryById(id: string): CategoryItem | undefined {
  function search(nodes: CategoryItem[]): CategoryItem | undefined {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children.length > 0) {
        const found = search(node.children);
        if (found) return found;
      }
    }
    return undefined;
  }
  return search(categoryTree);
}

function findCategoryBySlugLocal(slug: string): CategoryItem | undefined {
  function search(nodes: CategoryItem[]): CategoryItem | undefined {
    for (const node of nodes) {
      if (node.slug === slug) return node;
      if (node.children.length > 0) {
        const found = search(node.children);
        if (found) return found;
      }
    }
    return undefined;
  }
  return search(categoryTree);
}

// ─── Product Queries ───────────────────────────────────────

export function getFeaturedProducts(): ProductItem[] {
  return seedProducts
    .filter((p) => p.isFeatured && p.status === 'published')
    .map((p) => {
      const cat = findCategoryById(p.categoryId);
      return mapProduct(p as unknown as RawProduct, cat);
    });
}

export function getProductsByCategory(
  slug: string,
  page: number = 1,
  limit: number = 24,
): { products: ProductItem[]; total: number } {
  const cat = findCategoryBySlugLocal(slug);
  if (!cat) return { products: [], total: 0 };

  const filtered = seedProducts.filter((p) => p.categoryId === cat.id && p.status === 'published');
  const total = filtered.length;
  const products = filtered.slice((page - 1) * limit, page * limit).map((p) =>
    mapProduct(p as unknown as RawProduct, cat),
  );

  return { products, total };
}

export function getProductBySlug(slug: string): ProductItem | null {
  const p = seedProducts.find((prod) => prod.slug === slug && prod.status === 'published');
  if (!p) return null;

  const cat = findCategoryById(p.categoryId);
  return mapProduct(p as unknown as RawProduct, cat);
}

export function getAllProductSlugs(): string[] {
  return seedProducts.filter((p) => p.status === 'published').map((p) => p.slug);
}

export function searchProducts(
  query: string,
  page: number = 1,
  limit: number = 24,
): { products: ProductItem[]; total: number; query: string } {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return { products: [], total: 0, query: '' };

  const filtered = seedProducts.filter((p) => {
    if (p.status !== 'published') return false;
    const matchesName = p.nameTh.toLowerCase().includes(trimmed);
    const matchesDesc = p.descriptionTh?.toLowerCase().includes(trimmed);
    const cat = findCategoryById(p.categoryId);
    const matchesCategory = cat?.name.toLowerCase().includes(trimmed);
    return matchesName || matchesDesc || matchesCategory;
  });

  const total = filtered.length;
  const products = filtered.slice((page - 1) * limit, page * limit).map((p) => {
    const cat = findCategoryById(p.categoryId);
    return mapProduct(p as unknown as RawProduct, cat);
  });

  return { products, total, query: trimmed };
}

export function getSearchSuggestions(
  query: string,
  limit: number = 5,
): { name: string; slug: string; categoryName: string }[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  return seedProducts
    .filter((p) => {
      if (p.status !== 'published') return false;
      return p.nameTh.toLowerCase().includes(trimmed);
    })
    .slice(0, limit)
    .map((p) => {
      const cat = findCategoryById(p.categoryId);
      return {
        name: p.nameTh,
        slug: p.slug,
        categoryName: cat?.name ?? '',
      };
    });
}
