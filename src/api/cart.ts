/**
 * Cart API — Mock implementation using seed data.
 * 07-api.md §9 — Full cart CRUD: GET/POST/PATCH/DELETE cart + items.
 *
 * In M2/M3 this operates client-side with localStorage.
 * In M4+ these become real API calls to /api/v1/cart/*.
 */

import { seedProducts } from '@/seed-data/products';
import {
  type CartItemData,
  type CartState,
  calculateCartSummary,
  getEmptyCart,
} from '@/lib/cart';

// In-memory cart store for mock API (simulates server-side cart)
const cartStore = new Map<string, CartState>();

/**
 * Find a variant by ID across all seed products.
 */
function findVariant(
  variantId: string,
): {
  variant: { id: string; skuCode: string; faceValueThb: string; salePriceThb: string; inStock: boolean; sortOrder: number };
  product: (typeof seedProducts)[number];
} | null {
  for (const product of seedProducts) {
    for (const variant of product.variants) {
      if (variant.id === variantId) {
        return { variant, product };
      }
    }
  }
  return null;
}

/**
 * Get or create a cart by session key.
 */
export function getCart(sessionKey: string): CartState {
  const existing = cartStore.get(sessionKey);
  if (existing) return existing;

  const cart = getEmptyCart();
  cart.sessionKey = sessionKey;
  cartStore.set(sessionKey, cart);
  return cart;
}

/**
 * Add an item to the cart.
 * 07-api.md §9 — POST /cart/items
 */
export function addToCart(
  sessionKey: string,
  variantId: string,
  quantity: number = 1,
): CartState {
  const cart = getCart(sessionKey);
  const found = findVariant(variantId);

  if (!found) {
    throw new Error('VARIANT_NOT_FOUND');
  }

  const { variant, product } = found;

  if (!variant.inStock) {
    throw new Error('OUT_OF_STOCK');
  }

  // Check existing quantity
  const existingItem = cart.items.find((i) => i.variantId === variantId);
  const currentQty = existingItem?.quantity ?? 0;
  const newQty = currentQty + quantity;

  if (newQty > 100) {
    throw new Error('QUANTITY_EXCEEDS_MAXIMUM');
  }

  const unitPrice = parseFloat(variant.salePriceThb);
  const vatAmount = Math.round(unitPrice * 0.07 * 100) / 100;

  if (existingItem) {
    // Update quantity
    cart.items = cart.items.map((i) =>
      i.variantId === variantId
        ? {
            ...i,
            quantity: newQty,
            lineTotalThb: Math.round(unitPrice * newQty * 100) / 100,
          }
        : i,
    );
  } else {
    // Add new item
    const newItem: CartItemData = {
      id: `cart-item-${variantId}-${Date.now()}`,
      variantId,
      skuCode: variant.skuCode,
      productNameTh: product.nameTh,
      productNameEn: product.nameEn,
      productSlug: product.slug,
      thumbnailUrl: product.thumbnailUrl,
      denominationThb: parseFloat(variant.faceValueThb),
      unitPriceThb: unitPrice,
      vatAmountThb: vatAmount,
      quantity,
      lineTotalThb: Math.round(unitPrice * quantity * 100) / 100,
      inStock: true,
      availableQuantity: 50,
      maxQuantity: 10,
    };
    cart.items.push(newItem);
  }

  cart.summary = calculateCartSummary(cart.items);
  cartStore.set(sessionKey, cart);
  return cart;
}

/**
 * Update item quantity.
 * 07-api.md §9 — PATCH /cart/items/:item_id
 */
export function updateCartItem(
  sessionKey: string,
  variantId: string,
  quantity: number,
): CartState {
  const cart = getCart(sessionKey);

  if (quantity < 1) {
    throw new Error('INVALID_QUANTITY');
  }

  const item = cart.items.find((i) => i.variantId === variantId);
  if (!item) {
    throw new Error('ITEM_NOT_FOUND');
  }

  if (quantity > item.maxQuantity) {
    throw new Error('QUANTITY_EXCEEDS_STOCK');
  }

  cart.items = cart.items.map((i) =>
    i.variantId === variantId
      ? {
          ...i,
          quantity,
          lineTotalThb: Math.round(i.unitPriceThb * quantity * 100) / 100,
        }
      : i,
  );

  cart.summary = calculateCartSummary(cart.items);
  cartStore.set(sessionKey, cart);
  return cart;
}

/**
 * Remove an item from the cart.
 * 07-api.md §9 — DELETE /cart/items/:item_id
 */
export function removeCartItem(
  sessionKey: string,
  variantId: string,
): CartState {
  const cart = getCart(sessionKey);
  cart.items = cart.items.filter((i) => i.variantId !== variantId);
  cart.summary = calculateCartSummary(cart.items);
  cartStore.set(sessionKey, cart);
  return cart;
}

/**
 * Clear all items from the cart.
 * 07-api.md §9 — DELETE /cart
 */
export function clearCart(sessionKey: string): CartState {
  const cart = getCart(sessionKey);
  cart.items = [];
  cart.summary = calculateCartSummary([]);
  cartStore.set(sessionKey, cart);
  return cart;
}

/**
 * Apply coupon — stubbed for M3 (coupons are Phase 2).
 * 07-api.md §9 — POST /cart/apply-coupon → 404 NOT_FOUND
 */
export function applyCoupon(
  _sessionKey: string,
  _couponCode: string,
): never {
  throw new Error('COUPON_NOT_FOUND');
}

/**
 * Remove coupon — stubbed for M3.
 * 07-api.md §9 — DELETE /cart/coupon → 404 NOT_FOUND
 */
export function removeCoupon(_sessionKey: string): never {
  throw new Error('COUPON_NOT_FOUND');
}
