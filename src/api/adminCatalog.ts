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
import { adminFetch, adminFetchJson } from '@/lib/adminSession';

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

function mapToAdminCategory(cat: CategoryItem, productCounts: Map<string, number>): AdminCategory {
  return {
    id: cat.id,
    slug: cat.slug,
    name: cat.name,
    icon: cat.icon,
    parentId: cat.parentId,
    sortOrder: cat.sortOrder,
    isActive: cat.isActive,
    productCount: productCounts.get(cat.id) ?? 0,
    children: cat.children.map((child) => mapToAdminCategory(child, productCounts)),
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
    products = (await Promise.all(allSlugs.map((slug) => getProductBySlug(slug)))).filter(
      (p): p is ProductItem => p !== null,
    );
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

export async function adminGetProduct(slug: string): Promise<AdminProduct | null> {
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
  }>,
): Promise<AdminProduct | null> {
  const existing = await adminGetProduct(slug);
  if (!existing) return null;

  return {
    ...existing,
    ...input,
  };
}

/**
 * PERMANENTLY delete a product (hard delete, not archive). Returns the row
 * counts the server destroyed so the caller can show what happened, or a
 * Thai reason when a guard refuses (in-flight order / orphaned paid code).
 */
export async function adminDeleteProductPermanent(id: string): Promise<{
  success: boolean;
  reason?: string;
  counts?: Record<string, number>;
  orderNumbers?: string[];
}> {
  const res = await adminFetch(`/api/v1/admin/products/${id}`, { method: 'DELETE' });
  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { counts?: Record<string, number> };
    return data.counts ? { success: true, counts: data.counts } : { success: true };
  }
  const err = (await res.json().catch(() => ({}))) as {
    error?: string;
    orderNumbers?: string[];
    detail?: string;
  };
  if (err.error === 'IN_FLIGHT_ORDER') {
    // The numbers come back structured so the UI can deep-link them into
    // /management/orders?orderNumber=… instead of dead plain text.
    return {
      success: false,
      reason: 'มีออเดอร์ที่ยังไม่เสร็จ ต้องส่งของหรือยกเลิกออเดอร์ก่อน',
      orderNumbers: err.orderNumbers ?? [],
    };
  }
  if (err.error === 'ORPHANED_RESERVED_CODE') {
    return {
      success: false,
      reason: 'มีรหัสที่ถูกจอง/ส่งให้ลูกค้าโดยไม่มีออเดอร์อ้างอิง ตรวจสอบหน้าจัดการรหัสก่อนลบ',
    };
  }
  if (err.error === 'NOT_FOUND') {
    return { success: false, reason: 'ไม่พบสินค้านี้ (อาจถูกลบไปแล้ว)' };
  }
  if (err.error === 'PURGE_FAILED') {
    return { success: false, reason: `ลบไม่สำเร็จ: ${err.detail ?? 'ข้อผิดพลาดภายในเซิร์ฟเวอร์'}` };
  }
  return { success: false, reason: err.error ?? `HTTP_${res.status}` };
}

// ─── Category CRUD ──────────────────────────────────────

async function countProductsByCategory(tree: CategoryItem[]): Promise<Map<string, number>> {
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

export async function adminGetCategory(slug: string): Promise<AdminCategory | null> {
  const result = await getCategoryBySlug(slug);
  if (!result) return null;

  const tree = await getCategoryTree();
  const productCounts = await countProductsByCategory(tree);

  return mapToAdminCategory(result.category, productCounts);
}

export async function adminCreateCategory(input: {
  name: string;
  slug?: string;
  parentId?: string;
  sortOrder?: number;
}): Promise<{ success: boolean; slug?: string; error?: string }> {
  const res = await adminFetchJson('/api/v1/admin/categories', 'POST', input);
  if (res.ok) {
    const data = (await res.json()) as { category?: { slug?: string } };
    const slug = data.category?.slug;
    return slug ? { success: true, slug } : { success: true };
  }
  const err = (await res.json().catch(() => ({}))) as { error?: string };
  return { success: false, error: err.error ?? `HTTP_${res.status}` };
}

export async function adminUpdateCategory(
  id: string,
  input: Partial<{
    name: string;
    slug: string;
    parentId: string | null;
    sortOrder: number;
    isActive: boolean;
  }>,
): Promise<{ success: boolean; slug?: string; error?: string }> {
  const res = await adminFetchJson(`/api/v1/admin/categories/${id}`, 'PUT', input);
  if (res.ok) {
    const data = (await res.json()) as { category?: { slug?: string } };
    const slug = data.category?.slug;
    return slug ? { success: true, slug } : { success: true };
  }
  const err = (await res.json().catch(() => ({}))) as { error?: string };
  return { success: false, error: err.error ?? `HTTP_${res.status}` };
}

/**
 * PERMANENTLY delete a category. With `cascade`, the whole subtree (child
 * categories + every product under them) is hard-deleted in one transaction.
 * Without it, the server refuses when the category still has children or
 * products, and the Thai reason names what blocked it.
 */
export async function adminDeleteCategory(
  id: string,
  opts: { cascade?: boolean } = {},
): Promise<{ success: boolean; reason?: string; orderNumbers?: string[] }> {
  const url = opts.cascade
    ? `/api/v1/admin/categories/${id}?cascade=true`
    : `/api/v1/admin/categories/${id}`;
  const res = await adminFetch(url, { method: 'DELETE' });
  if (res.ok) return { success: true };
  const err = (await res.json().catch(() => ({}))) as {
    error?: string;
    products?: number;
    orderNumbers?: string[];
    detail?: string;
  };
  if (err.error === 'HAS_PRODUCTS') {
    return {
      success: false,
      reason: `มีสินค้า ${err.products ?? 0} รายการอยู่ในหมวดนี้ ย้ายหรือลบสินค้าก่อน`,
    };
  }
  if (err.error === 'HAS_CHILDREN') {
    return { success: false, reason: 'มีหมวดหมู่ย่อยอยู่ ย้ายหรือลบหมวดย่อยก่อน' };
  }
  if (err.error === 'IN_FLIGHT_ORDER') {
    // The numbers come back structured so the UI can deep-link them into
    // /management/orders?orderNumber=… instead of dead plain text.
    return {
      success: false,
      reason: 'มีออเดอร์ที่ยังไม่เสร็จ ต้องส่งของหรือยกเลิกออเดอร์ก่อน',
      orderNumbers: err.orderNumbers ?? [],
    };
  }
  if (err.error === 'ORPHANED_RESERVED_CODE') {
    return {
      success: false,
      reason: 'มีรหัสที่ถูกจอง/ส่งให้ลูกค้าโดยไม่มีออเดอร์อ้างอิง ตรวจสอบหน้าจัดการรหัสก่อนลบ',
    };
  }
  if (err.error === 'NOT_FOUND') {
    return { success: false, reason: 'ไม่พบหมวดหมู่นี้ (อาจถูกลบไปแล้ว)' };
  }
  if (err.error === 'PURGE_FAILED') {
    return { success: false, reason: `ลบไม่สำเร็จ: ${err.detail ?? 'ข้อผิดพลาดภายในเซิร์ฟเวอร์'}` };
  }
  return { success: false, reason: err.error ?? `HTTP_${res.status}` };
}
