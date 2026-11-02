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
    bgClass: 'bg-surface',
    textClass: 'text-fg-secondary',
    borderClass: 'border-line',
  },
  // Tint + text pairs below are theme-aware: a dark-only fill (sapphire-900/30,
  // jade-900/20) with a light-only text step reads as two pale colours on the
  // light theme. Each pair keeps the dark look and flips for light.
  payment_confirmed: {
    label: 'ยืนยันการชำระแล้ว',
    bgClass: 'bg-sapphire-400/15 dark:bg-sapphire-900/30',
    textClass: 'text-sapphire-700 dark:text-sapphire-200',
    borderClass: 'border-sapphire-700/40',
  },
  code_delivered: {
    label: 'ส่งโค้ดแล้ว',
    bgClass: 'bg-sapphire-400/15 dark:bg-sapphire-900/30',
    textClass: 'text-sapphire-700 dark:text-sapphire-200',
    borderClass: 'border-sapphire-700/40',
  },
  completed: {
    label: 'สำเร็จ',
    bgClass: 'bg-jade-500/15',
    textClass: 'text-jade-700 dark:text-jade-200',
    borderClass: 'border-jade-500/40',
  },
  pending_manual_fulfilment: {
    label: 'กำลังดำเนินการ',
    bgClass: 'bg-surface-brand-subtle',
    textClass: 'text-fg-brand',
    borderClass: 'border-line-brand',
  },
  failed: {
    label: 'ล้มเหลว',
    bgClass: 'bg-coral-50 dark:bg-coral-900/40',
    textClass: 'text-fg-error',
    borderClass: 'border-coral-300 dark:border-coral-700',
  },
  failed_final: {
    label: 'ล้มเหลว (สูงสุด)',
    bgClass: 'bg-coral-50 dark:bg-coral-900/40',
    textClass: 'text-fg-error',
    borderClass: 'border-coral-300 dark:border-coral-700',
  },
  refunded: {
    label: 'คืนเงินแล้ว',
    bgClass: 'bg-surface',
    textClass: 'text-fg-muted',
    borderClass: 'border-line',
  },
  expired: {
    label: 'หมดอายุ',
    bgClass: 'bg-surface',
    textClass: 'text-fg-placeholder',
    borderClass: 'border-line',
  },
  abandoned: {
    label: 'ยกเลิก',
    bgClass: 'bg-surface',
    textClass: 'text-fg-placeholder',
    borderClass: 'border-line',
  },
};

/**
 * 05-components.md §6.3 — Order Status Badge.
 * Color-coded badge for order status display.
 */
export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps): React.JSX.Element {
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
