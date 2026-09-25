'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';

import { cn } from '@/utils/cn';
import { formatThb } from '@/utils/format';
import { useCardBuy } from '@/hooks/useCardBuy';
import { QuickViewModal, type QuickViewVariant } from './QuickViewModal';
import { StockBadge } from './StockBadge';
import { WishlistButton } from './WishlistButton';

export interface SearchProductCardProps {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  price: number;
  stock: number;
  /** First (default) variant id — enables direct add-to-cart from the tile. */
  variantId?: string | undefined;
  /** >1 opens the quick-view modal instead of direct add. */
  variantCount?: number;
  /** Full variant list for the quick-view modal. */
  variants?: QuickViewVariant[] | undefined;
  className?: string;
}

/**
 * Search-results tile modeled on the client's reference grid (img 2):
 * full-bleed square artwork, wishlist heart top-right, name, price, and a
 * full-width outlined pill button. Denser and quieter than the catalog
 * ProductCard — no category label, no description, no solid clay button.
 * Shares the buy state machine via useCardBuy.
 */
export function SearchProductCard({
  id,
  name,
  slug,
  imageUrl,
  price,
  stock,
  variantId,
  variantCount = 1,
  variants,
  className,
}: SearchProductCardProps): React.JSX.Element {
  const { canDirectAdd, buyState, handleBuy } = useCardBuy({
    variantId,
    variantCount,
    name,
    slug,
    imageUrl,
    price,
    stock,
  });
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const canQuickView = variantCount > 1 && stock > 0;

  const actionLabel =
    buyState === 'added' ? 'เพิ่มแล้ว' : canDirectAdd ? 'ซื้อสินค้า' : 'เลือกราคา';

  const outlinedBtn = cn(
    'inline-flex h-9 w-full items-center justify-center gap-2 rounded-full border text-sm font-semibold transition-smart duration-interactive ease-ease-out',
    'border-line-strong bg-transparent text-fg-secondary',
    'hover:border-peach-400 hover:bg-peach-100 hover:text-peach-900',
    'active:scale-[0.96]',
  );

  return (
    <>
      <div
        className={cn(
          'clay-card group flex flex-col overflow-hidden rounded-xl transition-transform duration-fast ease-out-quart hover:-translate-y-0.5',
          className,
        )}
      >
        {/* Full-bleed square artwork; title links to the detail page */}
        <Link
          href={`/product/${slug}`}
          aria-label={`${name} — ${formatThb(price)}`}
          className="relative block aspect-square overflow-hidden bg-surface-sunken"
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              className="h-full w-full object-cover transition-transform duration-moderate ease-out-quart group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-4xl opacity-30">🎮</span>
            </div>
          )}
          {/* Stock badge left, wishlist heart right — reference layout */}
          <div className="absolute left-2 top-2">
            <StockBadge stock={stock} />
          </div>
          <div className="absolute right-2 top-2" onClick={(e) => e.preventDefault()}>
            <WishlistButton productId={id} />
          </div>
        </Link>

        {/* Name + price + outlined action */}
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <Link
            href={`/product/${slug}`}
            className="line-clamp-2 text-sm font-semibold text-fg transition-colors hover:text-fg-brand"
          >
            {name}
          </Link>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-bold text-fg-brand">{formatThb(price)}</span>
            <span
              className={cn(
                'text-[11px] font-medium',
                stock === 0
                  ? 'text-fg-muted'
                  : stock <= 5
                    ? 'text-coral-600 dark:text-coral-200'
                    : 'text-fg-muted',
              )}
            >
              {stock === 0 ? 'สินค้าหมด' : stock <= 5 ? `เหลือ ${stock} ใบ` : 'พร้อมส่ง'}
            </span>
          </div>

          <div className="mt-auto pt-1.5">
            {stock > 0 ? (
              canDirectAdd ? (
                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={buyState !== 'idle'}
                  aria-live="polite"
                  className={cn(outlinedBtn, buyState !== 'idle' && 'cursor-wait opacity-90')}
                >
                  {buyState === 'pending' ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-peach-400/40 border-t-peach-400" />
                      กำลังเพิ่ม…
                    </>
                  ) : buyState === 'added' ? (
                    <>
                      <Check size={15} strokeWidth={2.5} className="text-jade-500" />
                      เพิ่มแล้ว
                    </>
                  ) : (
                    actionLabel
                  )}
                </button>
              ) : canQuickView ? (
                <button
                  type="button"
                  onClick={() => setQuickViewOpen(true)}
                  aria-haspopup="dialog"
                  className={outlinedBtn}
                >
                  เลือกราคา
                </button>
              ) : (
                <Link href={`/product/${slug}`} className={outlinedBtn}>
                  เลือกราคา
                </Link>
              )
            ) : (
              <Link href={`/product/${slug}`} className={cn(outlinedBtn, 'opacity-60')}>
                ดูสินค้า
              </Link>
            )}
          </div>
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
          categoryName: '',
          variants:
            variants ??
            (variantId ? [{ id: variantId, label: '', price, effectivePrice: price, stock }] : []),
        }}
      />
    </>
  );
}
