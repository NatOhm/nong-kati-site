/**
 * Cart State Management — Guest cart persistence via localStorage.
 * 01-prd.md FR-028: Cart persists 24 hours for guest, server-side for authenticated.
 *
 * Session key: UUID stored in localStorage. Both guest and authenticated carts
 * use the same session key; cart is migrated to customer_id on login.
 */

import { randomUUID } from '@/lib/uuid';
import { safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/storage';

export interface CartItemData {
  id: string;
  variantId: string;
  skuCode: string;
  productNameTh: string;
  productNameEn: string;
  productSlug: string;
  /** Package label of the chosen variant (e.g. "1 เดือน"); without it the
   *  cart showed three identical product rows with only the price differing
   *  (client feedback 2026-11-13). */
  variantLabel?: string;
  thumbnailUrl: string | null;
  denominationThb: number;
  unitPriceThb: number;
  originalUnitPriceThb?: number;
  promotionName?: string;
  promotionExpiresAt?: string | null;
  vatAmountThb: number;
  quantity: number;
  lineTotalThb: number;
  inStock: boolean;
  availableQuantity: number;
  maxQuantity: number;
}

export interface CartSummary {
  subtotalThb: number;
  vatAmountThb: number;
  totalAmountThb: number;
  itemCount: number;
  discountAmountThb: number;
}

export interface CartState {
  cartId: string | null;
  sessionKey: string;
  items: CartItemData[];
  summary: CartSummary;
  expiresAt: string | null;
}

const CART_STORAGE_KEY = 'nk_cart_session';
const CART_EXPIRY_HOURS = 24;

/**
 * Generate or retrieve the session key (UUID) from localStorage.
 */
/** In-memory session key for browsers where storage throws (iOS Private Mode). */
let volatileSessionKey: string | null = null;

export function getSessionKey(): string {
  if (typeof window === 'undefined') return '';

  const existing = safeGetItem(CART_STORAGE_KEY);
  if (existing) return existing;

  const newKey = randomUUID();
  // If the write is refused the cart still works for this page view — it just
  // cannot survive a reload. Throwing here blanked the whole storefront.
  if (safeSetItem(CART_STORAGE_KEY, newKey)) return newKey;
  volatileSessionKey ??= newKey;
  return volatileSessionKey;
}

/**
 * Clear the session key from localStorage.
 */
export function clearSessionKey(): void {
  if (typeof window === 'undefined') return;
  safeRemoveItem(CART_STORAGE_KEY);
}

/**
 * Calculate cart summary from items.
 * Client-side display only. Prices are VAT-inclusive (matching the server-side
 * authoritative calculation). VAT is shown as informational only; the actual
 * VAT component is derived server-side from the final charge.
 *
 * When VAT is disabled or the rate is unknown client-side, VAT is shown as 0
 * and the total equals the subtotal. The server will recompute VAT correctly
 * at checkout (see src/lib/promotions.ts calculateReconciledOrderPricing).
 */
export function calculateCartSummary(items: CartItemData[]): CartSummary {
  let subtotalThb = 0;
  let itemCount = 0;

  for (const item of items) {
    const lineTotal = Math.round(item.unitPriceThb * item.quantity * 100) / 100;
    subtotalThb = Math.round((subtotalThb + lineTotal) * 100) / 100;
    itemCount += item.quantity;
  }

  // Prices are VAT-inclusive. The cart summary shows subtotal = total when
  // VAT breakdown is not available client-side. The server derives the VAT
  // component from the final charge at checkout.
  const vatAmountThb = 0;
  const totalAmountThb = subtotalThb;

  return {
    subtotalThb,
    vatAmountThb,
    totalAmountThb,
    itemCount,
    discountAmountThb: 0,
  };
}

/**
 * Get empty cart state.
 */
export function getEmptyCart(): CartState {
  return {
    cartId: null,
    sessionKey: getSessionKey(),
    items: [],
    summary: {
      subtotalThb: 0,
      vatAmountThb: 0,
      totalAmountThb: 0,
      itemCount: 0,
      discountAmountThb: 0,
    },
    expiresAt: null,
  };
}
