'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatThb } from '@/utils/format';
import { useCart } from '@/hooks/useCart';
import { useToast } from '@/hooks/useToast';
import { QuickViewModal, type QuickViewVariant } from './QuickViewModal';
import { StockBadge } from './StockBadge';
import { WishlistButton } from './WishlistButton';

export interface ProductCardProps {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string | null;
  imageUrl?: string | null;
  categoryName: string;
  categorySlug: string;
  price: number;
  stock: number;
  /** First (default) variant id — enables direct add-to-cart from the card. */
  variantId?: string | undefined;
  /** How many variants the product has: >1 opens the quick-view modal. */
  variantCount?: number;
  /** Full variant list for the quick-view modal (multi-variant products). */
  variants?: QuickViewVariant[] | undefined;
  className?: string;
}

type BuyState = 'idle' | 'pending' | 'added';

/**
 * 05-components.md §3.1 — Product Grid Card (clay tile) with buy-from-card.
 * Image + title link to /product/[slug]; the buy button is a sibling (never
 * nested inside the link). Single-variant products add to cart directly with
 * a pending squish state; multi-variant products route to the detail page to
 * pick a denomination. Stock urgency line shows when stock runs low.
 */
export function ProductCard({
  id,
  name,
  slug,
  shortDescription,
  imageUrl,
  categoryName,
  categorySlug,
  price,
  stock,
  variantId,
  variantCount = 1,
  variants,
  className,
}: ProductCardProps): React.JSX.Element {
  const { addItem } = useCart();
  const { toast } = useToast();
  const [buyState, setBuyState] = useState<BuyState>('idle');
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canDirectAdd = Boolean(variantId) && variantCount <= 1 && stock > 0;
  const canQuickView = variantCount > 1 && stock > 0;

  const handleBuy = useCallback(() => {
    if (!canDirectAdd || !variantId || buyState !== 'idle') return;

    setBuyState('pending');
    pendingTimer.current = setTimeout(() => {
      addItem(
        {
          id: `cart-${variantId}-${Date.now()}`,
          variantId,
          skuCode: `${slug}-${variantId}`,
          productNameTh: name,
          productNameEn: name,
          productSlug: slug,
          thumbnailUrl: imageUrl ?? null,
          denominationThb: price,
          unitPriceThb: price,
          vatAmountThb: Math.round((price / 1.07) * 0.07 * 100) / 100,
          inStock: true,
          availableQuantity: stock,
          maxQuantity: Math.min(10, stock),
        },
        1,
      );
      setBuyState('added');
      toast.success('เพิ่มลงตะกร้าแล้ว', {
        message: `${name} × 1`,
        duration: 2600,
        variant: 'cart',
      });
      resetTimer.current = setTimeout(() => setBuyState('idle'), 1600);
    }, 450);
  }, [canDirectAdd, variantId, buyState, addItem, slug, name, imageUrl, price, stock, toast]);

  const buyLabel = buyState === 'added' ? 'เพิ่มแล้ว' : canDirectAdd ? 'ซื้อสินค้า' : 'เลือกราคา';

  return (
    <>
      <div
        className={cn(
          'clay-card group flex flex-col overflow-hidden rounded-xl transition-transform duration-fast ease-out-quart',
          'hover:-translate-y-0.5',
          className,
        )}
      >
        {/* Image + title link to the detail page */}
        <Link
          href={`/product/${slug}`}
          aria-label={`${name} — ${formatThb(price)}`}
          className="block"
        >
          <div className="relative aspect-square overflow-hidden bg-surface">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={name}
                className="h-full w-full object-cover transition-transform duration-moderate ease-out-quart group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-peach-100 to-clay-200">
                <span className="text-4xl opacity-40">🎮</span>
              </div>
            )}
            {/* Stock badge overlay */}
            <div className="absolute right-2 top-2">
              <StockBadge stock={stock} />
            </div>
            {/* Wishlist heart (รายการโปรด) — outside the link so taps
                never navigate */}
            <div className="absolute left-2 top-2">
              <WishlistButton productId={id} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 p-3 pb-0">
            <span className="text-xs font-medium text-fg-brand">{categoryName}</span>
            <h3 className="line-clamp-2 text-sm font-semibold text-fg transition-colors group-hover:text-fg-brand">
              {name}
            </h3>
            {shortDescription && (
              <p className="line-clamp-2 text-xs text-fg-muted">{shortDescription}</p>
            )}
          </div>
        </Link>

        {/* Price pill + stock urgency + buy button — outside the link */}
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="mt-auto flex items-center justify-between gap-2">
            <span className="shadow-inset-sm rounded-full bg-surface-sunken px-3 py-1 text-sm font-bold text-fg-brand">
              {formatThb(price)}
            </span>
            {/* Stock urgency line */}
            <span
              className={cn(
                'text-[11px] font-medium',
                stock === 0
                  ? 'text-fg-muted'
                  : stock <= 5
                    ? 'text-coral-600 dark:text-blush-300'
                    : 'text-fg-muted',
              )}
            >
              {stock === 0 ? 'สินค้าหมด' : stock <= 5 ? `เหลือ ${stock} ใบ` : 'พร้อมส่ง'}
            </span>
          </div>

          {/* Buy button */}
          {stock > 0 ? (
            canDirectAdd ? (
              <button
                type="button"
                onClick={handleBuy}
                disabled={buyState !== 'idle'}
                aria-live="polite"
                className={cn(
                  'clay-btn inline-flex h-10 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition-all duration-interactive ease-ease-out',
                  buyState === 'added'
                    ? 'bg-jade-500 text-white shadow-clay-sm'
                    : 'bg-surface-brand text-fg-inverse shadow-clay-brand hover:scale-[1.03] hover:shadow-clay-lg active:scale-[0.96] active:shadow-clay-press',
                  buyState === 'pending' && 'cursor-wait opacity-90',
                )}
              >
                {buyState === 'pending' ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    กำลังเพิ่ม…
                  </>
                ) : buyState === 'added' ? (
                  <>
                    <Check size={16} strokeWidth={2.5} />
                    เพิ่มแล้ว
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
                    ซื้อสินค้า →
                  </>
                )}
              </button>
            ) : canQuickView ? (
              <button
                type="button"
                onClick={() => setQuickViewOpen(true)}
                aria-haspopup="dialog"
                className="clay-btn inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-surface-brand text-sm font-semibold text-fg-inverse shadow-clay-brand transition-all duration-interactive ease-ease-out hover:scale-[1.03] hover:shadow-clay-lg active:scale-[0.96] active:shadow-clay-press"
              >
                เลือกราคา →
              </button>
            ) : (
              <Link
                href={`/product/${slug}`}
                className="clay-btn inline-flex h-10 w-full items-center justify-center rounded-full bg-surface-brand text-sm font-semibold text-fg-inverse shadow-clay-brand transition-all duration-interactive ease-ease-out hover:scale-[1.03] hover:shadow-clay-lg active:scale-[0.96] active:shadow-clay-press"
              >
                เลือกราคา →
              </Link>
            )
          ) : (
            <Link
              href={`/product/${slug}`}
              className="clay-btn inline-flex h-10 w-full items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold text-fg-muted shadow-none"
            >
              ดูสินค้า
            </Link>
          )}
        </div>
      </div>

      {/* Quick view modal (multi-variant) */}
      <QuickViewModal
        isOpen={quickViewOpen}
        onClose={() => setQuickViewOpen(false)}
        product={{
          name,
          slug,
          imageUrl,
          categoryName,
          variants: variants ?? (variantId ? [{ id: variantId, label: '', price, stock }] : []),
        }}
      />
    </>
  );
}
