'use client';

import { Mail } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';
import { CodeBlock } from './CodeBlock';
import { OrderStatusBadge, type OrderStatus } from './OrderStatusBadge';

export interface OrderDetailCardProps {
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    createdAt: string;
    items: Array<{
      productNameTh: string;
      skuCode: string;
      denominationThb: number;
      quantity: number;
      lineTotalThb: number;
    }>;
    codes: Array<{
      code: string;
      productName: string;
      denomination: number;
    }>;
    subtotalThb: number;
    vatAmountThb: number;
    totalAmountThb: number;
    customerEmail: string;
  };
  onResend?: () => void;
  resendLoading?: boolean;
  className?: string;
}

/**
 * 05-components.md §6.6 — Order Detail Card.
 * Full order detail with codes, status, items, and resend button.
 */
export function OrderDetailCard({
  order,
  onResend,
  resendLoading = false,
  className,
}: OrderDetailCardProps): React.JSX.Element {
  const isCompleted = order.status === 'completed';

  return (
    <div className={cn('rounded-md border border-line-subtle bg-surface p-6', className)}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-fg-placeholder">หมายเลขคำสั่งซื้อ</p>
          <p className="font-mono text-lg font-bold text-fg-brand">{order.orderNumber}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {/* Items */}
      <div className="mb-4 space-y-2">
        {order.items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-md border border-line-subtle bg-surface px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium text-fg">{item.productNameTh}</p>
              <p className="text-xs text-fg-placeholder">
                {item.skuCode} × {item.quantity}
              </p>
            </div>
            <span className="text-sm font-medium text-fg-secondary">
              {formatThb(item.lineTotalThb)}
            </span>
          </div>
        ))}
      </div>

      {/* Codes (if delivered) */}
      {isCompleted && order.codes.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-fg-secondary">โค้ดของคุณ</h3>
          <div className="space-y-2">
            {order.codes.map((code, idx) => (
              <CodeBlock
                key={idx}
                code={code.code}
                productName={code.productName}
                denomination={code.denomination}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pending manual fulfilment message */}
      {order.status === 'pending_manual_fulfilment' && (
        <div className="mb-4 rounded-md border border-line-brand bg-peach-50 px-4 py-3 text-sm text-peach-800">
          การชำระเงินสำเร็จ โค้ดจะถูกส่งภายใน 2 ชั่วโมง
        </div>
      )}

      {/* Summary */}
      <div className="border-t border-line-subtle pt-4">
        <div className="flex items-center justify-between text-sm text-fg-muted">
          <span>ยอดรวม</span>
          <span>{formatThb(order.subtotalThb)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-fg-muted">
          <span>VAT 7%</span>
          <span>{formatThb(order.vatAmountThb)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-line-subtle pt-2">
          <span className="font-bold text-fg">รวมทั้งสิ้น</span>
          <span className="text-lg font-bold text-fg-brand">{formatThb(order.totalAmountThb)}</span>
        </div>
      </div>

      {/* Email + Resend */}
      <div className="mt-4 flex items-center justify-between border-t border-line-subtle pt-4">
        <div className="flex items-center gap-2 text-sm text-fg-placeholder">
          <Mail size={14} />
          <span>{order.customerEmail}</span>
        </div>
        {onResend && (
          <button
            onClick={onResend}
            disabled={resendLoading}
            className="text-sm text-fg-brand hover:text-fg-brand disabled:opacity-50"
          >
            {resendLoading ? 'กำลังส่ง...' : 'ส่งอีเมลใหม่'}
          </button>
        )}
      </div>

      {/* Created at */}
      <p className="mt-2 text-xs text-fg-placeholder">
        สั่งซื้อเมื่อ: {new Date(order.createdAt).toLocaleString('th-TH')}
      </p>
    </div>
  );
}
