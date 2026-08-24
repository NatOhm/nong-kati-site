/**
 * Product API — Server-side product fetching.
 * In M2, queries go through the data layer (src/lib/data.ts).
 * In later milestones, these will use Prisma directly.
 */

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  imageUrl: string | null;
  category: { id: string; name: string; slug: string };
  variants: ProductVariant[];
  isFeatured: boolean;
}

export interface ProductVariant {
  id: string;
  label: string;
  price: number;
  stock: number;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  category: { id: string; name: string; slug: string };
  variants: ProductVariant[];
  aliases: string[];
  isActive: boolean;
  isFeatured: boolean;
}

// Re-export from data layer for M2
export {
  getFeaturedProducts,
  getProductsByCategory,
  getProductBySlug,
  getAllProductSlugs,
} from '@/lib/data';
