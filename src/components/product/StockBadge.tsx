'use client';

import { cn } from '@/utils/cn';

export interface StockBadgeProps {
  stock: number;
  className?: string;
}

/**
 * 05-components.md §3.3 — Stock Badge.
 * Color-coded: green (high), amber (low), red (out).
 */
export function StockBadge({ stock, className }: StockBadgeProps): React.JSX.Element {
  const isOutOfStock = stock === 0;
  const isLowStock = stock > 0 && stock <= 10;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        isOutOfStock && 'bg-coral-700 text-white',
        // fg (clay-900 light / warm-white dark) is 2.09 on topaz-400 in dark;
        // clay-900 passes on the amber fill in both themes (4.96).
        isLowStock && 'border border-topaz-200 bg-topaz-400 text-clay-900',
        !isOutOfStock && !isLowStock && 'bg-jade-600 text-white',
        className,
      )}
    >
      {isOutOfStock ? 'หมด' : isLowStock ? `เหลือ ${stock}` : 'มีสินค้า'}
    </span>
  );
}
