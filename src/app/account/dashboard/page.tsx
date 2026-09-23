/**
 * Profile Page (โปรไฟล์ของฉัน) — wallet stats + top-up history.
 * The tabbed store-in-profile views (สินค้าทั้งหมด/แนะนำ) were removed
 * (client ask): shopping lives on the storefront, the profile owns the
 * account data. ภาพรวม merges into this page; /account/overview redirects.
 */

'use client';

import { useEffect, useState } from 'react';

import { AccountTabs } from '@/components/account/AccountTabs';
import { useCustomerProfile } from '@/components/layout/CustomerProfileProvider';
import { HamsterLoader } from '@/components/loading/HamsterLoader';
import { formatThb } from '@/lib/pricing';

interface WalletData {
  balanceThb: number;
  topupThisMonthThb: number;
  spendThisMonthThb: number;
  lifetimeSpendThb: number;
  topups: { id: string; amountThb: number; method: string; status: string; createdAt: string }[];
}

const METHOD_LABEL: Record<string, string> = {
  promptpay: 'พร้อมเพย์',
  credit_card: 'บัตรเครดิต',
  manual: 'เจ้าหน้าที่ยืนยัน',
};

export default function ProfilePage(): React.JSX.Element {
  const { state: sessionState } = useCustomerProfile();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionState !== 'authed') return;
    fetch('/api/v1/wallet', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionState]);

  if (sessionState === 'loading' || loading) return <HamsterLoader />;

  const stats = [
    { label: 'เครดิตคงเหลือ', value: formatThb(data?.balanceThb ?? 0) },
    { label: 'ค่าใช้จ่ายในเดือนนี้', value: formatThb(data?.spendThisMonthThb ?? 0) },
    { label: 'เติมเงินในเดือนนี้', value: formatThb(data?.topupThisMonthThb ?? 0) },
    { label: 'ยอดใช้จ่ายสะสม', value: formatThb(data?.lifetimeSpendThb ?? 0) },
  ];

  return (
    <div className="space-y-6">
      {/* Header + tabs */}
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-fg">โปรไฟล์ของฉัน</h1>
        <AccountTabs />
      </div>

      {/* Stats — plain numbers, no round icons (client ask) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="clay-card p-4">
            <p className="text-xs text-fg-muted">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-fg">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Top-up history (client ask: ประวัติการเติมเงิน ไม่ใช่คำสั่งซื้อล่าสุด) */}
      <div className="clay-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg">ประวัติการเติมเงิน</h2>
          <a href="/account/wallet" className="text-sm font-medium text-fg-brand hover:underline">
            ดูทั้งหมด
          </a>
        </div>
        {!data || data.topups.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">
            ยังไม่มีรายการเติมเงิน — เมื่อเติมเงินแล้วจะแสดงที่นี่
          </p>
        ) : (
          <div className="space-y-2">
            {data.topups.slice(0, 5).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-line-subtle px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-fg">{formatThb(t.amountThb)}</p>
                  <p className="text-xs text-fg-muted">
                    {new Date(t.createdAt).toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {' · '}
                    {METHOD_LABEL[t.method] ?? t.method}
                  </p>
                </div>
                <span className="rounded-full bg-jade-500/15 px-2.5 py-0.5 text-xs font-medium text-jade-700">
                  สำเร็จ
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
