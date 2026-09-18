import { useEffect, useState } from 'react';
import { Wallet, TrendingDown, TrendingUp, Receipt } from 'lucide-react';

import { useCustomerSession } from '@/components/layout/useCustomerSession';
import { HamsterLoader } from '@/components/loading/HamsterLoader';
import { formatThb } from '@/utils/format';

/**
 * กระเป๋าเงิน — เครดิตคงเหลือ, เติมเงินในเดือนนี้, ค่าใช้จ่ายเดือนนี้,
 * และประวัติการเดินเงิน (client asks จากลิสต์ใหม่). ปุ่มเติมเงินจริงจะ
 * เชื่อมผู้ให้บริการชำระเงิน (Omise/PromptPay) เป็นขั้นถัดไป — ตอนนี้
 * แสดงสถานะว่ากำลังเตรียมระบบ ไม่หลอกผู้ใช้ว่ากดแล้วเติมได้.
 */

interface WalletData {
  balanceThb: number;
  topupThisMonthThb: number;
  spendThisMonthThb: number;
  topups: { id: string; amountThb: number; method: string; status: string; createdAt: string }[];
}

export default function WalletPage(): React.JSX.Element {
  const sessionState = useCustomerSession();
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
                  <p className="text-sm font-semibold text-fg">{formatThb(t.amountThb)}</p>
                  <p className="text-xs text-fg-muted">
                    {new Date(t.createdAt).toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {' · '}
                    {t.method === 'promptpay'
                      ? 'พร้อมเพย์'
                      : t.method === 'credit_card'
                        ? 'บัตรเครดิต'
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
    </div>
  );
}
