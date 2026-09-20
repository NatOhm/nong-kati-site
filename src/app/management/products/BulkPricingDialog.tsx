'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';

import { adminJson } from '@/lib/adminSession';
import { formatThb } from '@/utils/format';
import { cn } from '@/utils/cn';

/**
 * Bulk tier pricing (ราคาสมาชิก/ตัวแทนจำหน่ายทีเดียวทุกสินค้า): set member /
 * dealer prices as a percentage of each variant's retail price. Dry-run
 * preview first, then apply. Only active products/variants are touched.
 */

interface BulkChange {
  variantId: string;
  product: string;
  retail: number;
  member: number | null;
  dealer: number | null;
}

interface BulkResponse {
  dryRun: boolean;
  matchedVariants: number;
  changedVariants: number;
  changes: BulkChange[];
  truncated: boolean;
}

export function BulkPricingDialog({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  onApplied: () => void;
}): React.JSX.Element {
  const [memberPercent, setMemberPercent] = useState('');
  const [dealerPercent, setDealerPercent] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [preview, setPreview] = useState<BulkResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    (memberPercent !== '' || dealerPercent !== '') &&
    (memberPercent === '' || (Number(memberPercent) >= 0 && Number(memberPercent) <= 99)) &&
    (dealerPercent === '' || (Number(dealerPercent) >= 0 && Number(dealerPercent) <= 99));

  const run = async (apply: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminJson<BulkResponse>('/api/v1/admin/pricing/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberPercent: memberPercent === '' ? null : Number(memberPercent),
          dealerPercent: dealerPercent === '' ? null : Number(dealerPercent),
          onlyMissing,
          apply,
        }),
      });
      if (apply) {
        onApplied();
        onClose();
      } else {
        setPreview(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="clay-card w-full max-w-2xl rounded-3xl p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-fg">
              ตั้งราคาสมาชิก/ตัวแทนทีเดียวทุกสินค้า
            </h2>
            <p className="mt-1 text-xs text-fg-muted">
              ตั้งเป็น % ของราคาปลีกแต่ละแพ็กเกจ — เว้นว่าง = ไม่แตะระดับนั้น
            </p>
          </div>
          <button
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            className="text-fg-muted transition-colors hover:text-fg"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-fg-muted">ราคาสมาชิก (%)</span>
            <input
              value={memberPercent}
              onChange={(e) => setMemberPercent(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="เช่น 80 = ลด 20%"
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-placeholder focus:border-peach-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-fg-muted">ราคาตัวแทน (%)</span>
            <input
              value={dealerPercent}
              onChange={(e) => setDealerPercent(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="เช่น 70 = ลด 30%"
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-placeholder focus:border-peach-500 focus:outline-none"
            />
          </label>
        </div>

        <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
            className="h-4 w-4 rounded border-line accent-peach-500"
          />
          เติมเฉพาะสินค้าที่ยังไม่ตั้งราคาระดับนั้น (ไม่ทับราคาเดิม)
        </label>

        {error && <p className="mb-3 text-sm text-coral-600">{error}</p>}

        {preview && (
          <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
            <p className="mb-2 text-sm font-semibold text-fg">
              ตัวอย่างก่อนใช้: จะปรับ {preview.changedVariants} จาก {preview.matchedVariants}{' '}
              แพ็กเกจ
              {preview.truncated && ' (แสดง 50 รายการแรก)'}
            </p>
            <div className="max-h-52 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-fg-placeholder">
                    <th className="pb-1">สินค้า</th>
                    <th className="pb-1 text-right">ปลีก</th>
                    <th className="pb-1 text-right">สมาชิก</th>
                    <th className="pb-1 text-right">ตัวแทน</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.map((c) => (
                    <tr key={c.variantId} className="border-t border-line-subtle text-fg-secondary">
                      <td className="max-w-56 truncate py-1.5">{c.product}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatThb(c.retail)}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {c.member === null ? '—' : formatThb(c.member)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {c.dealer === null ? '—' : formatThb(c.dealer)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full border border-line px-4 text-sm font-semibold text-fg-secondary transition-colors hover:border-peach-400 hover:text-fg"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={busy || !valid}
            onClick={() => void run(false)}
            className="h-10 rounded-full border border-line-strong px-4 text-sm font-semibold text-fg transition-colors hover:border-peach-400 disabled:opacity-50"
          >
            {busy && !preview ? <Loader2 size={14} className="inline animate-spin" /> : null}{' '}
            ดูตัวอย่าง
          </button>
          <button
            type="button"
            disabled={busy || !preview || preview.changedVariants === 0}
            onClick={() => void run(true)}
            className={cn(
              'clay-btn h-10 rounded-full bg-surface-brand px-5 text-sm font-semibold text-fg-inverse shadow-clay-brand',
              'transition-all duration-interactive ease-ease-out hover:scale-[1.02] active:scale-[0.96] disabled:opacity-50',
            )}
          >
            {busy && preview ? <Loader2 size={14} className="inline animate-spin" /> : null} ใช้จริง
          </button>
        </div>
      </div>
    </div>
  );
}
