'use client';

import { cn } from '@/utils/cn';

export type OrderStatus =
  | 'pending_payment'
  | 'payment_confirmed'
  | 'code_delivered'
  | 'completed'
  | 'pending_manual_fulfilment'
  | 'failed'
  | 'failed_final'
  | 'refunded'
  | 'expired'
  | 'abandoned';

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; bgClass: string; textClass: string; borderClass: string }
> = {
  pending_payment: {
    label: 'รอชำระเงิน',
    bgClass: 'bg-ink-800',
    textClass: 'text-ink-200',
    borderClass: 'border-ink-600',
  },
  payment_confirmed: {
    label: 'ยืนยันการชำระแล้ว',
    bgClass: 'bg-sapphire-900/30',
    textClass: 'text-sapphire-200',
    borderClass: 'border-sapphire-700/50',
  },
  code_delivered: {
    label: 'ส่งโค้ดแล้ว',
    bgClass: 'bg-sapphire-900/30',
    textClass: 'text-sapphire-200',
    borderClass: 'border-sapphire-700/50',
  },
  completed: {
    label: 'สำเร็จ',
    bgClass: 'bg-jade-900/30',
    textClass: 'text-jade-200',
    borderClass: 'border-jade-700/50',
  },
  pending_manual_fulfilment: {
    label: 'กำลังดำเนินการ',
    bgClass: 'bg-amber-900/30',
    textClass: 'text-amber-200',
    borderClass: 'border-amber-700/50',
  },
  failed: {
    label: 'ล้มเหลว',
    bgClass: 'bg-crimson-900/30',
    textClass: 'text-crimson-200',
    borderClass: 'border-crimson-700/50',
  },
  failed_final: {
    label: 'ล้มเหลว (สูงสุด)',
    bgClass: 'bg-crimson-900/30',
    textClass: 'text-crimson-200',
    borderClass: 'border-crimson-700/50',
  },
  refunded: {
    label: 'คืนเงินแล้ว',
    bgClass: 'bg-ink-800',
    textClass: 'text-ink-300',
    borderClass: 'border-ink-600',
  },
  expired: {
    label: 'หมดอายุ',
    bgClass: 'bg-ink-800',
    textClass: 'text-ink-400',
    borderClass: 'border-ink-600',
  },
  abandoned: {
    label: 'ยกเลิก',
    bgClass: 'bg-ink-800',
    textClass: 'text-ink-400',
    borderClass: 'border-ink-600',
  },
};

/**
 * 05-components.md §6.3 — Order Status Badge.
 * Color-coded badge for order status display.
 */
export function OrderStatusBadge({
  status,
  className,
}: OrderStatusBadgeProps): React.JSX.Element {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending_payment;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        config.bgClass,
        config.textClass,
        config.borderClass,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
