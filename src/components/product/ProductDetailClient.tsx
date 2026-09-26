'use client';

import { useState } from 'react';
import { ShoppingCart, Check } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { formatThb } from '@/utils/format';
import { cn } from '@/utils/cn';
import { StockBadge } from './StockBadge';

interface Variant {
  id: string;
  label: string;
  price: number;
  /** Tier-resolved price (server) — what this customer actually pays. */
  effectivePrice: number;
  stock: number;
  isActive: boolean;
  sortOrder: number;
}

interface ProductDetailClientProps {
  productId: string;
  productName: string;
  productSlug: string;
  categorySlug: string;
  categoryName: string;
  thumbnailUrl: string | null;
  variants: Variant[];
}

/**
 * Numbered-circle step header (reference layout, img 2): peach circle with
 * the step number, bold title beside it.
 */
function StepHeader({ n, title }: { n: number; title: string }): React.JSX.Element {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-peach-500 text-sm font-bold text-white shadow-clay-sm">
        {n}
      </span>
      <h2 className="text-base font-bold text-fg">{title}</h2>
    </div>
  );
}

/**
 * Client component for product detail page — reference buy flow (img 2):
 * ① เลือกแพ็กเกจ (package card grid, selected highlighted) ② จำนวน + add to
 * cart. Handles variant selection, add to cart, and cart state.
 */
export function ProductDetailClient({
  productId,
  productName,
  productSlug,
  categorySlug,
  categoryName,
  thumbnailUrl,
  variants,
}: ProductDetailClientProps): React.JSX.Element {
  const { addItem, isInCart, getQuantity } = useCart();
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(
    variants.find((v) => v.stock > 0) ?? null,
  );
  const [addedToCart, setAddedToCart] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const handleAddToCart = () => {
    if (!selectedVariant || selectedVariant.stock === 0) return;

    addItem(
      {
        id: `cart-${selectedVariant.id}-${Date.now()}`,
        variantId: selectedVariant.id,
        skuCode: `${productSlug}-${selectedVariant.id}`,
        productNameTh: productName,
        productNameEn: productName,
        productSlug,
        thumbnailUrl,
        denominationThb: selectedVariant.effectivePrice,
        unitPriceThb: selectedVariant.effectivePrice,
        vatAmountThb: Math.round((selectedVariant.effectivePrice / 1.07) * 0.07 * 100) / 100,
        inStock: true,
        availableQuantity: selectedVariant.stock,
        maxQuantity: Math.min(10, selectedVariant.stock),
      },
      quantity,
    );

    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);
  const inCartCount = selectedVariant ? getQuantity(selectedVariant.id) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Category + stock */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/category/${categorySlug}`}
          className="text-sm font-semibold text-fg-brand hover:underline"
        >
          {categoryName}
        </a>
        <StockBadge stock={totalStock} />
      </div>

      {/* Price — the selected package's tier-resolved price */}
      <div className="border-b border-line-subtle pb-4">
        <span className="text-xs text-fg-placeholder">ราคา</span>
        <div className="text-3xl font-bold text-fg-brand">
          {selectedVariant
            ? formatThb(selectedVariant.effectivePrice)
            : formatThb(variants[0]?.effectivePrice ?? 0)}
        </div>
        {selectedVariant && (
          <p className="text-xs text-fg-placeholder">
            รวม VAT 7% = {formatThb(selectedVariant.effectivePrice)}
          </p>
        )}
      </div>

      {/* Step 1 — package card grid (img 2 "Select Package") */}
      <section>
        <StepHeader n={1} title="เลือกแพ็กเกจ" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {variants.map((variant) => {
            const isSelected = selectedVariant?.id === variant.id;
            const inCart = isInCart(variant.id);
            return (
              <button
                key={variant.id}
                onClick={() => setSelectedVariant(variant)}
                disabled={variant.stock === 0}
                aria-pressed={isSelected}
                className={cn(
                  'transition-smart relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left duration-fast ease-ease-out',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  isSelected
                    ? 'border-peach-500 bg-peach-100 shadow-brand-glow active:scale-[0.98]'
                    : 'border-line bg-surface hover:border-peach-400 hover:shadow-clay-sm active:scale-[0.98]',
                )}
              >
                {inCart && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-peach-500 text-[10px] font-bold text-white shadow-clay-sm">
                    {getQuantity(variant.id)}
                  </span>
                )}
                {/* 'default' is an internal single-variant label — show a friendly name.
                    Selected cards keep the light peach surface in BOTH themes,
                    so their text stays dark for contrast. */}
                <span
                  className={cn(
                    'line-clamp-1 text-sm font-semibold',
                    isSelected ? 'text-clay-900' : 'text-fg',
                  )}
                >
                  {variant.label !== 'default' ? variant.label : 'แพ็กเกจมาตรฐาน'}
                </span>
                <span
                  className={cn(
                    'text-sm font-bold',
                    isSelected ? 'text-peach-800' : 'text-fg-brand',
                  )}
                >
                  {formatThb(variant.effectivePrice)}
                </span>
                {variant.stock === 0 ? (
                  <span className="text-xs text-fg-error">หมด</span>
                ) : variant.stock <= 10 ? (
                  <span
                    className={cn(
                      'text-xs font-medium',
                      isSelected ? 'text-peach-800' : 'text-fg-brand',
                    )}
                  >
                    เหลือ {variant.stock}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 2 — quantity + add to cart */}
      {selectedVariant && selectedVariant.stock > 0 && (
        <section>
          <StepHeader n={2} title="จำนวน" />
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              aria-label="ลดจำนวน"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-lg text-fg-secondary transition-colors hover:border-peach-400 hover:text-fg active:scale-90"
            >
              −
            </button>
            <span className="w-8 text-center font-mono text-lg font-semibold text-fg">
              {quantity}
            </span>
            <button
              onClick={() =>
                setQuantity(Math.min(Math.min(10, selectedVariant.stock), quantity + 1))
              }
              aria-label="เพิ่มจำนวน"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-lg text-fg-secondary transition-colors hover:border-peach-400 hover:text-fg active:scale-90"
            >
              +
            </button>
            <span className="text-xs text-fg-placeholder">
              / {Math.min(10, selectedVariant.stock)}
            </span>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={!selectedVariant || selectedVariant.stock === 0 || addedToCart}
            className={cn(
              'transition-smart flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-semibold duration-interactive ease-ease-out',
              addedToCart
                ? 'bg-jade-500 text-white shadow-clay-sm'
                : 'bg-peach-500 text-white shadow-clay-brand hover:scale-[1.01] hover:bg-peach-400 hover:shadow-clay-lg active:scale-[0.97] active:shadow-clay-press',
            )}
          >
            {addedToCart ? (
              <>
                <Check size={18} strokeWidth={2.5} />
                เพิ่มลงตะกร้าแล้ว!
              </>
            ) : (
              <>
                <ShoppingCart size={18} />
                เพิ่มลงตะกร้า
              </>
            )}
          </button>
          {inCartCount > 0 && !addedToCart && (
            <p className="mt-2 text-center text-xs text-fg-brand">
              มี {inCartCount} ชิ้นในตะกร้าแล้ว
            </p>
          )}
        </section>
      )}
    </div>
  );
}
