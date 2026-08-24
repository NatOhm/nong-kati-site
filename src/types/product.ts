/** 06-database.md §7 — product status enum */
export type ProductStatus = 'draft' | 'published' | 'archived';

/** 06-database.md §7 — variant status enum */
export type VariantStatus = 'active' | 'discontinued';

/**
 * Category from GET /api/v1/categories — 07-api.md §7.1.
 * Two-level: Level 1 (parent_id NULL) → Level 2 (parent_id = Level 1 id).
 */
export interface Category {
  id: string;
  slug: string;
  nameTh: string;
  nameEn: string;
  iconName: string | null;
  sortOrder: number;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  heroImageUrl: string | null;
  productCount: number;
  children: Category[];
}

/**
 * Category with parent info for breadcrumb context — 07-api.md §7.1 GET /categories/:slug.
 */
export interface CategoryDetail extends Category {
  parent: { id: string; slug: string; nameTh: string; nameEn: string } | null;
}

/**
 * Product list item from GET /api/v1/products — 07-api.md §7.2.
 */
export interface ProductListItem {
  id: string;
  slug: string;
  nameTh: string;
  nameEn: string;
  thumbnailUrl: string | null;
  category: { slug: string; nameTh: string };
  startingPriceThb: string;
  isFeatured: boolean;
  inStock: boolean;
  isLowStock: boolean;
  averageRating: string | null;
  reviewCount: number;
  variantsCount: number;
}

/**
 * Product detail from GET /api/v1/products/:slug — 07-api.md §7.2.
 */
export interface ProductDetail {
  id: string;
  slug: string;
  nameTh: string;
  nameEn: string;
  descriptionTh: string | null;
  thumbnailUrl: string | null;
  category: {
    id: string;
    slug: string;
    nameTh: string;
    nameEn: string;
    parent: { slug: string; nameTh: string } | null;
  };
  redemptionInstructions: string | null;
  refundPolicyNote: string | null;
  isFeatured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  averageRating: string | null;
  reviewCount: number;
  variants: ProductVariant[];
  structuredData: Record<string, unknown>;
}

/**
 * Product variant (denomination) — 06-database.md §7.
 */
export interface ProductVariant {
  id: string;
  skuCode: string;
  faceValueThb: string;
  salePriceThb: string;
  vatAmountThb: string;
  salePriceExVatThb: string;
  status: VariantStatus;
  inStock: boolean;
  isLowStock: boolean;
  sortOrder: number;
}

/**
 * Pagination metadata from 07-api.md §5.1.
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Standard API response envelope — 07-api.md §3.1.
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    requestId?: string;
    timestamp?: string;
    pagination?: PaginationMeta;
  };
}

/**
 * Product with inventory snapshot data for display.
 * Computed from products joined with inventory_snapshots.
 */
export interface ProductWithInventory extends ProductListItem {
  availableCount: number;
}
