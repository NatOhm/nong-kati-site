/**
 * Search API — Server-side product search.
 * In M2, queries go through the data layer (src/lib/data.ts).
 * In later milestones, these will use Prisma full-text search or external search service.
 */

export interface SearchResult {
  products: SearchResultItem[];
  total: number;
  query: string;
}

export interface SearchResultItem {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  imageUrl: string | null;
  category: { id: string; name: string; slug: string };
  variants: SearchResultVariant[];
}

export interface SearchResultVariant {
  id: string;
  label: string;
  price: number;
  stock: number;
}

// Re-export from data layer for M2
export { searchProducts, getSearchSuggestions } from '@/lib/data';
