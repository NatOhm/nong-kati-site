/**
 * Cart State Management — Guest cart persistence via localStorage.
 * 01-prd.md FR-028: Cart persists 24 hours for guest, server-side for authenticated.
 *
 * Session key: UUID stored in localStorage. Both guest and authenticated carts
 * use the same session key; cart is migrated to customer_id on login.
 */

export interface CartItemData {
  id: string;
  variantId: string;
  skuCode: string;
  productNameTh: string;
  productNameEn: string;
  productSlug: string;
  thumbnailUrl: string | null;
  denominationThb: number;
  unitPriceThb: number;
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
export function getSessionKey(): string {
  if (typeof window === 'undefined') return '';

  const existing = localStorage.getItem(CART_STORAGE_KEY);
  if (existing) return existing;

  const newKey = crypto.randomUUID();
  localStorage.setItem(CART_STORAGE_KEY, newKey);
  return newKey;
}

/**
 * Clear the session key from localStorage.
 */
export function clearSessionKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CART_STORAGE_KEY);
}

/**
 * Calculate cart summary from items.
 * Server-side re-validation happens at checkout; this is client-side display only.
 */
export function calculateCartSummary(items: CartItemData[]): CartSummary {
  let subtotalThb = 0;
  let itemCount = 0;

  for (const item of items) {
    const lineTotal = Math.round(item.unitPriceThb * item.quantity * 100) / 100;
    subtotalThb = Math.round((subtotalThb + lineTotal) * 100) / 100;
    itemCount += item.quantity;
  }

  const vatAmountThb = Math.round(subtotalThb * 0.07 * 100) / 100;
  const totalAmountThb = Math.round((subtotalThb + vatAmountThb) * 100) / 100;

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
