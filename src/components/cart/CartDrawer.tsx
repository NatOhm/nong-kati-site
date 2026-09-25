'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, ShoppingCart } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { CartItem } from './CartItem';
import { CartSummary } from './CartSummary';
import { EmptyCart } from './EmptyCart';
import type { CartItemData } from '@/lib/cart';

export interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItemData[];
  onUpdateQty: (variantId: string, qty: number) => void;
  onRemoveItem: (variantId: string) => void;
}

/**
 * 05-components.md §4.2 — Cart Drawer.
 * Slides in from right. Focus trapped. Escape closes.
 */
export function CartDrawer({
  isOpen,
  onClose,
  items,
  onUpdateQty,
  onRemoveItem,
}: CartDrawerProps): React.JSX.Element {
  // Focus trap — returns ref to attach to the drawer
  const drawerRef = useFocusTrap(isOpen);

  // Fade-out: keep mounted through the 250ms exit, then unmount for real.
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (isOpen) setClosing(false);
  }, [isOpen]);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 250);
  };

  // Close on Escape + lock body scroll
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, requestClose]);

  if (!isOpen) return <></>;

  const hasOutOfStock = items.some((i) => !i.inStock);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-[80] bg-clay-950/50 backdrop-blur-sm',
          closing ? 'animate-toast-exit' : 'drawer-fade-in-once',
        )}
        onClick={requestClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="ตะกร้าสินค้า"
        className={cn(
          // shadow-clay-lg = the one allowed modal-level elevation (design-system.md §4)
          'fixed right-0 top-0 z-[90] flex h-full w-full max-w-[400px] flex-col border-l border-line-subtle bg-surface-base shadow-clay-lg',
          closing ? 'animate-cart-exit' : 'animate-cart-enter',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <ShoppingCart size={20} strokeWidth={1.5} />
            ตะกร้าสินค้า ({items.length})
          </h2>
          <button
            onClick={requestClose}
            className="rounded p-1 text-fg-placeholder transition-colors hover:bg-surface hover:text-fg-secondary"
            aria-label="ปิดตะกร้า"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <EmptyCart />
          ) : (
            <div className="space-y-3">
              {/* Out of stock warning */}
              {hasOutOfStock && (
                <div className="rounded-md border border-crimson-700/50 bg-crimson-900/20 px-3 py-2 text-xs text-coral-700">
                  ⚠ มีสินค้าบางรายการหมดแล้ว — กรุณาลบออกก่อนดำเนินการชำระเงิน
                </div>
              )}

              {items.map((item) => (
                <CartItem
                  key={item.variantId}
                  item={item}
                  onUpdateQty={(qty) => onUpdateQty(item.variantId, qty)}
                  onRemove={() => onRemoveItem(item.variantId)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer — Summary + Checkout */}
        {items.length > 0 && (
          <div className="border-t border-line-subtle p-4">
            <CartSummary
              subtotal={items.reduce(
                (sum, i) => Math.round((sum + i.unitPriceThb * i.quantity) * 100) / 100,
                0,
              )}
              vat={items.reduce(
                (sum, i) =>
                  Math.round(
                    (sum + Math.round(i.unitPriceThb * i.quantity * 0.07 * 100) / 100) * 100,
                  ) / 100,
                0,
              )}
              total={
                items.reduce(
                  (sum, i) => Math.round((sum + i.unitPriceThb * i.quantity) * 100) / 100,
                  0,
                ) +
                items.reduce(
                  (sum, i) =>
                    Math.round(
                      (sum + Math.round(i.unitPriceThb * i.quantity * 0.07 * 100) / 100) * 100,
                    ) / 100,
                  0,
                )
              }
            />

            <div className="mt-4 space-y-2">
              <Link
                href="/checkout"
                onClick={requestClose}
                className={cn(
                  'flex w-full items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold transition-colors',
                  hasOutOfStock
                    ? 'cursor-not-allowed bg-clay-300 text-fg-placeholder'
                    : 'bg-peach-500 text-white shadow-clay-sm hover:bg-peach-400',
                )}
                aria-disabled={hasOutOfStock}
                tabIndex={hasOutOfStock ? -1 : 0}
              >
                ดำเนินการชำระเงิน
              </Link>
              <button
                onClick={onClose}
                className="w-full text-center text-sm text-fg-placeholder hover:text-fg-brand"
              >
                ช้อปปิ้งต่อ
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
