'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import {
  type CartItemData,
  type CartState,
  getSessionKey,
  calculateCartSummary,
  getEmptyCart,
} from '@/lib/cart';
import { mergeCartPrices, type ServerPricedLine } from '@/lib/cartRefresh';

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
  // Latest committed cart, readable from async callbacks without re-creating them.
  const cartRef = useRef<CartState | null>(null);
  // Price refresh is throttled: focus/visibility fire in bursts, and every
  // refresh is a server round trip.
  const lastRefreshRef = useRef(0);

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

  // Keep the ref in step for refreshPrices (declared once, never re-created).
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  /**
   * Re-price the stored cart against the server.
   *
   * Items live in localStorage with the price they had when they were added,
   * so an admin price edit never reached an existing cart (client report:
   * ฿1 → ฿50 stayed ฿1 in the drawer and the checkout summary). The preview
   * endpoint is the same pricing resolver order creation uses, requested in
   * tolerant mode so one unavailable line cannot blank the whole refresh.
   */
  const refreshPrices = useCallback(async () => {
    const current = cartRef.current;
    if (!current || current.items.length === 0) return;
    if (Date.now() - lastRefreshRef.current < 15_000) return;
    lastRefreshRef.current = Date.now();

    let lines: ServerPricedLine[] | undefined;
    try {
      const res = await fetch('/api/v1/orders/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: '',
          tolerant: true,
          items: current.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: ServerPricedLine[] };
      lines = data.items;
    } catch {
      return;
    }
    if (!lines) return;

    setCart((prev) => {
      if (!prev) return prev;
      const merged = mergeCartPrices(prev.items, lines);
      if (merged === prev.items) return prev;
      return { ...prev, items: merged, summary: calculateCartSummary(merged) };
    });
  }, []);

  // Refresh once the stored cart is hydrated, and again when the tab is
  // returned to (an admin may have changed prices while it sat in the
  // background). Throttled inside refreshPrices.
  useEffect(() => {
    if (!isLoaded) return;
    void refreshPrices();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refreshPrices();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isLoaded, refreshPrices]);

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
    return () => {
      window.removeEventListener('storage', syncFromStorage);
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
