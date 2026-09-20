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
  // Prices are VAT-inclusive everywhere (server: unitPriceExVat = price / 1.07).
  // The summary must match the server's authoritative total, not add VAT on top.
  const subtotal = items.reduce(
    (sum, i) => Math.round((sum + i.unitPriceThb * i.quantity) * 100) / 100,
    0,
  );
  const vat = Math.round((subtotal - subtotal / 1.07) * 100) / 100;
  const total = subtotal;

  if (collapsed) {
    return (
      <div className={cn('rounded-md border border-line-subtle bg-white p-4', className)}>
        <div className="flex items-center justify-between text-sm">
          <span className="text-fg-muted">{items.length} รายการ</span>
          <span className="font-bold text-fg-brand">{formatThb(total)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-md border border-line-subtle bg-white p-4', className)}>
      <h3 className="mb-3 text-sm font-semibold text-fg-secondary">สรุปคำสั่งซื้อ</h3>

      {/* Items */}
      <div className="mb-3 space-y-2">
        {items.map((item) => (
          <div key={item.variantId} className="flex items-center gap-3">
            {/* Thumbnail */}
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-surface">
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
              <p className="truncate text-xs text-fg">{item.productNameTh}</p>
              <p className="text-xs text-fg-placeholder">× {item.quantity}</p>
            </div>

            {/* Line total */}
            <span className="text-xs font-medium text-fg-secondary">
              {formatThb(item.unitPriceThb * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-line-subtle pt-3">
        <div className="flex items-center justify-between text-xs text-fg-muted">
          <span>ยอดรวม</span>
          <span>{formatThb(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-fg-muted">
          <span>VAT 7% (รวมในราคา)</span>
          <span>{formatThb(vat)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-line-subtle pt-2">
          <span className="text-sm font-bold text-fg">รวมทั้งสิ้น</span>
          <span className="text-lg font-bold text-fg-brand">{formatThb(total)}</span>
        </div>
      </div>
    </div>
  );
}
