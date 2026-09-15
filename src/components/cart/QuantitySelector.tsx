'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface QuantitySelectorProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * 05-components.md §3.5 — Quantity Selector.
 * Horizontal [−] N [+] controls with min/max bounds.
 */
export function QuantitySelector({
  value,
  min = 1,
  max = 100,
  onChange,
  disabled = false,
  className,
}: QuantitySelectorProps): React.JSX.Element {
  const handleDecrement = () => {
    if (value > min) {
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (value < max) {
      onChange(value + 1);
    }
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border border-clay-300 bg-clay-100',
        className,
      )}
      role="group"
      aria-label="จำนวน"
    >
      <button
        type="button"
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        className="flex h-8 w-8 items-center justify-center text-clay-600 transition-colors hover:bg-clay-300 hover:text-clay-900 disabled:cursor-not-allowed disabled:opacity-30"
        aria-label="ลดจำนวน"
      >
        <Minus size={14} strokeWidth={2} />
      </button>
      <span className="flex h-8 min-w-[2rem] items-center justify-center text-sm font-medium text-clay-900">
        {value}
      </span>
      <button
        type="button"
        onClick={handleIncrement}
        disabled={disabled || value >= max}
        className="flex h-8 w-8 items-center justify-center text-clay-600 transition-colors hover:bg-clay-300 hover:text-clay-900 disabled:cursor-not-allowed disabled:opacity-30"
        aria-label="เพิ่มจำนวน"
      >
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
