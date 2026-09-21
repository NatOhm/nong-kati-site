'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw, Search } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/**
 * Per-dealer/member sales report (client ask: "สถิติตัวแทน/สมาชิกที่ซื้อสินค้า —
 * ดูได้ว่าสมาชิกคนไหนทำยอดขายได้เท่าไร"). Ranks every customer who has bought
 * (revenue-recognized orders) by spend, with profit where cost data exists.
 * Spec confirmed with the client: all customers, all-time + this-month toggle,
 * CSV export.
 */

interface Row {
  customerId: string;
  email: string;
  fullName: string | null;
  tier: string;
  walletBalanceThb: number;
  orders: number;
  units: number;
  spendThb: number;
  profitThb: number;
  profitCoveragePct: number;
}

interface Totals {
  orders: number;
  units: number;
  spendThb: number;
  profitThb: number;
}

const TIER_LABEL: Record<string, string> = {
  retail: 'ทั่วไป',
  member: 'สมาชิก',
  dealer: 'ตัวแทนจำหน่าย',
};

function formatThb(n: number): string {
  return `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CustomerSalesReportPage(): React.JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [period, setPeriod] = useState<'all' | 'month'>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: 'all' | 'month'): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/v1/admin/reports/customer-sales?period=${p}`);
      if (!res.ok)
        throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const data = (await res.json()) as { customers: Row[]; totals: Totals };
      setRows(data.customers);
      setTotals(data.totals);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดรายงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const filtered = useMemo(
    () =>
      query.trim()
        ? rows.filter((r) =>
            `${r.fullName ?? ''} ${r.email}`.toLowerCase().includes(query.trim().toLowerCase()),
          )
        : rows,
    [rows, query],
  );

  function exportCsv(): void {
    const header = [
      'อีเมล',
      'ชื่อ',
      'ระดับ',
      'ออเดอร์',
      'ชิ้น',
      'ยอดซื้อ (บาท)',
      'กำไร (บาท)',
      'กำไรครอบคลุมข้อมูลต้นทุน (%)',
      'วอลเล็ต (บาท)',
    ];
    const lines = filtered.map((r) =>
      [
        r.email,
        r.fullName ?? '',
        TIER_LABEL[r.tier] ?? r.tier,
        r.orders,
        r.units,
        r.spendThb.toFixed(2),
        r.profitThb.toFixed(2),
        r.profitCoveragePct,
        r.walletBalanceThb.toFixed(2),
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(','),
    );
    const csv = '\uFEFF' + [header.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-sales-${period === 'month' ? 'เดือนนี้' : 'ทั้งหมด'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'รายงาน' }, { label: 'ยอดซื้อรายคน' }]}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-fg">ยอดซื้อรายคน (ตัวแทน/สมาชิก)</h1>
            <p className="mt-1 text-sm text-fg-muted">
              จัดอันดับลูกค้าตามยอดที่ซื้อจากร้าน — นับเฉพาะออเดอร์ที่ชำระเงินแล้ว
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex rounded-full bg-surface p-1 shadow-clay-sm"
              role="tablist"
              aria-label="ช่วงเวลา"
            >
              {(
                [
                  ['all', 'ทั้งหมด'],
                  ['month', 'เดือนนี้'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={period === v}
                  onClick={() => setPeriod(v)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-fast ease-out-quart',
                    period === v
                      ? 'bg-peach-500 text-white shadow-clay-sm'
                      : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void load(period)}
              className="rounded-full bg-surface p-2.5 text-fg-muted shadow-clay-sm transition-transform duration-fast ease-out-quart hover:scale-105 active:scale-90"
              aria-label="รีเฟรช"
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 rounded-full bg-peach-500 px-4 py-2.5 text-sm font-semibold text-white shadow-clay-sm transition-transform duration-fast ease-out-quart hover:scale-105 active:scale-90 disabled:opacity-50"
            >
              <Download size={16} />
              CSV
            </button>
          </div>
        </div>

        {/* Totals */}
        {totals && !loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ['ยอดรวม', formatThb(totals.spendThb)],
                ['กำไร (เฉพาะที่มีต้นทุน)', formatThb(totals.profitThb)],
                ['ออเดอร์', totals.orders.toLocaleString('th-TH')],
                ['ชิ้น', totals.units.toLocaleString('th-TH')],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="clay-card rounded-2xl p-4">
                <p className="text-xs text-fg-placeholder">{label}</p>
                <p className="mt-1 font-display text-lg font-bold text-fg">{value}</p>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-700 dark:bg-coral-900/20 dark:text-coral-300">
            {error}
          </p>
        )}

        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-placeholder"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อหรืออีเมล…"
            className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-fg placeholder:text-fg-placeholder focus:border-peach-400 focus:outline-none"
          />
        </div>

        {/* Table */}
        <div className="clay-card overflow-x-auto rounded-2xl">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-fg-placeholder">
              <Loader2 size={16} className="animate-spin" /> กำลังโหลด…
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-10 text-center text-sm text-fg-placeholder">
              {rows.length === 0
                ? 'ยังไม่มีข้อมูล — รายงานจะแสดงเมื่อมีออเดอร์ที่ชำระเงินแล้วจากลูกค้าที่ลงทะเบียน'
                : 'ไม่พบลูกค้าที่ค้นหา'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">ระดับ</th>
                  <th className="px-4 py-3 text-right">ออเดอร์</th>
                  <th className="px-4 py-3 text-right">ชิ้น</th>
                  <th className="px-4 py-3 text-right">ยอดซื้อ</th>
                  <th className="px-4 py-3 text-right">กำไร</th>
                  <th className="px-4 py-3 text-right">วอลเล็ต</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.customerId} className="border-b border-line-subtle last:border-0">
                    <td className="px-4 py-3 text-fg-placeholder">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-fg">{r.fullName || '—'}</p>
                      <p className="text-xs text-fg-muted">{r.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          r.tier === 'dealer'
                            ? 'dark:text-jade-300 bg-jade-500/15 text-jade-700'
                            : r.tier === 'member'
                              ? 'bg-peach-500/15 text-fg-brand'
                              : 'bg-surface-base text-fg-muted',
                        )}
                      >
                        {TIER_LABEL[r.tier] ?? r.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-secondary">
                      {r.orders}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-secondary">
                      {r.units}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-fg">
                      {formatThb(r.spendThb)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        className={cn(
                          'font-medium',
                          r.profitCoveragePct === 0 && 'text-fg-placeholder',
                        )}
                      >
                        {formatThb(r.profitThb)}
                        {r.profitCoveragePct > 0 && r.profitCoveragePct < 100 && (
                          <span className="ml-1 text-xs text-fg-placeholder">
                            ({r.profitCoveragePct}%)
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-secondary">
                      {formatThb(r.walletBalanceThb)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
