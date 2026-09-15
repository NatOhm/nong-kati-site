'use client';

import { CreditCard, QrCode } from 'lucide-react';
import { cn } from '@/utils/cn';

export type PaymentMethod = 'promptpay' | 'card';

export interface PaymentMethodSelectorProps {
  selected: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * 05-components.md §5.4 — Payment Method Selector.
 * Radio group for PromptPay vs Card selection.
 */
export function PaymentMethodSelector({
  selected,
  onChange,
  disabled = false,
  className,
}: PaymentMethodSelectorProps): React.JSX.Element {
  return (
    <div className={cn('space-y-3', className)}>
      <h3 className="text-sm font-semibold text-fg-secondary">วิธีชำระเงิน</h3>

      <div className="space-y-2" role="radiogroup" aria-label="วิธีชำระเงิน">
        {/* PromptPay */}
        <label
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
            selected === 'promptpay'
              ? 'border-peach-500 bg-peach-50'
              : 'border-line bg-surface hover:border-line-brand',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <input
            type="radio"
            name="payment-method"
            value="promptpay"
            checked={selected === 'promptpay'}
            onChange={() => onChange('promptpay')}
            disabled={disabled}
            className="h-4 w-4 text-fg-brand focus:ring-peach-500"
          />
          <QrCode size={20} className="text-fg-muted" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium text-fg">PromptPay / Thai QR</p>
            <p className="text-xs text-fg-placeholder">สแกน QR จ่ายผ่านแอปธนาคาร</p>
          </div>
        </label>

        {/* Card */}
        <label
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
            selected === 'card'
              ? 'border-peach-500 bg-peach-50'
              : 'border-line bg-surface hover:border-line-brand',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <input
            type="radio"
            name="payment-method"
            value="card"
            checked={selected === 'card'}
            onChange={() => onChange('card')}
            disabled={disabled}
            className="h-4 w-4 text-fg-brand focus:ring-peach-500"
          />
          <CreditCard size={20} className="text-fg-muted" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium text-fg">บัตรเครดิต / เดบิต</p>
            <p className="text-xs text-fg-placeholder">Visa, Mastercard (3DS2)</p>
          </div>
        </label>
      </div>
    </div>
  );
}
