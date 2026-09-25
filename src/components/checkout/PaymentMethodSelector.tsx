'use client';

import { Banknote, QrCode, Wallet } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';

export type PaymentMethod = 'promptpay' | 'card' | 'wallet';

export interface PaymentMethodSelectorProps {
  selected: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
  className?: string;
  /** Wallet credit available to the logged-in customer (null = guest/unknown → option hidden). */
  walletBalanceThb?: number | null;
}

/**
 * 05-components.md §5.4 — Payment Method Selector.
 * Radio group for Wallet / PromptPay. The wallet option only renders when
 * the customer is logged in with credit available. Card is hidden while the
 * real Omise gateway is not implemented (review High #2) — the PromptPay
 * option carries the manual transfer + slip upload flow instead.
 */
export function PaymentMethodSelector({
  selected,
  onChange,
  disabled = false,
  className,
  walletBalanceThb = null,
}: PaymentMethodSelectorProps): React.JSX.Element {
  const walletAvailable = walletBalanceThb !== null && walletBalanceThb > 0;
  return (
    <div className={cn('space-y-3', className)}>
      <h3 className="text-sm font-semibold text-fg-secondary">วิธีชำระเงิน</h3>

      <div className="space-y-2" role="radiogroup" aria-label="วิธีชำระเงิน">
        {/* Wallet credit — only when logged in with balance */}
        {walletAvailable && (
          <label
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
              selected === 'wallet'
                ? 'border-peach-500 bg-peach-50'
                : 'border-line bg-surface hover:border-line-brand',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              type="radio"
              name="payment-method"
              value="wallet"
              checked={selected === 'wallet'}
              onChange={() => onChange('wallet')}
              disabled={disabled}
              className="h-4 w-4 text-fg-brand focus:ring-peach-500"
            />
            <Wallet size={20} className="text-fg-muted" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-medium text-fg">เครดิตในกระเป๋า</p>
              <p className="text-xs text-fg-placeholder">
                ยอดเครดิต {formatThb(walletBalanceThb)}
                {walletBalanceThb < 0 && ''} — หักจากเครดิตทันที ได้โค้ดเลย
              </p>
            </div>
          </label>
        )}

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

        {/* Manual bank transfer — production path while the real Omise
            gateway is not implemented (review High #2). Plain hint, not
            selectable: the PromptPay option shows the store account + slip
            upload whenever the gateway QR is unavailable. */}
        <div
          className={cn(
            'flex items-center gap-3 rounded-md border border-line bg-surface p-3 opacity-60',
            disabled && 'opacity-40',
          )}
          aria-disabled="true"
        >
          <Banknote size={20} className="shrink-0 text-fg-muted" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium text-fg">โอนเงินผ่านบัญชีร้าน</p>
            <p className="text-xs text-fg-placeholder">
              โอนแล้วอัปโหลดสลิป — เลือก “PromptPay / Thai QR” เพื่อดูบัญชีและส่งสลิป
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
