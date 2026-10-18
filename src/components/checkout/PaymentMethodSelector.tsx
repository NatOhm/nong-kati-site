'use client';

import { Banknote, QrCode, Wallet } from 'lucide-react';
import { BankNoteImage } from '@/components/banking/BankNoteImage';
import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';

export type PaymentMethod = 'promptpay' | 'card' | 'wallet';

export interface PaymentMethodSelectorProps {
  selected: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
  className?: string;
  /** Manual-transfer / store-account info (admin-configured). When present the
   *  selector renders the customer-facing account card under the radio group; when
   *  absent it shows only the default noaccount hint (read-only, not selectable). */
  manualInfo?: {
    /** Customer-facing account name. */
    name?: string;
    accountName?: string;
    /** Account number or phone (required for an account to be usable). */
    accountNumber?: string;
    /** When true, render the bank-issued QR PNG for this account. */
    displayQr?: boolean;
    /** Bank-issued QR PNG URL (Thai QR). Null still renders the account panel,
     *  but without the scanable PNG. */
    qrImageUrl?: string | null;
  };
  /** Wallet credit available to the logged-in customer (null = guest/unknown → option hidden). */
  walletBalanceThb?: number | null;
}

/** 05-components.md §5.4 — Payment Method Selector. Radio group for Wallet /
 *  PromptPay. Card is hidden while the real Omise gateway is not implemented
 *  (review High #2). Bank-account panel renders here as read-only info; the
 *  PromptPay radio is the selectable path. */
export function PaymentMethodSelector({
  selected,
  onChange,
  disabled = false,
  className,
  manualInfo,
  walletBalanceThb = null,
}: PaymentMethodSelectorProps): JSX.Element {

  const walletAvailable = walletBalanceThb !== null && walletBalanceThb > 0;

  return (
    <div className={cn('space-y-3', className)}>
      <h3 className="text-sm font-semibold text-fg-secondary">วิธีชำระเงิน</h3>

      <fieldset className="space-y-2">
        <legend className="sr-only">วิธีชำระเงิน</legend>

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
              onChange={() => { onChange('wallet'); }}
              disabled={disabled}
              className="h-4 w-4 text-fg-brand focus:ring-peach-500"
            />
            <Wallet size={20} className="text-fg-muted" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-medium text-fg">เครดิตในกระเป๋า</p>
              <p className="text-xs text-fg-placeholder">
                ยอดเครดิต {formatThb(walletBalanceThb)} — หักจากเครดิตทันที ได้โค้ดเลย
              </p>
            </div>
          </label>
        )}

        {/* PromptPay / Thai QR */}
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
            checked={selected === 'promptpay'}              onChange={() => onChange('promptpay')}
            disabled={disabled}
            className="h-4 w-4 text-fg-brand focus:ring-peach-500"
          />
          <QrCode size={20} className="text-fg-muted" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium text-fg">PromptPay / Thai QR</p>
            <p className="text-xs text-fg-placeholder">สแกน QR จ่ายผ่านแอปธนาคาร</p>
          </div>
        </label>

        {/* Bank account card — read-only info panel; payment still goes through the
            PromptPay radio above. */}
        {manualInfo && (
          <div
            className={cn(
              'flex flex-col gap-1.5 rounded-md border border-line bg-surface p-3 opacity-80',
              disabled && 'opacity-40',
            )}
            aria-label="ธนารคปลายทางของร้าน — โอนเงินแล้วอัปโหลดสลิป"
          >
            {/* Heading */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Banknote size={16} className="text-fg-muted" strokeWidth={1.5} />
                <span className="text-xs font-medium text-fg-secondary">ช่องทางธนาคารของร้าน</span>
              </div>
            </div>
            {/* Account info */}
            <div className="rounded-md border border-line bg-fg/5 p-2 text-xs font-mono leading-relaxed">
              <div className="flex justify-between gap-2">
                <span>{manualInfo.accountName ?? 'ช่องทางการชำระเงินของร้าน'}</span>
                <span className="font-normal text-fg-secondary">ชื่อบัญชี</span>
              </div>
              {manualInfo.accountNumber != null && (
                <div className="flex justify-between">
                  <span>{manualInfo.accountNumber}</span>
                  <span className="font-normal text-fg-secondary">หมายเลขบัญชี</span>
                </div>
              )}
              {manualInfo.qrImageUrl && (
                <div className="mt-1.5 flex flex-col items-center gap-1 text-xs text-fg-muted">
                  <div className="mt-1 w-full overflow-hidden rounded-md bg-fg/5 p-1" title="QR พร้อมเพย์ — สแกนจากธนารคได้เลย">
                    <BankNoteImage imageUrl={manualInfo.qrImageUrl} height={92} />
                  </div>
                  <span className="text-center">สแกนจากแอปธนารคได้ทันที</span>
                </div>
              )}
            </div>
          </div>
        )}
        {!manualInfo && (
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
        )}
      </fieldset>
    </div>
  );
}

