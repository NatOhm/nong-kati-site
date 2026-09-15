'use client';

import { cn } from '@/utils/cn';
import { formatThb } from '@/utils/format';

export interface Denomination {
  id: string;
  label: string;
  price: number;
  stock: number;
}

export interface DenominationSelectorProps {
  denominations: Denomination[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * 05-components.md §3.4 — Denomination/Variant Selector.
 * Horizontal pill group for selecting product tiers (e.g. 100, 300, 500 THB).
 */
export function DenominationSelector({
  denominations,
  selectedId,
  onSelect,
  disabled = false,
  className,
}: DenominationSelectorProps): React.JSX.Element {
  return (
    <div
      className={cn('flex flex-wrap gap-2', className)}
      role="radiogroup"
      aria-label="เลือกประเภทสินค้า"
    >
      {denominations.map((denom) => {
        const isSelected = denom.id === selectedId;
        const isAvailable = denom.stock > 0;

        return (
          <button
            key={denom.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-disabled={!isAvailable || disabled}
            disabled={!isAvailable || disabled}
            onClick={() => onSelect?.(denom.id)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-md border px-4 py-2 text-sm transition-all duration-fast ease-out-quart',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-peach-500 focus-visible:ring-offset-2 focus-visible:ring-offset-clay-50',
              isSelected
                ? 'border-peach-500 bg-peach-100 text-peach-800 shadow-brand-glow'
                : 'border-line bg-surface text-fg-secondary hover:border-line-brand hover:bg-clay-200',
              (!isAvailable || disabled) && 'cursor-not-allowed opacity-40',
            )}
          >
            <span className="font-medium">{denom.label}</span>
            <span className="text-xs text-fg-placeholder">{formatThb(denom.price)}</span>
          </button>
        );
      })}
    </div>
  );
}
