'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface OrderLookupFormProps {
  onSubmit: (email: string, orderNumber: string) => Promise<void>;
  loading?: boolean;
  error?: string | undefined;
  className?: string;
}

/** Order numbers are NK-YYYY-XXXXXX (see confirmation emails). */
const ORDER_RE = /^NK-\d{4}-[A-Z0-9]{6}$/;

/**
 * 05-components.md §6.5 — Order Lookup Form.
 * Guest order retrieval by email + order number.
 */
export function OrderLookupForm({
  onSubmit,
  loading = false,
  error,
  className,
}: OrderLookupFormProps): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [touched, setTouched] = useState(false);

  const normalized = orderNumber.trim().toUpperCase();
  const orderFormatError =
    touched && normalized !== '' && !ORDER_RE.test(normalized)
      ? 'รูปแบบรหัสคำสั่งซื้อไม่ถูกต้อง — ต้องเป็น NK-2026-XXXXXX (ตัวอย่างด้านล่าง)'
      : null;

  const canSubmit = useMemo(
    () => email.trim() !== '' && normalized !== '' && ORDER_RE.test(normalized) && !loading,
    [email, normalized, loading],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    await onSubmit(email.trim(), normalized);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={cn('space-y-4', className)}>
      {/* Email */}
      <div>
        <label htmlFor="lookup-email" className="mb-1 block text-sm font-medium text-fg-secondary">
          อีเมล *
        </label>
        <input
          id="lookup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'lookup-error' : undefined}
          placeholder="kaem@example.com"
          className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500"
        />
      </div>

      {/* Order Number */}
      <div>
        <label htmlFor="lookup-order" className="mb-1 block text-sm font-medium text-fg-secondary">
          รหัสคำสั่งซื้อ *
        </label>
        <input
          id="lookup-order"
          type="text"
          value={orderNumber}
          onChange={(e) => {
            setOrderNumber(e.target.value.toUpperCase());
            setTouched(true);
          }}
          required
          aria-invalid={orderFormatError ? true : error ? true : undefined}
          aria-describedby={
            orderFormatError ? 'lookup-order-error' : error ? 'lookup-error' : 'lookup-order-hint'
          }
          placeholder="NK-2026-XXXXXX"
          className={cn(
            'w-full rounded-md border bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500',
            orderFormatError ? 'border-error' : 'border-line',
          )}
        />
        {orderFormatError ? (
          <p id="lookup-order-error" className="mt-1 text-xs font-medium text-fg-error">
            {orderFormatError}
          </p>
        ) : (
          <p id="lookup-order-hint" className="mt-1 text-xs text-fg-placeholder">
            พบในอีเมลยืนยันคำสั่งซื้อ — รูปแบบ NK-ปี-รหัส 6 หลัก
          </p>
        )}
      </div>

      {/* Error — server-side failure (semantic tokens pass both themes) */}
      {error && (
        <div
          id="lookup-error"
          role="alert"
          className="border-error bg-error rounded-md border px-3 py-2 text-sm text-fg-error"
        >
          {error}
        </div>
      )}

      {/* Submit — disabled is visually distinct: muted fill, no brand shadow,
          label still perceivable (≥2:1) — gated by e2e/disabled-state.spec.ts. */}
      <button
        type="submit"
        disabled={!canSubmit}
        className={cn(
          'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition-colors',
          !canSubmit
            ? 'cursor-not-allowed bg-clay-200 text-clay-600 dark:bg-clay-800 dark:text-clay-400'
            : 'bg-peach-500 text-white shadow-clay-sm hover:bg-peach-400',
        )}
      >
        <Search size={16} />
        {loading ? 'กำลังค้นหา...' : 'ค้นหาคำสั่งซื้อ'}
      </button>
    </form>
  );
}
