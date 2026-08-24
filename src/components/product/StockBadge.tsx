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
        isOutOfStock && 'bg-crimson-900/80 text-crimson-200 border border-crimson-700/50',
        isLowStock && 'bg-amber-900/80 text-amber-200 border border-amber-700/50',
        !isOutOfStock && !isLowStock && 'bg-jade-900/80 text-jade-200 border border-jade-700/50',
        className,
      )}
    >
      {isOutOfStock ? (
        'หมด'
      ) : isLowStock ? (
        `เหลือ ${stock}`
      ) : (
        'มีสินค้า'
      )}
    </span>
  );
}
