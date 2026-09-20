'use client';

import { useCallback, useRef, useState } from 'react';

import { useCart } from '@/hooks/useCart';
import { useToast } from '@/hooks/useToast';

type BuyState = 'idle' | 'pending' | 'added';

interface CardBuyInput {
  /** First (default) variant id — required for direct add. */
  variantId?: string | undefined;
  /** >1 means multi-variant → no direct add (pick a price instead). */
  variantCount?: number | undefined;
  name: string;
  slug: string;
  imageUrl?: string | null | undefined;
  price: number;
  stock: number;
}

/**
 * Buy-from-card state machine shared by every product card layout
 * (catalog card, search tile): idle → pending (450ms squish) → added → idle.
 * Adds the first variant to the cart with a toast; multi-variant and
 * out-of-stock products never direct-add (caller routes them elsewhere).
 */
export function useCardBuy(input: CardBuyInput): {
  canDirectAdd: boolean;
  buyState: BuyState;
  handleBuy: () => void;
} {
  const { addItem } = useCart();
  const { toast } = useToast();
  const [buyState, setBuyState] = useState<BuyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canDirectAdd =
    Boolean(input.variantId) && (input.variantCount ?? 1) <= 1 && input.stock > 0;

  const handleBuy = useCallback(() => {
    const { variantId } = input;
    if (!canDirectAdd || !variantId || buyState !== 'idle') return;

    setBuyState('pending');
    pendingTimer.current = setTimeout(() => {
      addItem(
        {
          id: `cart-${variantId}-${Date.now()}`,
          variantId,
          skuCode: `${input.slug}-${variantId}`,
          productNameTh: input.name,
          productNameEn: input.name,
          productSlug: input.slug,
          thumbnailUrl: input.imageUrl ?? null,
          denominationThb: input.price,
          unitPriceThb: input.price,
          vatAmountThb: Math.round((input.price / 1.07) * 0.07 * 100) / 100,
          inStock: true,
          availableQuantity: input.stock,
          maxQuantity: Math.min(10, input.stock),
        },
        1,
      );
      setBuyState('added');
      toast.success('เพิ่มลงตะกร้าแล้ว', {
        message: `${input.name} × 1`,
        duration: 2600,
        variant: 'cart',
      });
      resetTimer.current = setTimeout(() => setBuyState('idle'), 1600);
    }, 450);
  }, [canDirectAdd, buyState, addItem, input]);

  return { canDirectAdd, buyState, handleBuy };
}
