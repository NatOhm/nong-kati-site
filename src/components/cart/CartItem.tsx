'use client';

import { Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';
import { QuantitySelector } from './QuantitySelector';

export interface CartItemProps {
  item: {
    id: string;
    variantId: string;
    productNameTh: string;
    denominationThb: number;
    thumbnailUrl: string | null;
    unitPriceThb: number;
    quantity: number;
    inStock: boolean;
    maxQuantity: number;
  };
  onUpdateQty: (qty: number) => void;
  onRemove: () => void;
}

/**
 * 05-components.md §4.3 — Cart Item.
 * Shows thumbnail, name, price, quantity controls, and remove button.
 */
export function CartItem({ item, onUpdateQty, onRemove }: CartItemProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-md border p-3 transition-colors',
        item.inStock
          ? 'border-ink-700 bg-ink-850'
          : 'border-crimson-700/50 bg-crimson-900/10',
      )}
    >
      {/* Thumbnail */}
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-ink-800">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.productNameTh}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg opacity-30">
            🎮
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-100">
              {item.productNameTh}
            </p>
            <p className="text-xs text-ink-400">
              {formatThb(item.unitPriceThb)}
            </p>
          </div>
          <button
            onClick={onRemove}
            className="shrink-0 rounded p-1 text-ink-400 transition-colors hover:bg-ink-800 hover:text-crimson-400"
            aria-label={`ลบ ${item.productNameTh}`}
          >
            <Trash2 size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Out of stock warning */}
        {!item.inStock && (
          <div className="mt-1 flex items-center gap-1 text-xs text-crimson-400">
            <AlertTriangle size={12} />
            <span>สินค้าหมดแล้ว</span>
          </div>
        )}

        {/* Quantity + Line total */}
        <div className="mt-2 flex items-center justify-between">
          <QuantitySelector
            value={item.quantity}
            min={1}
            max={item.maxQuantity}
            onChange={onUpdateQty}
            disabled={!item.inStock}
          />
          <span className="text-sm font-semibold text-amber-300">
            {formatThb(item.unitPriceThb * item.quantity)}
          </span>
        </div>
      </div>
    </div>
  );
}
