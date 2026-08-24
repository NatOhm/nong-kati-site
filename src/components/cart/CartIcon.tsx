'use client';

import { ShoppingCart } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface CartIconProps {
  count: number;
  onClick?: () => void;
  className?: string;
}

/**
 * 05-components.md §4.1 — Cart Icon with badge.
 * Badge hidden when count === 0.
 */
export function CartIcon({ count, onClick, className }: CartIconProps): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center justify-center rounded-md p-2 text-ink-200 transition-colors hover:bg-ink-800 hover:text-amber-300',
        className,
      )}
      aria-label={`ตะกร้าสินค้า (${count} รายการ)`}
    >
      <ShoppingCart size={20} strokeWidth={1.5} />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-ink-900">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
