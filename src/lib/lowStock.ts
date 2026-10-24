/**
 * The low-stock line, in one place.
 *
 * The dashboard route hardcoded `lte: 5` + `threshold: 5` and the inventory
 * page kept its own `LOW_STOCK_THRESHOLD = 5` (review 2026-10-24): two admin
 * surfaces that silently disagreed the moment either number changed.
 *
 * This is the DISPLAY/count threshold. Notifications are different — they
 * read the admin-configured `lowStockThreshold` from settings, falling back
 * to this same number.
 */
export const LOW_STOCK_THRESHOLD = 5;
