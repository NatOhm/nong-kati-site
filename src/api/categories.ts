/**
 * Category API — Server-side category fetching.
 * In M2, queries go through the data layer (src/lib/data.ts).
 * In later milestones, these will use Prisma directly.
 */

export interface CategoryNavItem {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  children: CategoryNavItem[];
}

export interface CategoryBreadcrumb {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

// Re-export from data layer for M2
export {
  getCategoryTree,
  getTopLevelCategories,
  getCategoryBySlug,
  getAllCategorySlugs,
} from '@/lib/data';
