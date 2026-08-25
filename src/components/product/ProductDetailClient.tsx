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
      <div className="border-t border-ink-700 pt-4">
        <span className="text-xs text-ink-400">ราคา</span>
        <div className="text-2xl font-bold text-amber-300">
          {selectedVariant ? formatThb(selectedVariant.price) : formatThb(variants[0]?.price ?? 0)}
        </div>
        {selectedVariant && (
          <p className="text-xs text-ink-500">
            รวม VAT 7% = {formatThb(selectedVariant.price)}
          </p>
        )}
      </div>

      {/* Variant Selection */}
      {variants.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink-200">เลือกประเภท</h2>
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
                      ? 'border-amber-500 bg-amber-900/30 shadow-brand-glow'
                      : 'border-ink-600 bg-ink-800 hover:border-amber-700 hover:bg-ink-750',
                  )}
                >
                  {inCart && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-ink-900">
                      {getQuantity(variant.id)}
                    </span>
                  )}
                  <span className="font-medium text-ink-100">{variant.label}</span>
                  <span className="text-xs text-ink-400">{formatThb(variant.price)}</span>
                  {variant.stock <= 10 && variant.stock > 0 && (
                    <span className="text-xs text-amber-400">เหลือ {variant.stock}</span>
                  )}
                  {variant.stock === 0 && (
                    <span className="text-xs text-crimson-400">หมด</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quantity */}
      {selectedVariant && selectedVariant.stock > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink-200">จำนวน</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-ink-600 bg-ink-800 text-ink-200 hover:border-amber-700"
            >
              -
            </button>
            <span className="w-8 text-center font-mono text-lg text-ink-100">{quantity}</span>
            <button
              onClick={() => setQuantity(Math.min(Math.min(10, selectedVariant.stock), quantity + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-ink-600 bg-ink-800 text-ink-200 hover:border-amber-700"
            >
              +
            </button>
            <span className="text-xs text-ink-500">/ {Math.min(10, selectedVariant.stock)}</span>
          </div>
        </div>
      )}

      {/* Add to Cart */}
      <div className="border-t border-ink-700 pt-4">
        <button
          onClick={handleAddToCart}
          disabled={!selectedVariant || selectedVariant.stock === 0 || addedToCart}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-md px-6 py-3 text-base font-semibold transition-all',
            addedToCart
              ? 'bg-jade-500 text-white'
              : selectedVariant && selectedVariant.stock > 0
                ? 'bg-amber-400 text-ink-900 hover:bg-amber-300'
                : 'bg-ink-700 text-ink-400 cursor-not-allowed',
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
          <p className="mt-2 text-center text-xs text-amber-400">
            มี {inCartCount} ชิ้นในตะกร้าแล้ว
          </p>
        )}
      </div>
    </div>
  );
}
