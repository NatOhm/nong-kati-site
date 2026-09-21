'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';

import { adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/**
 * Account/stock editor modal (client list: paste multiple account records,
 * automatic parsing, per-variant preview, independent scrolling areas).
 *
 * Flow: pick format + separator → paste records into the big textarea →
 * live parse preview (ID #1, ID #2, … scrollable) → บันทึก calls
 * POST /api/v1/admin/stock/bulk which stores encrypted GiftCodes and writes
 * StockMove(restock) rows. Cancel discards everything locally.
 */

interface BulkStockDialogProps {
  productId: string;
  productName: string;
  onClose: () => void;
  onSaved: () => void;
}

interface Plan {
  variantId: string;
  label: string;
  count: number;
  currentStock: number;
  codes: string[];
}

interface PreviewResponse {
  product: { id: string; name: string };
  plans: Plan[];
}

interface ApplyResponse {
  totalAdded: number;
  results: { variantId: string; label: string; added: number }[];
}

export function BulkStockDialog({ productId, productName, onClose, onSaved }: BulkStockDialogProps) {
  const [format, setFormat] = useState<'short' | 'long'>('short');
  const [separator, setSeparator] = useState<',' | ';' | 'tab'>(',');
  const [raw, setRaw] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ApplyResponse | null>(null);

  const lineCount = useMemo(() => raw.split(/\r?\n/).filter((l) => l.trim() !== '').length, [raw]);

  const dirty = raw.trim() !== '';

  async function runPreview(): Promise<void> {
    if (!dirty) return;
    setChecking(true);
    setError(null);
    try {
      const data = await adminJson<PreviewResponse>('/api/v1/admin/stock/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, format, separator, raw }),
      });
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'แยกข้อมูลไม่สำเร็จ');
    } finally {
      setChecking(false);
    }
  }

  async function save(): Promise<void> {
    if (!preview || saving) return;
    setSaving(true);
    setError(null);
    try {
      const data = await adminJson<ApplyResponse>('/api/v1/admin/stock/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, format, separator, raw, apply: true }),
      });
      setDone(data);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  const totalNew = preview?.plans.reduce((s, p) => s + p.count, 0) ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`จัดการสต๊อกบัญชี ${productName}`}
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line-subtle bg-surface shadow-2xl">
        {/* Title + close */}
        <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-fg">จัดการบัญชีสต๊อก</h2>
            <p className="text-sm text-fg-muted">{productName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-fg-placeholder hover:bg-surface-elevated hover:text-fg"
            aria-label="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center gap-2 rounded-lg border border-jade-500/40 bg-jade-500/15 px-4 py-3 text-sm text-jade-700">
              <Check size={16} /> เพิ่มสต๊อก {done.totalAdded} บัญชีเรียบร้อย
            </div>
            <ul className="mt-3 space-y-1 text-sm text-fg-secondary">
              {done.results.map((r) => (
                <li key={r.variantId}>
                  {r.label}: +{r.added}
                </li>
              ))}
            </ul>
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-lg bg-peach-500 px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:bg-peach-400 active:scale-95"
            >
              เสร็จสิ้น
            </button>
          </div>
        ) : (
          <>
            {/* Format + separator */}
            <div className="flex flex-wrap items-center gap-4 border-b border-line-subtle px-5 py-3">
              <label className="flex items-center gap-2 text-sm text-fg-secondary">
                รูปแบบ
                <select
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value as 'short' | 'long');
                    setPreview(null);
                  }}
                  className="rounded-lg border border-line-subtle bg-surface px-2 py-1.5 text-sm text-fg focus:outline-none"
                >
                  <option value="short">สั้น (user:pass)</option>
                  <option value="long">แบบละเอียด (คั่นด้วยเครื่องหมาย)</option>
                </select>
              </label>
              <label className={cn('flex items-center gap-2 text-sm text-fg-secondary', format === 'short' && 'opacity-50')}>
                ตัวคั่น
                <select
                  value={separator}
                  disabled={format === 'short'}
                  onChange={(e) => {
                    setSeparator(e.target.value as ',' | ';' | 'tab');
                    setPreview(null);
                  }}
                  className="rounded-lg border border-line-subtle bg-surface px-2 py-1.5 text-sm text-fg focus:outline-none"
                >
                  <option value=",">คอมมา ( , )</option>
                  <option value=";">เซมิโคลอน ( ; )</option>
                  <option value="tab">แท็บ</option>
                </select>
              </label>
              <span className="ml-auto text-xs text-fg-placeholder">{lineCount} บรรทัด</span>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Input area */}
                <div className="flex flex-col">
                  <label className="mb-1.5 text-sm font-medium text-fg-secondary" htmlFor="bulk-stock-input">
                    วางบัญชี (บรรทัดละ 1 บัญชี)
                  </label>
                  <textarea
                    id="bulk-stock-input"
                    value={raw}
                    onChange={(e) => {
                      setRaw(e.target.value);
                      setPreview(null);
                    }}
                    rows={12}
                    spellCheck={false}
                    placeholder={
                      format === 'short'
                        ? 'user1:pass1\nuser2:pass2\nuser3:pass3'
                        : 'user1,pass1,ref: A1\nuser2,pass2,ref: A2'
                    }
                    className="min-h-[260px] flex-1 resize-y rounded-lg border border-line-subtle bg-surface-elevated p-3 font-mono text-sm text-fg placeholder:text-fg-placeholder focus:border-line-brand focus:outline-none"
                  />
                  <button
                    onClick={() => void runPreview()}
                    disabled={!dirty || checking}
                    className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-line-brand px-4 py-2 text-sm font-semibold text-fg-brand transition-colors hover:bg-peach-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {checking ? <Loader2 size={15} className="animate-spin" /> : null}
                    แยกข้อมูล
                  </button>
                </div>

                {/* Preview area */}
                <div className="flex flex-col">
                  <p className="mb-1.5 text-sm font-medium text-fg-secondary">
                    ตัวอย่างสต๊อกที่จะถูกสร้าง{' '}
                    {preview && (
                      <span className="font-bold text-fg-brand">({totalNew} รายการ)</span>
                    )}
                  </p>
                  <div className="min-h-[260px] flex-1 overflow-y-auto rounded-lg border border-line-subtle bg-surface-elevated p-3">
                    {!preview ? (
                      <p className="text-sm text-fg-placeholder">
                        วางบัญชีแล้วกด &quot;แยกข้อมูล&quot; เพื่อดูตัวอย่างก่อนบันทึก
                      </p>
                    ) : totalNew === 0 ? (
                      <p className="text-sm text-coral-700">ไม่พบบัญชีที่แยกได้ — ตรวจรูปแบบและตัวคั่น</p>
                    ) : (
                      <ol className="space-y-1.5">
                        {preview.plans.flatMap((plan) =>
                          plan.codes.map((code, i) => (
                            <li
                              key={`${plan.variantId}-${i}`}
                              className="flex items-baseline gap-2 rounded border border-line-subtle bg-surface px-2.5 py-1.5"
                            >
                              <span className="shrink-0 font-mono text-xs text-fg-placeholder">
                                ID #{i + 1}
                              </span>
                              <span className="truncate font-mono text-xs text-fg">{code}</span>
                              <span className="ml-auto shrink-0 rounded-full bg-peach-500/10 px-2 py-0.5 text-[11px] text-fg-brand">
                                {plan.label}
                              </span>
                            </li>
                          )),
                        )}
                      </ol>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mx-5 mb-3 rounded-lg border border-coral-300 bg-coral-50 px-4 py-2.5 text-sm text-coral-700">
                {error}
              </div>
            )}

            {/* Cancel / Save */}
            <div className="flex items-center justify-end gap-2 border-t border-line-subtle px-5 py-3">
              <button
                onClick={() => {
                  setRaw('');
                  setPreview(null);
                  setError(null);
                }}
                className="rounded-lg border border-line-subtle px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-elevated"
              >
                ยกเลิกการเปลี่ยนแปลง
              </button>
              <button
                onClick={() => void save()}
                disabled={!preview || totalNew === 0 || saving}
                className="inline-flex items-center gap-2 rounded-lg bg-peach-500 px-5 py-2 text-sm font-semibold text-white transition-transform hover:bg-peach-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                บันทึก ({totalNew})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
