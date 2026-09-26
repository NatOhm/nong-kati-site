'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Wallet, Clock, Loader2 } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/**
 * Admin Top-up History — real TopUpLog rows with customer join + summary
 * (client list: "Top-up history" in main navigation).
 */

interface TopupRow {
  id: string;
  createdAt: string;
  customerEmail: string;
  customerName: string | null;
  amount: number;
  method: string;
  methodLabel: string;
  reference: string | null;
  status: string;
}

interface TopupResponse {
  logs: TopupRow[];
  summary: { completedTotal: number; completedCount: number; pendingCount: number };
}

const STATUS_TH: Record<string, string> = {
  completed: 'สำเร็จ',
  pending: 'รอดำเนินการ',
  failed: 'ไม่สำเร็จ',
};

export default function AdminTopupsPage(): React.JSX.Element {
  const [data, setData] = useState<TopupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await adminJson<TopupResponse>(
        `/api/v1/admin/topups?status=${encodeURIComponent(statusFilter)}`,
      );
      setData(d);
    } catch {
      setErr('โหลดประวัติเติมเงินไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'ประวัติเติมเงิน' }]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg">ประวัติเติมเงิน</h1>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-subtle bg-surface px-3 py-1.5 text-sm text-fg-secondary transition-colors hover:bg-surface-elevated"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> รีเฟรช
          </button>
        </div>

        {data && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line-subtle bg-surface p-4">
              <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                <Wallet size={13} /> ยอดเติมสำเร็จรวม
              </p>
              <p className="mt-1 text-2xl font-bold text-fg">
                ฿{data.summary.completedTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-xl border border-line-subtle bg-surface p-4">
              <p className="text-xs text-fg-muted">รายการสำเร็จ</p>
              <p className="mt-1 text-2xl font-bold text-fg">{data.summary.completedCount}</p>
            </div>
            <div className="rounded-xl border border-line-subtle bg-surface p-4">
              <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                <Clock size={13} /> รอดำเนินการ
              </p>
              <p className="mt-1 text-2xl font-bold text-fg">{data.summary.pendingCount}</p>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-line-subtle bg-surface px-3 py-2 text-sm text-fg-secondary focus:ring-2 focus:ring-peach-500"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="completed">สำเร็จ</option>
            <option value="pending">รอดำเนินการ</option>
            <option value="failed">ไม่สำเร็จ</option>
          </select>
        </div>

        {err && (
          <div className="border-error bg-error rounded-lg border px-4 py-3 text-sm text-fg-error">
            {err}
            <button onClick={() => void load()} className="ml-2 font-semibold underline">
              ลองอีกครั้ง
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-line-subtle bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface-elevated text-left">
                <th className="px-4 py-3 font-medium text-fg-secondary">วันที่</th>
                <th className="px-4 py-3 font-medium text-fg-secondary">ลูกค้า</th>
                <th className="px-4 py-3 text-right font-medium text-fg-secondary">จำนวนเงิน</th>
                <th className="px-4 py-3 font-medium text-fg-secondary">ช่องทาง</th>
                <th className="px-4 py-3 font-medium text-fg-secondary">อ้างอิง</th>
                <th className="px-4 py-3 text-center font-medium text-fg-secondary">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-fg-placeholder">
                    <Loader2 size={22} className="mx-auto mb-2 animate-spin" /> กำลังโหลด…
                  </td>
                </tr>
              ) : !data || data.logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-fg-placeholder">
                    ยังไม่มีรายการเติมเงิน
                  </td>
                </tr>
              ) : (
                data.logs.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-line-subtle last:border-0 hover:bg-surface-elevated"
                  >
                    <td className="px-4 py-3 text-fg-secondary">
                      {new Date(t.createdAt).toLocaleDateString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-fg">{t.customerName ?? '—'}</p>
                      <p className="text-xs text-fg-placeholder">{t.customerEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-fg">
                      ฿{t.amount.toLocaleString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">{t.methodLabel}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs text-fg-placeholder">
                      {t.reference ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          t.status === 'completed'
                            ? 'bg-jade-500/15 text-jade-700'
                            : t.status === 'pending'
                              ? 'bg-peach-500/15 text-peach-700'
                              : 'bg-coral-500/15 text-fg-error',
                        )}
                      >
                        {STATUS_TH[t.status] ?? t.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
