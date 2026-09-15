'use client';

import { useCartContext } from '@/providers/CartProvider';

/**
 * Cart hook — thin re-export of the root CartProvider context.
 *
 * State is owned by <CartProvider> mounted in src/app/layout.tsx, so every
 * consumer shares one state instance (navbar badge, drawer, checkout, product
 * page all stay in sync automatically). Kept as a hook-shaped shim so the
 * existing call sites don't change.
 */
export function useCart() {
  return useCartContext();
}
