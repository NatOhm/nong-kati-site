'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import {
  type CartItemData,
  type CartState,
  getSessionKey,
  calculateCartSummary,
  getEmptyCart,
} from '@/lib/cart';

/**
 * Cart state lives in ONE provider instance mounted at the root layout, so every
 * consumer (navbar badge, cart drawer, product page, checkout) shares the same
 * state — no cross-component sync needed. Follows the provider pattern:
 * the provider is the only place that knows how state is managed; consumers
 * depend only on this context interface.
 *
 * Cross-TAB sync still uses the `storage` event (each tab has its own provider).
 *
 * 01-prd.md FR-028: Cart persists 24 hours for guest.
 */

const CART_STORAGE_KEY = 'nk_cart:v2';
const LEGACY_CART_KEY = 'nk_cart';
const STORAGE_SYNC_EVENT = 'nk-cart-storage-sync';

interface CartContextValue {
  // State
  cart: CartState | null;
  isLoaded: boolean;
  itemCount: number;
  // Actions
  addItem: (item: Omit<CartItemData, 'quantity' | 'lineTotalThb'>, quantity?: number) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clearCart: () => void;
  // Derived helpers
  isInCart: (variantId: string) => boolean;
  getQuantity: (variantId: string) => number;
}

const CartContext = createContext<CartContextValue | null>(null);

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

export function CartProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [cart, setCart] = useState<CartState | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const lastWrittenJsonRef = useRef<string | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const sessionKey = getSessionKey();
    const stored = readStoredCart(sessionKey);
    if (stored) {
      lastWrittenJsonRef.current = JSON.stringify(stored);
      setCart(stored);
      setIsLoaded(true);
      return;
    }
    setCart(getEmptyCart());
    setIsLoaded(true);
  }, []);

  // Persist to localStorage whenever the cart changes
  useEffect(() => {
    if (isLoaded && cart) {
      const json = JSON.stringify(cart);
      if (json !== lastWrittenJsonRef.current) {
        lastWrittenJsonRef.current = json;
        writeStoredCart(cart);
      }
    }
  }, [cart, isLoaded]);

  // Cross-tab sync: another tab wrote to localStorage
  useEffect(() => {
    const syncFromStorage = () => {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (!stored || stored === lastWrittenJsonRef.current) return;
      lastWrittenJsonRef.current = stored;
      const parsed = readStoredCart(getSessionKey());
      if (parsed) setCart(parsed);
    };

    window.addEventListener('storage', syncFromStorage);
    window.addEventListener(STORAGE_SYNC_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener(STORAGE_SYNC_EVENT, syncFromStorage);
    };
  }, []);

  const addItem = useCallback(
    (item: Omit<CartItemData, 'quantity' | 'lineTotalThb'>, quantity: number = 1) => {
      setCart((prev) => {
        if (!prev) return prev;

        const existingIndex = prev.items.findIndex((i) => i.variantId === item.variantId);
        let newItems: CartItemData[];

        if (existingIndex >= 0) {
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
          const newItem: CartItemData = {
            ...item,
            quantity: Math.min(quantity, item.maxQuantity, 100),
            lineTotalThb: Math.round(item.unitPriceThb * quantity * 100) / 100,
          };
          newItems = [...prev.items, newItem];
        }

        return { ...prev, items: newItems, summary: calculateCartSummary(newItems) };
      });
    },
    [],
  );

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

      return { ...prev, items: newItems, summary: calculateCartSummary(newItems) };
    });
  }, []);

  const removeItem = useCallback((variantId: string) => {
    setCart((prev) => {
      if (!prev) return prev;
      const newItems = prev.items.filter((i) => i.variantId !== variantId);
      return { ...prev, items: newItems, summary: calculateCartSummary(newItems) };
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart((prev) => {
      if (!prev) return prev;
      return { ...prev, items: [], summary: calculateCartSummary([]) };
    });
  }, []);

  const isInCart = useCallback(
    (variantId: string) => cart?.items.some((i) => i.variantId === variantId) ?? false,
    [cart],
  );

  const getQuantity = useCallback(
    (variantId: string) => cart?.items.find((i) => i.variantId === variantId)?.quantity ?? 0,
    [cart],
  );

  const value: CartContextValue = {
    cart,
    isLoaded,
    itemCount: cart?.summary.itemCount ?? 0,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    isInCart,
    getQuantity,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** Consume the cart context. Throws when used outside <CartProvider> — that's a wiring bug, not a runtime condition. */
export function useCartContext(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within <CartProvider> (mounted in src/app/layout.tsx)');
  }
  return ctx;
}

export { STORAGE_SYNC_EVENT };
