'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw, Save, Search } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/**
 * Slow-moving stock report (client ask #15: "รายงานสต๊อก — ขายดี และสินค้าค้างสต๊อก").
 * Variants with stock on hand that haven't sold in N days — never-sold first,
 * then most days since last sale, then most capital stuck. The N-days threshold
 * is admin-configurable and persisted in SiteSetting ('slow_stock').
 */

interface Row {
  variantId: string;
  productName: string;
  productSlug: string;
  sku: string | null;
  label: string;
  stock: number;
  costThb: number | null;
  priceThb: number;
  stockValueThb: number | null;
  lastSaleAt: string | null;
  daysSinceLastSale: number | null;
  neverSold: boolean;
}

interface Totals {
  variants: number;
  units: number;
  stockValueThb: number;
  neverSoldCount: number;
}

function formatThb(n: number): string {
  return `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDaysAgo(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export default function SlowStockReportPage(): React.JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [daysInput, setDaysInput] = useState('');
  const [savingDays, setSavingDays] = useState(false);
  const [daysMsg, setDaysMsg] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch('/api/v1/admin/reports/slow-stock');
      if (!res.ok)
        throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const data = (await res.json()) as { days: number; rows: Row[]; totals: Totals };
      setRows(data.rows);
      setTotals(data.totals);
      setDays(data.days);
      setDaysInput(String(data.days));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดรายงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDays = useCallback(async (): Promise<void> => {
    const n = Number(daysInput);
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      setDaysMsg('กรุณาใส่ตัวเลข 1–365');
      return;
    }
    setSavingDays(true);
    setDaysMsg(null);
    try {
      const res = await adminFetch('/api/v1/admin/reports/slow-stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: n }),
      });
      if (!res.ok)
        throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      await load();
      setDaysMsg('บันทึกแล้ว');
    } catch (e) {
      setDaysMsg(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSavingDays(false);
    }
  }, [daysInput, load]);

  const filtered = useMemo(
    () =>
      query.trim()
        ? rows.filter((r) =>
            `${r.productName} ${r.label} ${r.sku ?? ''}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
          )
        : rows,
    [rows, query],
  );

  function exportCsv(): void {
    const header = [
      'สินค้า',
      'ตัวเลือก',
      'SKU',
      'สต๊อกคงเหลือ',
      'มูลค่าสต๊อก (ต้นทุน)',
      'ขายล่าสุด',
      'ไม่ได้ขาย (วัน)',
      'ราคาขาย',
    ];
    const lines = filtered.map((r) =>
      [
        r.productName,
        r.label,
        r.sku ?? '',
        r.stock,
        r.stockValueThb?.toFixed(2) ?? '',
        r.lastSaleAt ? new Date(r.lastSaleAt).toISOString().slice(0, 10) : 'ไม่เคยขาย',
        r.neverSold ? 'ไม่เคยขาย' : String(r.daysSinceLastSale),
        r.priceThb.toFixed(2),
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(','),
    );
    const csv = '\uFEFF' + [header.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `slow-stock-${days ?? 30}วัน-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'รายงาน' }, { label: 'สินค้าค้างสต๊อก' }]}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-fg">สินค้าค้างสต๊อก (ขายไม่เดิน)</h1>
            <p className="mt-1 text-sm text-fg-muted">
              สินค้าที่มีสต๊อกแต่ไม่ได้ขายใน {days ?? '…'} วันล่าสุด — เรียงจากไม่เคยขายเลยก่อน
              แล้วตามด้วยสินค้าที่ค้างนานที่สุด
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 shadow-clay-sm">
              <label htmlFor="days-threshold" className="whitespace-nowrap text-sm text-fg-muted">
                ไม่ได้ขายภายใน
              </label>
              <input
                id="days-threshold"
                type="number"
                min={1}
                max={365}
                value={daysInput}
                onChange={(e) => {
                  setDaysInput(e.target.value);
                  setDaysMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveDays();
                }}
                className="w-14 rounded-lg border border-line bg-surface-base px-2 py-1 text-center text-sm font-semibold tabular-nums text-fg focus:border-peach-400"
              />
              <span className="whitespace-nowrap text-sm text-fg-muted">วัน</span>
              <button
                type="button"
                onClick={() => void saveDays()}
                disabled={savingDays || daysInput === String(days)}
                className="rounded-full bg-peach-500 p-1.5 text-white shadow-clay-sm transition-transform duration-fast ease-out-quart hover:scale-105 active:scale-90 disabled:opacity-40"
                aria-label="บันทึกจำนวนวัน"
              >
                {savingDays ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void load()}
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

        {daysMsg && (
          <p
            className={cn(
              'rounded-lg px-3 py-2 text-sm',
              daysMsg === 'บันทึกแล้ว'
                ? 'dark:text-jade-300 bg-jade-500/10 text-jade-700'
                : 'bg-coral-50 text-fg-error dark:bg-coral-900/20 dark:text-coral-300',
            )}
          >
            {daysMsg}
          </p>
        )}

        {error && (
          <p className="bg-error rounded-lg px-3 py-2 text-sm text-fg-error dark:bg-coral-900/20 dark:text-coral-300">
            {error}
          </p>
        )}

        {/* Totals */}
        {totals && !loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ['รายการค้างสต๊อก', totals.variants.toLocaleString('th-TH')],
                ['หน่วยค้างขาย', totals.units.toLocaleString('th-TH')],
                ['มูลค่าสต๊อก (ต้นทุน)', formatThb(totals.stockValueThb)],
                ['ไม่เคยขายเลย', totals.neverSoldCount.toLocaleString('th-TH')],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="clay-card rounded-2xl p-4">
                <p className="text-xs text-fg-placeholder">{label}</p>
                <p className="mt-1 font-display text-lg font-bold text-fg">{value}</p>
              </div>
            ))}
          </div>
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
            placeholder="ค้นหาชื่อสินค้า ตัวเลือก หรือ SKU…"
            className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-fg placeholder:text-fg-placeholder focus:border-peach-400"
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
                ? `ไม่มีสินค้าค้างสต๊อก — ทุกสินค้าที่มีสต๊อกขายได้ภายใน ${days ?? '…'} วันล่าสุด 🎉`
                : 'ไม่พบสินค้าที่ค้นหา'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">สินค้า</th>
                  <th className="px-4 py-3 text-right">สต๊อกคงเหลือ</th>
                  <th className="px-4 py-3 text-right">มูลค่าสต๊อก</th>
                  <th className="px-4 py-3">ขายล่าสุด</th>
                  <th className="px-4 py-3 text-right">ไม่ได้ขาย</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.variantId} className="border-b border-line-subtle last:border-0">
                    <td className="px-4 py-3 text-fg-placeholder">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-fg">{r.productName}</p>
                      <p className="text-xs text-fg-muted">
                        {r.label}
                        {r.sku && <span className="ml-2 font-mono">{r.sku}</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-fg">
                      {r.stock.toLocaleString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-secondary">
                      {r.stockValueThb == null ? (
                        <span className="text-fg-placeholder">—</span>
                      ) : (
                        formatThb(r.stockValueThb)
                      )}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">
                      {r.neverSold ? (
                        <span className="rounded-full bg-coral-500/15 px-2.5 py-0.5 text-xs font-semibold text-fg-error dark:text-coral-300">
                          ไม่เคยขายเลย
                        </span>
                      ) : (
                        formatDaysAgo(r.lastSaleAt)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-secondary">
                      {r.neverSold ? (
                        <span className="font-semibold text-fg-error dark:text-coral-300">∞</span>
                      ) : (
                        <>
                          {r.daysSinceLastSale}{' '}
                          <span className="text-xs text-fg-placeholder">วัน</span>
                        </>
                      )}
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
