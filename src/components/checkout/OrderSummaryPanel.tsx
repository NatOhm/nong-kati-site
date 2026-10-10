'use client';

import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';
import type { CartItemData } from '@/lib/cart';
import { useEffect, useState } from 'react';
import { calculateVatFromInclusive } from '@/lib/pricing';

export interface OrderSummaryPanelProps {
  items: CartItemData[];
  subtotalThb?: number | undefined;
  discountThb?: number | undefined;
  vatAmountThb?: number | undefined;
  totalAmountThb?: number | undefined;
  vatEnabled?: boolean | undefined;
  vatRate?: number | undefined;
  collapsed?: boolean;
  className?: string;
}

/**
 * 05-components.md §5.8 — Order Summary Panel.
 * Shows itemized list with thumbnails, prices, and totals.
 */
export function OrderSummaryPanel({
  items,
  subtotalThb,
  discountThb = 0,
  vatAmountThb,
  totalAmountThb,
  vatEnabled,
  vatRate,
  collapsed = false,
  className,
}: OrderSummaryPanelProps): React.JSX.Element {
  const [vatConfig, setVatConfig] = useState({ enabled: false, rate: 0 });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/orders/vat')
      .then((r) => (r.ok ? r.json() : null))
      .then((config: { enabled?: boolean; rate?: number } | null) => {
        if (!cancelled && config) {
          setVatConfig({ enabled: config.enabled === true, rate: Number(config.rate) || 0 });
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  // Display prices stay inclusive; VAT is informational and never added again.
  const calculatedSubtotal = items.reduce(
    (sum, i) => Math.round((sum + i.unitPriceThb * i.quantity) * 100) / 100,
    0,
  );
  const subtotal = subtotalThb ?? calculatedSubtotal;
  const configuredVat = vatEnabled ?? vatConfig.enabled;
  const configuredRate = vatRate ?? vatConfig.rate;
  const vat = vatAmountThb ?? calculateVatFromInclusive(subtotal, { enabled: configuredVat, rate: configuredRate });
  const total = totalAmountThb ?? Math.max(0, subtotal - discountThb);

  if (collapsed) {
    return (
      <div className={cn('rounded-md border border-line-subtle bg-surface p-4', className)}>
        <div className="flex items-center justify-between text-sm">
          <span className="text-fg-muted">{items.length} รายการ</span>
          <span className="font-bold text-fg-brand">{formatThb(total)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-md border border-line-subtle bg-surface p-4', className)}>
      <h3 className="mb-3 text-sm font-semibold text-fg-secondary">สรุปคำสั่งซื้อ</h3>

      {/* Items */}
      <div className="mb-3 space-y-2">
        {items.map((item) => (
          <div key={item.variantId} className="flex items-center gap-3">
            {/* Thumbnail */}
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-surface">
              {item.thumbnailUrl ? (
// eslint-disable-next-line @next/next/no-img-element -- admin-upload/data-URL source: served immutable via /api/v1/images or inline QR; next/image optimizer has no remote pattern for these hosts
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
        {discountThb > 0 && (
          <div className="flex items-center justify-between text-xs text-jade-500">
            <span>ส่วนลด</span><span>-{formatThb(discountThb)}</span>
          </div>
        )}
        {configuredVat && (
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span>VAT {(configuredRate * 100).toLocaleString('th-TH')}% (รวมในราคา)</span>
            <span>{formatThb(vat)}</span>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-line-subtle pt-2">
          <span className="text-sm font-bold text-fg">รวมทั้งสิ้น</span>
          <span className="text-lg font-bold text-fg-brand">{formatThb(total)}</span>
        </div>
      </div>
    </div>
  );
}
