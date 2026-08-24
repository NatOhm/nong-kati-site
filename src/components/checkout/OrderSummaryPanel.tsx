'use client';

import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';
import type { CartItemData } from '@/lib/cart';

export interface OrderSummaryPanelProps {
  items: CartItemData[];
  collapsed?: boolean;
  className?: string;
}

/**
 * 05-components.md §5.8 — Order Summary Panel.
 * Shows itemized list with thumbnails, prices, and totals.
 */
export function OrderSummaryPanel({
  items,
  collapsed = false,
  className,
}: OrderSummaryPanelProps): React.JSX.Element {
  const subtotal = items.reduce(
    (sum, i) => Math.round((sum + i.unitPriceThb * i.quantity) * 100) / 100,
    0,
  );
  const vat = Math.round(subtotal * 0.07 * 100) / 100;
  const total = Math.round((subtotal + vat) * 100) / 100;

  if (collapsed) {
    return (
      <div className={cn('rounded-md border border-ink-700 bg-ink-850 p-4', className)}>
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-300">
            {items.length} รายการ
          </span>
          <span className="font-bold text-amber-300">{formatThb(total)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-md border border-ink-700 bg-ink-850 p-4', className)}>
      <h3 className="mb-3 text-sm font-semibold text-ink-200">สรุปคำสั่งซื้อ</h3>

      {/* Items */}
      <div className="mb-3 space-y-2">
        {items.map((item) => (
          <div key={item.variantId} className="flex items-center gap-3">
            {/* Thumbnail */}
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-ink-800">
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt={item.productNameTh}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm opacity-30">
                  🎮
                </div>
              )}
            </div>

            {/* Name + quantity */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-ink-100">{item.productNameTh}</p>
              <p className="text-xs text-ink-400">× {item.quantity}</p>
            </div>

            {/* Line total */}
            <span className="text-xs font-medium text-ink-200">
              {formatThb(item.unitPriceThb * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-ink-700 pt-3">
        <div className="flex items-center justify-between text-xs text-ink-300">
          <span>ยอดรวม</span>
          <span>{formatThb(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-ink-300">
          <span>VAT 7%</span>
          <span>{formatThb(vat)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-ink-700 pt-2">
          <span className="text-sm font-bold text-ink-100">รวมทั้งสิ้น</span>
          <span className="text-lg font-bold text-amber-300">{formatThb(total)}</span>
        </div>
      </div>
    </div>
  );
}
