/**
 * Product Service — Business logic for product operations.
 * In M2, delegates to the data layer. In later milestones, uses Prisma directly.
 */

import {
  getFeaturedProducts,
  getProductsByCategory,
  getProductBySlug,
  getAllProductSlugs,
} from '@/lib/data';

/**
 * Get featured products for the homepage.
 */
export async function getFeaturedProductsService() {
  return getFeaturedProducts();
}

/**
 * Get products by category slug.
 */
export async function getProductsByCategoryService(slug: string, page = 1, limit = 24) {
  return getProductsByCategory(slug, page, limit);
}

/**
 * Get a single product by slug.
 */
export async function getProductBySlugService(slug: string) {
  return getProductBySlug(slug);
}

/**
 * Get all product slugs for static generation.
 */
export async function getAllProductSlugsService(): Promise<string[]> {
  return getAllProductSlugs();
}
