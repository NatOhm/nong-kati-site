/**
 * Admin Product & Category CRUD API
 * 07-api.md §20 — Admin catalog management
 * Uses mock data for M6 (Prisma in production)
 */
import {
  getCategoryTree,
  getCategoryBySlug,
  getAllCategorySlugs,
  getProductsByCategory,
  getProductBySlug,
  getAllProductSlugs,
  searchProducts,
} from '@/lib/data';
import type { CategoryItem, ProductItem } from '@/lib/data';

// ─── Types ──────────────────────────────────────────────

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  isActive: boolean;
  isFeatured: boolean;
  variants: {
    id: string;
    label: string;
    price: number;
    stock: number;
    isActive: boolean;
    sortOrder: number;
  }[];
  createdAt: string;
};

export type AdminCategory = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  children: AdminCategory[];
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// ─── Product CRUD ───────────────────────────────────────

function mapToAdminProduct(product: ProductItem): AdminProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    shortDescription: product.shortDescription,
    imageUrl: product.imageUrl,
    categoryId: product.categoryId,
    categorySlug: product.category.slug,
    categoryName: product.category.name,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    variants: product.variants.map((v) => ({
      id: v.id,
      label: v.label,
      price: v.price,
      stock: v.stock,
      isActive: v.isActive,
      sortOrder: v.sortOrder,
    })),
    createdAt: product.createdAt,
  };
}

function mapToAdminCategory(
  cat: CategoryItem,
  productCounts: Map<string, number>
): AdminCategory {
  return {
    id: cat.id,
    slug: cat.slug,
    name: cat.name,
    icon: cat.icon,
    parentId: cat.parentId,
    sortOrder: cat.sortOrder,
    isActive: cat.isActive,
    productCount: productCounts.get(cat.id) ?? 0,
    children: cat.children.map((child) =>
      mapToAdminCategory(child, productCounts)
    ),
  };
}

export async function adminListProducts(params: {
  page?: number;
  limit?: number;
  categorySlug?: string;
  search?: string;
  isActive?: boolean;
}): Promise<PaginatedResult<AdminProduct>> {
  const { page = 1, limit = 20, categorySlug, search: searchTerm, isActive } = params;

  let products: ProductItem[] = [];

  if (searchTerm) {
    const result = await searchProducts(searchTerm, 1, 1000);
    products = result.products;
  } else if (categorySlug) {
    const result = await getProductsByCategory(categorySlug, 1, 1000);
    products = result.products;
  } else {
    // Get all products
    const allSlugs = await getAllProductSlugs();
    products = (
      await Promise.all(allSlugs.map((slug) => getProductBySlug(slug)))
    ).filter((p): p is ProductItem => p !== null);
  }

  // Filter by active status
  if (isActive !== undefined) {
    products = products.filter((p) => p.isActive === isActive);
  }

  const total = products.length;
  const offset = (page - 1) * limit;
  const paginatedProducts = products.slice(offset, offset + limit);

  return {
    data: paginatedProducts.map(mapToAdminProduct),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function adminGetProduct(
  slug: string
): Promise<AdminProduct | null> {
  const product = await getProductBySlug(slug);
  if (!product) return null;
  return mapToAdminProduct(product);
}

export async function adminCreateProduct(input: {
  name: string;
  slug: string;
  description?: string;
  categorySlug: string;
  isFeatured?: boolean;
}): Promise<AdminProduct> {
  const now = new Date().toISOString();
  return {
    id: `prod_${Date.now()}`,
    slug: input.slug,
    name: input.name,
    description: input.description ?? null,
    shortDescription: null,
    imageUrl: null,
    categoryId: '',
    categorySlug: input.categorySlug,
    categoryName: '',
    isActive: true,
    isFeatured: input.isFeatured ?? false,
    variants: [],
    createdAt: now,
  };
}

export async function adminUpdateProduct(
  slug: string,
  input: Partial<{
    name: string;
    description: string;
    categorySlug: string;
    isActive: boolean;
    isFeatured: boolean;
  }>
): Promise<AdminProduct | null> {
  const existing = await adminGetProduct(slug);
  if (!existing) return null;

  return {
    ...existing,
    ...input,
  };
}

export async function adminDeleteProduct(
  slug: string
): Promise<{ success: boolean }> {
  const existing = await adminGetProduct(slug);
  if (!existing) return { success: false };
  return { success: true };
}

// ─── Category CRUD ──────────────────────────────────────

async function countProductsByCategory(
  tree: CategoryItem[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  async function walk(nodes: CategoryItem[]) {
    for (const node of nodes) {
      const result = await getProductsByCategory(node.slug, 1, 1000);
      counts.set(node.id, result.total);
      if (node.children.length > 0) {
        await walk(node.children);
      }
    }
  }

  await walk(tree);
  return counts;
}

export async function adminListCategories(): Promise<AdminCategory[]> {
  const tree = await getCategoryTree();
  const productCounts = await countProductsByCategory(tree);

  return tree.map((cat) => mapToAdminCategory(cat, productCounts));
}

export async function adminGetCategory(
  slug: string
): Promise<AdminCategory | null> {
  const result = await getCategoryBySlug(slug);
  if (!result) return null;

  const tree = await getCategoryTree();
  const productCounts = await countProductsByCategory(tree);

  return mapToAdminCategory(result.category, productCounts);
}

export async function adminCreateCategory(input: {
  name: string;
  slug: string;
  parentId?: string;
  sortOrder?: number;
}): Promise<AdminCategory> {
  const now = new Date().toISOString();
  return {
    id: `cat_${Date.now()}`,
    slug: input.slug,
    name: input.name,
    icon: null,
    parentId: input.parentId ?? null,
    sortOrder: input.sortOrder ?? 0,
    isActive: true,
    productCount: 0,
    children: [],
  };
}

export async function adminUpdateCategory(
  slug: string,
  input: Partial<{
    name: string;
    sortOrder: number;
    isActive: boolean;
  }>
): Promise<AdminCategory | null> {
  const existing = await adminGetCategory(slug);
  if (!existing) return null;

  return {
    ...existing,
    ...input,
  };
}

export async function adminDeleteCategory(
  slug: string
): Promise<{ success: boolean; reason?: string }> {
  const result = await getProductsByCategory(slug, 1, 1);
  if (result.total > 0) {
    return {
      success: false,
      reason: 'Cannot delete category with associated products',
    };
  }

  return { success: true };
}
