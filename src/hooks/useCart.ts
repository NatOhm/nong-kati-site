'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

import {
  type CartItemData,
  type CartState,
  getSessionKey,
  calculateCartSummary,
  getEmptyCart,
} from '@/lib/cart';

/**
 * Client-side cart hook.
 * Manages cart state in React and persists to localStorage.
 * Server-side re-validation happens at checkout (POST /orders).
 *
 * 01-prd.md FR-028: Cart persists 24 hours for guest.
 *
 * Each useCart() call is an independent instance (navbar, product page, …),
 * so instances sync through localStorage writes: the writer dispatches a
 * same-tab 'nk-cart-updated' event and cross-tab writes arrive as 'storage'
 * events. lastWrittenJsonRef prevents write→event→write echo loops between
 * instances.
 */
const CART_UPDATED_EVENT = 'nk-cart-updated';
const CART_STORAGE_KEY = 'nk_cart:v2';
const LEGACY_CART_KEY = 'nk_cart';

/** Read the stored cart (v2, migrating the legacy key once). Null when absent/corrupt/foreign-session. */
function readStoredCart(sessionKey: string): CartState | null {
  try {
    let json = localStorage.getItem(CART_STORAGE_KEY);
    if (!json) json = localStorage.getItem(LEGACY_CART_KEY);
    if (!json) return null;
    const parsed = JSON.parse(json) as CartState;
    if (parsed.sessionKey !== sessionKey) return null;
    // Summary is derived data — recompute instead of trusting stored values
    return { ...parsed, summary: calculateCartSummary(parsed.items) };
  } catch {
    return null;
  }
}

/** Persist the cart. No-ops where writes throw (Safari private mode, quota exceeded). */
function writeStoredCart(cart: CartState): void {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    localStorage.removeItem(LEGACY_CART_KEY);
  } catch {
    // Cart stays in memory only for this session
  }
}

export function useCart() {
  const [cart, setCart] = useState<CartState | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const lastWrittenJsonRef = useRef<string | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const sessionKey = getSessionKey();
    const stored = readStoredCart(sessionKey);
    if (stored) {
      setCart(stored);
      setIsLoaded(true);
      return;
    }
    setCart(getEmptyCart());
    setIsLoaded(true);
  }, []);

  // Persist to localStorage whenever cart changes, and notify other instances
  useEffect(() => {
    if (isLoaded && cart) {
      const json = JSON.stringify(cart);
      if (json !== lastWrittenJsonRef.current) {
        lastWrittenJsonRef.current = json;
        writeStoredCart(cart);
        window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT));
      }
    }
  }, [cart, isLoaded]);

  // Sync when another instance (same tab) or another tab updates the cart
  useEffect(() => {
    const syncFromStorage = () => {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (!stored || stored === lastWrittenJsonRef.current) return;
      lastWrittenJsonRef.current = stored;
      const parsed = readStoredCart(getSessionKey());
      if (parsed) setCart(parsed);
    };

    window.addEventListener(CART_UPDATED_EVENT, syncFromStorage);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  /**
   * Add an item to the cart.
   * If the item already exists, increases quantity.
   */
  const addItem = useCallback(
    (item: Omit<CartItemData, 'quantity' | 'lineTotalThb'>, quantity: number = 1) => {
      setCart((prev) => {
        if (!prev) return prev;

        const existingIndex = prev.items.findIndex((i) => i.variantId === item.variantId);
        let newItems: CartItemData[];

        if (existingIndex >= 0) {
          // Update existing item quantity
          newItems = prev.items.map((i, idx) => {
            if (idx !== existingIndex) return i;
            const newQty = Math.min(i.quantity + quantity, i.maxQuantity, 100);
            return {
              ...i,
              quantity: newQty,
              lineTotalThb: Math.round(i.unitPriceThb * newQty * 100) / 100,
            };
          });
        } else {
          // Add new item
          const newItem: CartItemData = {
            ...item,
            quantity: Math.min(quantity, item.maxQuantity, 100),
            lineTotalThb: Math.round(item.unitPriceThb * quantity * 100) / 100,
          };
          newItems = [...prev.items, newItem];
        }

        return {
          ...prev,
          items: newItems,
          summary: calculateCartSummary(newItems),
        };
      });
    },
    [],
  );

  /**
   * Update item quantity.
   */
  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    setCart((prev) => {
      if (!prev) return prev;

      const newItems = prev.items.map((i) => {
        if (i.variantId !== variantId) return i;
        const newQty = Math.max(1, Math.min(quantity, i.maxQuantity, 100));
        return {
          ...i,
          quantity: newQty,
          lineTotalThb: Math.round(i.unitPriceThb * newQty * 100) / 100,
        };
      });

      return {
        ...prev,
        items: newItems,
        summary: calculateCartSummary(newItems),
      };
    });
  }, []);

  /**
   * Remove an item from the cart.
   */
  const removeItem = useCallback((variantId: string) => {
    setCart((prev) => {
      if (!prev) return prev;

      const newItems = prev.items.filter((i) => i.variantId !== variantId);

      return {
        ...prev,
        items: newItems,
        summary: calculateCartSummary(newItems),
      };
    });
  }, []);

  /**
   * Clear all items from the cart.
   */
  const clearCart = useCallback(() => {
    setCart((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: [],
        summary: calculateCartSummary([]),
      };
    });
  }, []);

  /**
   * Check if a variant is already in the cart.
   */
  const isInCart = useCallback(
    (variantId: string) => {
      return cart?.items.some((i) => i.variantId === variantId) ?? false;
    },
    [cart],
  );

  /**
   * Get quantity of a specific variant in cart.
   */
  const getQuantity = useCallback(
    (variantId: string) => {
      return cart?.items.find((i) => i.variantId === variantId)?.quantity ?? 0;
    },
    [cart],
  );

  return {
    cart,
    isLoaded,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    isInCart,
    getQuantity,
    itemCount: cart?.summary.itemCount ?? 0,
  };
}
