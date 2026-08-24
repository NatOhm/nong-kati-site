'use client';

import { useState, useCallback, useEffect } from 'react';

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
 */
export function useCart() {
  const [cart, setCart] = useState<CartState | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const sessionKey = getSessionKey();
    const stored = localStorage.getItem('nk_cart');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as CartState;
        if (parsed.sessionKey === sessionKey) {
          setCart(parsed);
          setIsLoaded(true);
          return;
        }
      } catch {
        // Corrupted data — start fresh
      }
    }
    setCart(getEmptyCart());
    setIsLoaded(true);
  }, []);

  // Persist to localStorage whenever cart changes
  useEffect(() => {
    if (isLoaded && cart) {
      localStorage.setItem('nk_cart', JSON.stringify(cart));
    }
  }, [cart, isLoaded]);

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
