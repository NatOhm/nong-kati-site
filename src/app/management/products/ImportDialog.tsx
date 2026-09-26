'use client';

import { useRef, useState } from 'react';
import { Download, FileUp, Loader2, X, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/**
 * Bulk product import (client ask: ลงสินค้าทีละหลายชิ้นได้).
 * Paste CSV or pick a .csv file → preview count → import → per-row report.
 * Upsert mode: existing SKU rows are updated (name/price/cost, stock delta
 * written to StockMove); create-only skips existing SKUs.
 */

const TEMPLATE = [
  'sku,name,category,price,stock,cost,description',
  'NETFLIX-30,Netflix 30 วัน,netflix,120,10,80,แบบจอส่วนตัว',
  'HBO-7,HBO Max 7 วัน,hbo-max,25,20,15,4K แชร์ 4',
  'SPOTIFY-1M,Spotify Premium 1 เดือน,spotify,45,15,30,บัญชีร้าน',
].join('\n');

const STATUS_LABELS: Record<string, string> = {
  SKU_REQUIRED: 'ไม่มี SKU',
  NAME_REQUIRED: 'ไม่มีชื่อสินค้า',
  PRICE_INVALID: 'ราคาไม่ถูกต้อง',
  CATEGORY_REQUIRED: 'ไม่พบหมวดหมู่',
  SKU_ALREADY_EXISTS: 'SKU มีอยู่แล้ว (โหมด create-only)',
  ROW_FAILED: 'บันทึกไม่สำเร็จ',
};

interface ImportResult {
  row: number;
  status: 'created' | 'updated' | 'error';
  sku?: string;
  slug?: string;
  message?: string;
}

interface ImportResponse {
  created: number;
  updated: number;
  failed: number;
  results: ImportResult[];
}

export function ImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}): React.JSX.Element {
  const [csv, setCsv] = useState('');
  const [mode, setMode] = useState<'upsert' | 'create-only'>('upsert');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const dataRows = csv.split(/\r?\n/).filter((l) => l.trim()).length - 1;

  function pickFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result));
    reader.onerror = () => setError('อ่านไฟล์ไม่สำเร็จ');
    reader.readAsText(file, 'utf-8');
  }

  function downloadTemplate(): void {
    const blob = new Blob(['\uFEFF' + TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'product-import-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function runImport(): Promise<void> {
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await adminFetch('/api/v1/admin/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, mode }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | (ImportResponse & { error?: string })
        | { error: string };
      if (!res.ok) {
        throw new Error(
          'error' in data && data.error
            ? (STATUS_LABELS[data.error] ?? data.error)
            : `HTTP ${res.status}`,
        );
      }
      setResult(data as ImportResponse);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'นำเข้าไม่สำเร็จ');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="นำเข้าสินค้าจาก CSV"
      onClick={(e) => {
        if (e.target === e.currentTarget && !importing) onClose();
      }}
    >
      <div className="clay-card max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-fg">นำเข้าสินค้าจาก CSV</h2>
            <p className="mt-1 text-sm text-fg-muted">
              คอลัมน์:{' '}
              <code className="text-xs">sku, name, category, price, stock, cost, description</code>{' '}
              (ชื่อไทยหรืออังกฤษ)
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            aria-label="ปิด"
            className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Actions row */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => fileInput.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-fg transition-colors hover:border-peach-400 hover:text-fg-brand"
          >
            <FileUp size={15} /> เลือกไฟล์ .csv
          </button>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-fg transition-colors hover:border-peach-400 hover:text-fg-brand"
          >
            <Download size={15} /> ดาวน์โหลดเทมเพลต
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) pickFile(f);
            }}
          />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-1.5 text-fg">
              <input
                type="radio"
                checked={mode === 'upsert'}
                onChange={() => setMode('upsert')}
                className="accent-peach-500"
              />
              อัปเดตถ้ามีแล้ว
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-fg">
              <input
                type="radio"
                checked={mode === 'create-only'}
                onChange={() => setMode('create-only')}
                className="accent-peach-500"
              />
              สร้างอย่างเดียว
            </label>
          </div>
        </div>

        {/* Paste area */}
        <textarea
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setResult(null);
          }}
          rows={8}
          spellCheck={false}
          placeholder={
            'sku,name,category,price,stock,cost,description\nNETFLIX-30,Netflix 30 วัน,netflix,120,10,80,แบบจอส่วนตัว'
          }
          className="mt-3 w-full rounded-lg border border-line bg-surface p-3 font-mono text-xs text-fg placeholder:text-fg-placeholder focus:border-peach-400"
        />
        <p className="mt-1 text-xs text-fg-placeholder">
          {dataRows > 0 ? `${dataRows} แถวข้อมูล (ไม่รวมหัวตาราง)` : 'วาง CSV หรือเลือกไฟล์ด้านบน'}
        </p>

        {error && (
          <p className="bg-error mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg-error dark:bg-coral-900/20 dark:text-coral-300">
            <AlertTriangle size={15} /> {error}
          </p>
        )}

        {/* Results */}
        {result && (
          <div className="mt-4 rounded-xl border border-line-subtle bg-surface p-4">
            <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
              <span className="text-jade-600 flex items-center gap-1.5">
                <CheckCircle2 size={15} /> สร้าง {result.created}
              </span>
              <span className="flex items-center gap-1.5 text-fg-brand">
                <CheckCircle2 size={15} /> อัปเดต {result.updated}
              </span>
              {result.failed > 0 && (
                <span className="flex items-center gap-1.5 text-fg-error">
                  <XCircle size={15} /> ผิดพลาด {result.failed}
                </span>
              )}
            </div>
            {result.results.length > 0 && (
              <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-line-subtle">
                <table className="w-full text-left text-xs">
                  <tbody>
                    {result.results.map((r) => (
                      <tr key={r.row} className="border-b border-line-subtle last:border-0">
                        <td className="px-3 py-1.5 text-fg-placeholder">แถว {r.row}</td>
                        <td className="px-3 py-1.5 font-mono text-fg">{r.sku ?? '—'}</td>
                        <td
                          className={cn(
                            'px-3 py-1.5 font-medium',
                            r.status === 'created' && 'text-jade-600',
                            r.status === 'updated' && 'text-fg-brand',
                            r.status === 'error' && 'text-fg-error',
                          )}
                        >
                          {r.status === 'created'
                            ? 'สร้างใหม่'
                            : r.status === 'updated'
                              ? 'อัปเดต'
                              : r.message
                                ? (STATUS_LABELS[r.message] ?? r.message)
                                : 'ผิดพลาด'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={importing}
            className="rounded-lg px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            ปิด
          </button>
          <button
            onClick={() => void runImport()}
            disabled={importing || !csv.trim()}
            className="flex items-center gap-2 rounded-lg bg-peach-500 px-5 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] hover:bg-peach-400 active:scale-95 disabled:opacity-50"
          >
            {importing ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
            {importing ? 'กำลังนำเข้า…' : 'นำเข้า'}
          </button>
        </div>
      </div>
    </div>
  );
}
