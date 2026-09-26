/**
 * Profile คำสั่งซื้อ (client ask: orders as a profile tab, not just a sidebar
 * link) — real order history from GET /api/v1/orders; rows link to the
 * public order detail page.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';

import { AccountTabs } from '@/components/account/AccountTabs';
import { useCustomerProfile } from '@/components/layout/CustomerProfileProvider';
import { HamsterLoader } from '@/components/loading/HamsterLoader';
import { formatThb } from '@/lib/pricing';

interface MyOrder {
  id: string;
  orderNumber: string;
  confirmationUuid: string;
  status: string;
  totalAmountThb: number;
  itemCount: number;
  label: string;
  extraItems: number;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  completed: { label: 'สำเร็จ', className: 'text-jade-700 bg-jade-500/15' },
  payment_confirmed: { label: 'ชำระแล้ว', className: 'text-jade-700 bg-jade-500/15' },
  pending_payment: { label: 'รอชำระเงิน', className: 'text-fawn-700 bg-peach-100' },
  pending_manual_fulfilment: { label: 'รอดำเนินการ', className: 'text-fawn-700 bg-peach-100' },
  failed: { label: 'ไม่สำเร็จ', className: 'text-fg-error bg-error' },
  expired: { label: 'หมดอายุ', className: 'text-fg-placeholder bg-surface' },
  refunded: { label: 'คืนเงิน', className: 'text-fg-error bg-error' },
};

export default function AccountOrdersPage(): React.JSX.Element {
  const { state: sessionState } = useCustomerProfile();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (sessionState !== 'authed') return;
    let cancelled = false;
    fetch('/api/v1/orders', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { orders: MyOrder[] }) => {
        if (!cancelled) {
          setOrders(d.orders ?? []);
          setState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionState]);

  if (sessionState === 'loading') return <HamsterLoader />;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-fg">คำสั่งซื้อ</h1>
        <AccountTabs />
      </div>

      {state === 'loading' && <HamsterLoader />}
      {state === 'error' && (
        <div className="clay-card p-8 text-center">
          <p className="text-sm text-fg-muted">โหลดคำสั่งซื้อไม่สำเร็จ — ลองรีเฟรชหน้าอีกครั้ง</p>
        </div>
      )}
      {state === 'ready' && orders && orders.length === 0 && (
        <div className="clay-card flex flex-col items-center gap-3 p-10 text-center">
          <ShoppingBag size={40} className="text-fg-placeholder" aria-hidden />
          <h2 className="text-lg font-bold text-fg">ยังไม่มีคำสั่งซื้อ</h2>
          <p className="max-w-sm text-sm text-fg-muted">
            เลือกซื้อสินค้าได้จากแท็บ สินค้าทั้งหมด ด้านบน
          </p>
          <Link
            href="/account/dashboard"
            className="clay-btn transition-smart inline-flex h-11 items-center rounded-full bg-surface-brand px-6 text-sm font-semibold text-fg-inverse shadow-clay-brand duration-interactive ease-ease-out hover:scale-[1.03] active:scale-[0.96]"
          >
            เลือกซื้อสินค้า
          </Link>
        </div>
      )}
      {state === 'ready' && orders && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((o) => {
            const status = STATUS_LABELS[o.status] ?? {
              label: o.status,
              className: 'text-fg-placeholder bg-surface',
            };
            return (
              <Link
                key={o.id}
                href={`/orders/${o.confirmationUuid || o.id}`}
                className="clay-card flex items-center justify-between gap-4 p-4 transition-transform duration-interactive ease-ease-out hover:scale-[1.01]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">
                    {o.label}
                    {o.extraItems > 0 && (
                      <span className="text-fg-muted"> +{o.extraItems} รายการ</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {o.orderNumber} ·{' '}
                    {new Date(o.createdAt).toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    · {o.itemCount} ชิ้น
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-fg">{formatThb(o.totalAmountThb)}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
