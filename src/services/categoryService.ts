/**
 * Category Service — Business logic for category operations.
 * In M2, delegates to the data layer. In later milestones, uses Prisma directly.
 */

import {
  getCategoryTree,
  getTopLevelCategories,
  getCategoryBySlug,
  getAllCategorySlugs,
} from '@/lib/data';

export interface CategoryWithChildren {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  children: CategoryWithChildren[];
}

/**
 * Get the full category tree for navigation.
 */
export async function getCategoryTreeService(): Promise<CategoryWithChildren[]> {
  return getCategoryTree();
}

/**
 * Get top-level categories for the homepage.
 */
export async function getTopLevelCategoriesService(): Promise<CategoryWithChildren[]> {
  return getTopLevelCategories();
}

/**
 * Get a single category by slug with breadcrumb trail.
 */
export async function getCategoryBySlugService(slug: string) {
  return getCategoryBySlug(slug);
}

/**
 * Get all category slugs for static generation.
 */
export async function getAllCategorySlugsService(): Promise<string[]> {
  return getAllCategorySlugs();
}
