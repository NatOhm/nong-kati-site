/**
 * Search Service — Business logic for search operations.
 * In M2, delegates to the data layer. In later milestones, uses Prisma full-text search.
 */

import { searchProducts, getSearchSuggestions } from '@/lib/data';

/**
 * Search products by query string.
 */
export async function searchProductsService(query: string, page = 1, limit = 24) {
  return searchProducts(query, page, limit);
}

/**
 * Get search suggestions for autocomplete.
 */
export async function getSearchSuggestionsService(query: string, limit = 5) {
  return getSearchSuggestions(query, limit);
}
