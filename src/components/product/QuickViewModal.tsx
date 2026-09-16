'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Minus, Plus, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatThb } from '@/utils/format';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useCart } from '@/hooks/useCart';

export interface QuickViewVariant {
  id: string;
  label: string;
  price: number;
  stock: number;
}

export interface QuickViewProduct {
  name: string;
  slug: string;
  imageUrl?: string | null | undefined;
  categoryName: string;
  variants: QuickViewVariant[];
}

type AddState = 'idle' | 'pending' | 'added';

export interface QuickViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: QuickViewProduct;
}

/**
 * Quick view: pick a denomination and quantity without leaving the grid.
 * Clay modal — focus-trapped, Escape/backdrop close, reduced-motion respected.
 * Add-to-cart payload mirrors ProductDetailClient so items merge cleanly.
 */
export function QuickViewModal({
  isOpen,
  onClose,
  product,
}: QuickViewModalProps): React.JSX.Element {
  const { addItem } = useCart();
  const modalRef = useFocusTrap(isOpen);
  const available = product.variants.filter((v) => v.stock > 0);
  const [selectedId, setSelectedId] = useState<string | null>(available[0]?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [addState, setAddState] = useState<AddState>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Reset selection when a different product opens
  useEffect(() => {
    if (isOpen) {
      setSelectedId(product.variants.find((v) => v.stock > 0)?.id ?? null);
      setQuantity(1);
      setAddState('idle');
    }
  }, [isOpen, product.slug, product.variants]);

  // Escape closes + body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Clear pending timers on unmount
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const selected = product.variants.find((v) => v.id === selectedId) ?? null;
  const maxQty = selected ? Math.min(10, selected.stock) : 1;

  const handleAdd = useCallback(() => {
    if (!selected || addState !== 'idle') return;
    setAddState('pending');
    timers.current.push(
      setTimeout(() => {
        addItem(
          {
            id: `cart-${selected.id}-${Date.now()}`,
            variantId: selected.id,
            skuCode: `${product.slug}-${selected.id}`,
            productNameTh: product.name,
            productNameEn: product.name,
            productSlug: product.slug,
            thumbnailUrl: product.imageUrl ?? null,
            denominationThb: selected.price,
            unitPriceThb: selected.price,
            vatAmountThb: Math.round((selected.price / 1.07) * 0.07 * 100) / 100,
            inStock: true,
            availableQuantity: selected.stock,
            maxQuantity: Math.min(10, selected.stock),
          },
          quantity,
        );
        setAddState('added');
        timers.current.push(setTimeout(onClose, 900));
      }, 450),
    );
  }, [selected, addState, addItem, product, quantity, onClose]);

  if (!isOpen) return <></>;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-clay-950/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`เลือกราคา ${product.name}`}
        className="fixed left-1/2 top-1/2 z-[90] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2"
      >
        <div className="clay-card animate-modal-enter rounded-2xl p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="shadow-inset-sm flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-sunken">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl opacity-40">🎮</span>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-fg-brand">{product.categoryName}</p>
                <h2 className="text-sm font-semibold text-fg">{product.name}</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="clay-btn rounded-full p-1.5 text-fg-muted transition-all duration-fast hover:bg-surface-sunken hover:text-fg-secondary active:scale-95"
              aria-label="ปิดหน้าต่างเลือกราคา"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          {/* Variant picker */}
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold text-fg-secondary">เลือกราคา</h3>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((variant) => {
                const isSelected = variant.id === selectedId;
                const isOut = variant.stock === 0;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    disabled={isOut || addState !== 'idle'}
                    onClick={() => {
                      setSelectedId(variant.id);
                      setQuantity(1);
                    }}
                    aria-pressed={isSelected}
                    className={cn(
                      'clay-btn rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-fast ease-ease-out',
                      isSelected
                        ? 'bg-surface-brand text-fg-inverse shadow-clay-brand'
                        : 'bg-surface-elevated text-fg-secondary shadow-clay-xs hover:-translate-y-0.5 hover:text-fg-brand active:scale-95',
                      isOut && 'cursor-not-allowed line-through opacity-45',
                    )}
                  >
                    {variant.label || formatThb(variant.price)}
                    <span className="ml-1.5 opacity-80">{formatThb(variant.price)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantity stepper */}
          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-fg-secondary">จำนวน</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1 || addState !== 'idle'}
                className="clay-btn flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-fg-secondary shadow-clay-xs transition-all hover:text-fg-brand active:scale-90 disabled:opacity-40"
                aria-label="ลดจำนวน"
              >
                <Minus size={14} />
              </button>
              <span className="w-8 text-center text-sm font-bold text-fg" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty || addState !== 'idle'}
                className="clay-btn flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-fg-secondary shadow-clay-xs transition-all hover:text-fg-brand active:scale-90 disabled:opacity-40"
                aria-label="เพิ่มจำนวน"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Total + add button */}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-line-subtle pt-4">
            <div>
              <span className="text-[11px] text-fg-muted">รวม</span>
              <p className="text-lg font-bold text-fg-brand">
                {selected ? formatThb(selected.price * quantity) : '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!selected || addState !== 'idle'}
              className={cn(
                'clay-btn inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-all duration-interactive ease-ease-out',
                addState === 'added'
                  ? 'bg-jade-500 text-white shadow-clay-sm'
                  : 'bg-surface-brand text-fg-inverse shadow-clay-brand hover:scale-[1.03] hover:shadow-clay-lg active:scale-[0.96] active:shadow-clay-press',
                addState === 'pending' && 'cursor-wait opacity-90',
              )}
            >
              {addState === 'pending' ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  กำลังเพิ่ม…
                </>
              ) : addState === 'added' ? (
                <>
                  <Check size={16} strokeWidth={2.5} />
                  เพิ่มแล้ว
                </>
              ) : (
                'ใส่ตะกร้า'
              )}
            </button>
          </div>

          {/* Detail-page link */}
          <Link
            href={`/product/${product.slug}`}
            onClick={onClose}
            className="mt-3 block text-center text-xs font-medium text-fg-muted underline-offset-2 hover:text-fg-brand hover:underline"
          >
            ดูรายละเอียดสินค้าเต็ม →
          </Link>
        </div>
      </div>
    </>
  );
}
