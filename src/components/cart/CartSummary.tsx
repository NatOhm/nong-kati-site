'use client';

import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';

export interface CartSummaryProps {
  subtotal: number;
  vat: number;
  total: number;
  discount?: number;
  className?: string;
}

/**
 * 05-components.md §4.4 — Cart Summary.
 * Shows subtotal, VAT, and total. All amounts are display-only (server recalculates at checkout).
 */
export function CartSummary({
  subtotal,
  vat,
  total,
  discount = 0,
  className,
}: CartSummaryProps): React.JSX.Element {
  return (
    <div className={cn('space-y-2 text-sm', className)}>
      <div className="flex items-center justify-between text-ink-300">
        <span>ยอดรวม (ไม่รวม VAT)</span>
        <span>{formatThb(subtotal)}</span>
      </div>

      {discount > 0 && (
        <div className="flex items-center justify-between text-jade-400">
          <span>ส่วนลด</span>
          <span>-{formatThb(discount)}</span>
        </div>
      )}

      <div className="flex items-center justify-between text-ink-300">
        <span>VAT 7%</span>
        <span>{formatThb(vat)}</span>
      </div>

      <div className="border-t border-ink-700 pt-2">
        <div className="flex items-center justify-between text-lg font-bold text-amber-300">
          <span>รวมทั้งสิ้น</span>
          <span>{formatThb(total)}</span>
        </div>
      </div>
    </div>
  );
}
