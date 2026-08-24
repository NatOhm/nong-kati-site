'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface OrderLookupFormProps {
  onSubmit: (email: string, orderNumber: string) => Promise<void>;
  loading?: boolean;
  error?: string | undefined;
  className?: string;
}

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && orderNumber.trim()) {
      await onSubmit(email.trim(), orderNumber.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-4', className)}>
      {/* Email */}
      <div>
        <label htmlFor="lookup-email" className="mb-1 block text-sm font-medium text-ink-200">
          อีเมล *
        </label>
        <input
          id="lookup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="kaem@example.com"
          className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {/* Order Number */}
      <div>
        <label htmlFor="lookup-order" className="mb-1 block text-sm font-medium text-ink-200">
          รหัสคำสั่งซื้อ *
        </label>
        <input
          id="lookup-order"
          type="text"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          required
          placeholder="NK-2026-XXXXXX"
          className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <p className="mt-1 text-xs text-ink-400">
          พบในอีเมลยืนยันคำสั่งซื้อ
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-crimson-700/50 bg-crimson-900/20 px-3 py-2 text-sm text-crimson-200">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !email.trim() || !orderNumber.trim()}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition-colors',
          loading
            ? 'cursor-wait bg-ink-700 text-ink-400'
            : 'bg-amber-400 text-ink-900 hover:bg-amber-300',
        )}
      >
        <Search size={16} />
        {loading ? 'กำลังค้นหา...' : 'ค้นหาคำสั่งซื้อ'}
      </button>
    </form>
  );
}
