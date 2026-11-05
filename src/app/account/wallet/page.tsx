'use client';

import { useEffect, useState } from 'react';
import { Wallet, TrendingDown, TrendingUp, Receipt } from 'lucide-react';

import { useCustomerProfile } from '@/components/layout/CustomerProfileProvider';
import { HamsterLoader } from '@/components/loading/HamsterLoader';
import { formatThb } from '@/utils/format';
import { cn } from '@/utils/cn';

/**
 * กระเป๋าเงิน — เครดิตคงเหลือ, เติมเงินในเดือนนี้, ค่าใช้จ่ายเดือนนี้,
 * และประวัติการเดินเงิน (client asks จากลิสต์ใหม่). ปุ่มเติมเงินจริงจะ
 * เชื่อมผู้ให้บริการชำระเงิน (Omise/PromptPay) เป็นขั้นถัดไป — ตอนนี้
 * แสดงสถานะว่ากำลังเตรียมระบบ ไม่หลอกผู้ใช้ว่ากดแล้วเติมได้.
 */

interface SpendRow {
  id: string;
  orderNumber: string;
  confirmationUuid: string;
  amountThb: number;
  itemCount: number;
  createdAt: string;
}

interface WalletData {
  balanceThb: number;
  topupThisMonthThb: number;
  spendThisMonthThb: number;
  topups: { id: string; amountThb: number; method: string; status: string; createdAt: string }[];
  spendHistory?: SpendRow[];
}

export default function WalletPage(): React.JSX.Element {
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
    {
      icon: <Wallet size={18} className="text-fg-brand" />,
      label: 'เครดิตคงเหลือ',
      value: formatThb(data?.balanceThb ?? 0),
    },
    {
      icon: <TrendingUp size={18} className="text-jade-600" />,
      label: 'เติมเงินในเดือนนี้',
      value: formatThb(data?.topupThisMonthThb ?? 0),
    },
    {
      icon: <TrendingDown size={18} className="text-coral-500" />,
      label: 'ค่าใช้จ่ายในเดือนนี้',
      value: formatThb(data?.spendThisMonthThb ?? 0),
    },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-fg">กระเป๋าเงิน</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="clay-card flex items-center gap-3 p-4">
            {s.icon}
            <div>
              <p className="text-xs text-fg-muted">{s.label}</p>
              <p className="text-lg font-bold text-fg">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="clay-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-fg">ประวัติการเดินเงิน</h2>
          <button
            type="button"
            disabled
            title="ระบบเติมเงินอัตโนมัติกำลังจะมาเร็วๆ นี้ — ติดต่อ LINE สำหรับเติมเงินชั่วคราว"
            className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-full bg-surface-sunken px-4 text-sm font-semibold text-fg-muted"
          >
            <Receipt size={15} /> เติมเงิน
          </button>
        </div>

        {!data || data.topups.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">
            ยังไม่มีรายการเติมเงิน — เมื่อเติมเงินแล้วจะแสดงที่นี่
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {data.topups.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-line-subtle px-4 py-3"
              >
                <div>
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      t.amountThb < 0 ? 'text-fg-error' : 'text-fg',
                    )}
                  >
                    {t.amountThb < 0 ? '' : '+'}
                    {formatThb(t.amountThb)}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {new Date(t.createdAt).toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {' · '}
                    {t.method === 'promptpay'
                      ? 'เติมเงินพร้อมเพย์'
                      : t.method === 'credit_card'
                        ? 'เติมด้วยบัตรเครดิต'
                        : t.method === 'wallet_spend'
                          ? 'ใช้ซื้อสินค้า'
                          : t.method === 'admin_credit'
                            ? 'แอดมินปรับเครดิต'
                            : t.method}
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

      {/* Spending history — from completed ORDERS, so bank-transfer and slip
          purchases appear here too (they never wrote a wallet ledger row). */}
      <div className="clay-card p-5">
        <h2 className="text-base font-bold text-fg">ประวัติการใช้จ่าย</h2>
        {!data || (data.spendHistory ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">
            ยังไม่มีการใช้จ่าย — คำสั่งซื้อที่ชำระสำเร็จจะแสดงที่นี่
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(data.spendHistory ?? []).map((s) => (
              <li key={s.id}>
                <a
                  href={`/orders/${s.confirmationUuid || s.id}`}
                  className="flex items-center justify-between rounded-xl border border-line-subtle px-4 py-3 transition-colors hover:bg-surface"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{s.orderNumber}</p>
                    <p className="text-xs text-fg-muted">
                      {new Date(s.createdAt).toLocaleDateString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {' · '}
                      {s.itemCount} ชิ้น
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-fg-error">
                    -{formatThb(s.amountThb)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
