'use client';

import { useState } from 'react';
import { ShoppingCart, Check } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { formatThb } from '@/utils/format';
import { cn } from '@/utils/cn';

interface Variant {
  id: string;
  label: string;
  price: number;
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
 * Client component for product detail page.
 * Handles variant selection, add to cart, and cart state.
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
  const { addItem, isInCart, getQuantity, itemCount } = useCart();
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
        denominationThb: selectedVariant.price,
        unitPriceThb: selectedVariant.price,
        vatAmountThb: Math.round((selectedVariant.price / 1.07) * 0.07 * 100) / 100,
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
      {/* Price */}
      <div className="border-t border-line-subtle pt-4">
        <span className="text-xs text-fg-placeholder">ราคา</span>
        <div className="text-2xl font-bold text-fg-brand">
          {selectedVariant ? formatThb(selectedVariant.price) : formatThb(variants[0]?.price ?? 0)}
        </div>
        {selectedVariant && (
          <p className="text-clay-9000 text-xs">รวม VAT 7% = {formatThb(selectedVariant.price)}</p>
        )}
      </div>

      {/* Variant Selection */}
      {variants.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-fg-secondary">เลือกประเภท</h2>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => {
              const isSelected = selectedVariant?.id === variant.id;
              const inCart = isInCart(variant.id);
              return (
                <button
                  key={variant.id}
                  onClick={() => setSelectedVariant(variant)}
                  disabled={variant.stock === 0}
                  className={cn(
                    'relative flex flex-col items-center gap-1 rounded-md border px-4 py-2 text-sm transition-all',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                    isSelected
                      ? 'border-peach-500 bg-peach-100 shadow-brand-glow'
                      : 'border-line bg-surface hover:border-line-brand hover:bg-clay-200',
                  )}
                >
                  {inCart && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-peach-500 text-[9px] font-bold text-white">
                      {getQuantity(variant.id)}
                    </span>
                  )}
                  {/* 'default' is an internal single-variant label — show only the price */}
                  {variant.label !== 'default' && (
                    <span className="font-medium text-fg">{variant.label}</span>
                  )}
                  <span className="text-xs text-fg-placeholder">{formatThb(variant.price)}</span>
                  {variant.stock <= 10 && variant.stock > 0 && (
                    <span className="text-xs text-fg-brand">เหลือ {variant.stock}</span>
                  )}
                  {variant.stock === 0 && <span className="text-xs text-coral-600">หมด</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quantity */}
      {selectedVariant && selectedVariant.stock > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-fg-secondary">จำนวน</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-fg-secondary hover:border-line-brand"
            >
              -
            </button>
            <span className="w-8 text-center font-mono text-lg text-fg">{quantity}</span>
            <button
              onClick={() =>
                setQuantity(Math.min(Math.min(10, selectedVariant.stock), quantity + 1))
              }
              className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-fg-secondary hover:border-line-brand"
            >
              +
            </button>
            <span className="text-clay-9000 text-xs">/ {Math.min(10, selectedVariant.stock)}</span>
          </div>
        </div>
      )}

      {/* Add to Cart */}
      <div className="border-t border-line-subtle pt-4">
        <button
          onClick={handleAddToCart}
          disabled={!selectedVariant || selectedVariant.stock === 0 || addedToCart}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-md px-6 py-3 text-base font-semibold transition-all',
            addedToCart
              ? 'bg-jade-500 text-white'
              : selectedVariant && selectedVariant.stock > 0
                ? 'bg-peach-500 text-white shadow-clay-sm hover:bg-peach-400'
                : 'cursor-not-allowed bg-clay-300 text-fg-placeholder',
          )}
        >
          {addedToCart ? (
            <>
              <Check size={18} />
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
      </div>
    </div>
  );
}
