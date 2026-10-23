'use client';

import { useMemo, useState, type DragEvent } from 'react';
import { Check, Loader2, X } from 'lucide-react';

import { adminJson } from '@/lib/adminSession';
import {
  bulkErrorMessage,
  countBulkRecords,
  parseBulkRecords,
  routeBulkRecords,
  type BulkVariant,
} from '@/lib/bulkRecords';
import { cn } from '@/utils/cn';

/**
 * Account/stock editor modal — mirrors the reference admin's จัดการข้อมูลบัญชี:
 * radio format (สั้น user:pass / ยาว ข้อมูล+อีขิด blocks), separator chip row,
 * big paste textarea, and a สิ่งที่จะได้ในการเพิ่มบัญชี preview of ไอดี #1…
 * cards. Long format keeps blank-line-separated multi-line blocks as ONE
 * account each (the pretty emoji text is delivered to the customer as-is).
 * A file can be dropped on the paste box; the live chips under it show where
 * each record will land (same shared parser the route writes with).
 * Save → POST /api/v1/admin/stock/bulk (encrypted GiftCodes + StockMove).
 */

interface BulkStockDialogProps {
  productId: string;
  productName: string;
  /** Active variants of this product — drives the live routing chips. The
   *  route routes only active variants, so callers pass that same set. */
  variants: BulkVariant[];
  /** Pin every pasted record to this variant (the inventory panel's
   *  เติมบัญชี button) instead of the default round-robin across all. */
  pinVariant?: { variantId: string; label: string };
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
  duplicates?: number;
}

interface ApplyResponse {
  totalAdded: number;
  duplicates?: number;
  results: { variantId: string; label: string; added: number }[];
}

const SEPARATORS: { value: ',' | ';' | 'tab'; label: string }[] = [
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: 'tab', label: 'Tab' },
];

/** Rendered preview-card cap — a 500-row paste must not build 500 cards. */
const PREVIEW_LIMIT = 50;

export function BulkStockDialog({
  productId,
  productName,
  variants,
  pinVariant,
  onClose,
  onSaved,
}: BulkStockDialogProps) {
  const [format, setFormat] = useState<'short' | 'long'>('short');
  const [separator, setSeparator] = useState<',' | ';' | 'tab'>(',');
  const [raw, setRaw] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ApplyResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);

  /**
   * Client-side record estimate — shared with the server's split rule via
   * lib/bulkRecords (the old inline regex drifted from the route's blank-run
   * loop: whitespace-only lines with paste artifacts made the counter
   * disagree with the server's actual split).
   */
  const recordCount = useMemo(() => countBulkRecords(raw, format), [raw, format]);

  /**
   * Live distribution preview — the SAME parse+round-robin the route runs
   * (lib/bulkRecords), so the chips say where each record lands while typing.
   * The server-side แยกข้อมูล pass stays authoritative for DB duplicates.
   */
  const distribution = useMemo(() => {
    if (raw.trim() === '') return [];
    const routed = routeBulkRecords(
      parseBulkRecords(raw, format),
      variants,
      format,
      pinVariant?.variantId ?? '',
    );
    return routed
      .filter((p) => p.codes.length > 0)
      .map((p) => ({ variantId: p.variantId, label: p.label, count: p.codes.length }));
  }, [raw, format, variants, pinVariant]);

  /**
   * Rough account-count heuristic (mail/user/pass/id-ish lines). When it
   * exceeds the record count in long format, the paste is probably several
   * accounts separated by ONE blank line — warn before they save one blob.
   */
  const accountGuess = useMemo(() => {
    if (format !== 'long' || raw.trim() === '') return 0;
    // NFKC folds supplier "fancy fonts" (𝗠𝗮𝗶𝗹 → Mail) so the heuristic sees
    // the label it expects; parsing itself never touches the original text.
    return raw
      .normalize('NFKC')
      .split(/\r?\n/)
      .filter((l) => /mail|user|pass|ไอดี|บัญชี|id\s*[:：]/i.test(l)).length;
  }, [raw, format]);

  const dirty = raw.trim() !== '';

  async function runPreview(): Promise<void> {
    if (!dirty) return;
    setChecking(true);
    setError(null);
    try {
      const data = await adminJson<PreviewResponse>('/api/v1/admin/stock/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, format, separator, raw, ...(pinVariant ? { variantId: pinVariant.variantId } : {}) }),
      });
      setPreview(data);
    } catch (e) {
      setError(bulkErrorMessage(e, 'แยกข้อมูลไม่สำเร็จ'));
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
        body: JSON.stringify({ productId, format, separator, raw, apply: true, ...(pinVariant ? { variantId: pinVariant.variantId } : {}) }),
      });
      setDone(data);
      onSaved();
    } catch (e) {
      setError(bulkErrorMessage(e, 'บันทึกไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  }

  const totalNew = preview?.plans.reduce((s, p) => s + p.count, 0) ?? 0;

  /** Dropped files fill the paste box (2 MB cap — these are pastes, not uploads). */
  async function handleDrop(e: DragEvent<HTMLDivElement>): Promise<void> {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setError('ไฟล์ใหญ่เกินไป (จำกัด 2 MB) — แบ่งไฟล์ หรือวางข้อความแทน');
      return;
    }
    try {
      setRaw(await file.text());
      setPreview(null);
      setError(null);
    } catch {
      setError('อ่านไฟล์ไม่สำเร็จ — ลองลากไฟล์ .txt/.csv ใหม่');
    }
  }

  /** Cards flattened for render — capped so a huge paste cannot stall the DOM. */
  const previewCards = preview
    ? preview.plans.flatMap((plan) =>
        plan.codes.map((code) => ({ variantId: plan.variantId, label: plan.label, code })),
      )
    : [];
  const shownCards = previewCards.slice(0, PREVIEW_LIMIT);

  return (
    <div
      className="bg-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`จัดการข้อมูลบัญชี ${productName}`}
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line-subtle bg-surface shadow-2xl">
        {/* Title + close */}
        <div className="flex items-start justify-between border-b border-line-subtle px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-fg">จัดการข้อมูลบัญชี - {productName}</h2>
            <p className="mt-0.5 text-xs text-fg-muted">
              กรอกข้อมูลบัญชีผู้ใช้ในรูปแบบที่กำหนด เพื่อเพิ่มจำนวนข้อมูลให้สินค้านี้
            </p>
            {pinVariant && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-peach-500/10 px-2.5 py-0.5 text-[11px] font-medium text-fg-brand">
                บันทึกเข้า: {pinVariant.label} เท่านั้น
              </p>
            )}
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
              <Check size={16} /> เพิ่มสต๊อก {done.totalAdded} ไอดีเรียบร้อย
              {done.duplicates ? ` (ข้ามรายการซ้ำ ${done.duplicates})` : ''}
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
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Format radios */}
            <fieldset className="mb-4">
              <legend className="mb-1.5 text-sm font-semibold text-fg">รูปแบบข้อมูลไอดี *</legend>
              <div className="flex flex-col gap-1.5">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg-secondary">
                  <input
                    type="radio"
                    name="bulk-format"
                    checked={format === 'short'}
                    onChange={() => {
                      setFormat('short');
                      setPreview(null);
                    }}
                    className="h-4 w-4 accent-peach-600"
                  />
                  รูปแบบสั้น (user:pass)
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg-secondary">
                  <input
                    type="radio"
                    name="bulk-format"
                    checked={format === 'long'}
                    onChange={() => {
                      setFormat('long');
                      setPreview(null);
                    }}
                    className="h-4 w-4 accent-peach-600"
                  />
                  รูปแบบยาว (ข้อมูลหลายบรรทัด — คั่นบล็อกด้วยบรรทัดว่าง)
                </label>
              </div>
            </fieldset>

            {/* Separator chips */}
            <div className={cn('mb-4', format === 'short' && 'opacity-50')}>
              <p className="mb-1.5 text-sm font-semibold text-fg">
                เลือกช่องทางในการแยกบัญชี / Separator
              </p>
              <div className="flex gap-2">
                {SEPARATORS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    disabled={format === 'short'}
                    onClick={() => {
                      setSeparator(s.value);
                      setPreview(null);
                    }}
                    className={cn(
                      'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
                      format !== 'short' && separator === s.value
                        ? 'bg-peach-500 text-white'
                        : 'border border-line-subtle bg-surface-elevated text-fg-secondary hover:border-line-brand',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input */}
            <div className="mb-4">
              <label
                className="mb-1.5 block text-sm font-semibold text-fg"
                htmlFor="bulk-stock-input"
              >
                ข้อมูลไอดีและรหัสผ่าน *
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => void handleDrop(e)}
                className={cn('rounded-lg', dragOver && 'ring-2 ring-peach-500')}
              >
                <textarea
                  id="bulk-stock-input"
                  value={raw}
                  onChange={(e) => {
                    setRaw(e.target.value);
                    setPreview(null);
                  }}
                  rows={10}
                  spellCheck={false}
                  placeholder={
                    format === 'short'
                      ? 'user1:pass1\nuser2:pass2\nuser3:pass3'
                      : '🍎 ➤ HBO MAX 4K  7 days 💜\n\n✅ Mail : mansdevt@gmail.com\n✅ pass : baby123456hii\n\n\n✅ Mail : บัญชีถัดไป@gmail.com\n✅ pass : xxxxxxxx\n\n\n(บล็อกถัดไป คั่นด้วยบรรทัดว่าง 2 บรรทัดติดกัน)'
                  }
                  className="min-h-[220px] w-full resize-y rounded-lg border border-line-subtle bg-surface-elevated p-3 font-mono text-sm text-fg placeholder:text-fg-placeholder focus:border-line-brand"
                />
              </div>
              <p className="mt-1 text-xs text-fg-placeholder">
                ตอนนี้: {recordCount} รายการ
                {format === 'long' && ' (แยกบล็อกด้วยบรรทัดว่าง 2 บรรทัดติดกัน)'} ·
                ลากไฟล์ .txt/.csv มาวางได้ (สูงสุด 2 MB)
              </p>
              {distribution.length > 0 && (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-secondary">
                  <span>จะกระจายเข้า:</span>
                  {distribution.map((d) => (
                    <span
                      key={d.variantId}
                      className="rounded-full bg-peach-500/10 px-2 py-0.5 font-medium text-fg-brand"
                    >
                      {d.label} · {d.count}
                    </span>
                  ))}
                </p>
              )}
              {format === 'long' && accountGuess > recordCount && recordCount > 0 && (
                <p className="mt-1 text-xs font-medium text-fg-error" role="alert">
                  ⚠️ ดูเหมือนมีราวๆ {accountGuess} บัญชี แต่จะถูกรวมเป็น {recordCount} ก้อน —
                  คั่นแต่ละบัญชีด้วยบรรทัดว่าง 2 บรรทัดติดกัน
                  (บรรทัดว่างเดียวถือว่าอยู่ในบัญชีเดียวกัน)
                </p>
              )}
            </div>

            {/* Preview */}
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-fg">
                📁 สิ่งที่จะได้ในการเพิ่มบัญชี / Value
              </p>
              <p className="mb-2 text-xs text-fg-muted">
                จำนวนไอดีที่จะสร้าง: <span className="font-bold text-fg">{totalNew} ไอดี</span>
                {preview && preview.duplicates ? (
                  <span className="ml-2 text-fg-placeholder">
                    (ข้ามที่ซ้ำอยู่แล้ว {preview.duplicates})
                  </span>
                ) : null}
              </p>
              <div className="max-h-[300px] overflow-y-auto rounded-lg border border-line-subtle bg-surface-elevated p-3">
                {!preview ? (
                  <p className="text-sm text-fg-placeholder">
                    วางข้อมูลแล้วกด &quot;แยกข้อมูล&quot; เพื่อดูตัวอย่างก่อนบันทึก
                  </p>
                ) : totalNew === 0 ? (
                  <p className="text-sm text-fg-error">ไม่พบบัญชีที่แยกได้ — ตรวจรูปแบบอีกครั้ง</p>
                ) : (
                  <>
                  <div className="space-y-2.5">
                    {shownCards.map((card, idx) => (
                      <div
                        key={`${card.variantId}-${idx}`}
                        className="rounded-lg border border-line-subtle bg-surface p-3"
                      >
                        <p className="mb-1 text-sm font-bold text-fg">
                          ไอดี #{idx + 1}
                          {preview.plans.length > 1 && (
                            <span className="ml-2 rounded-full bg-peach-500/10 px-2 py-0.5 text-[11px] font-medium text-fg-brand">
                              {card.label}
                            </span>
                          )}
                        </p>
                        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs text-fg-secondary">
                          {card.code}
                        </pre>
                      </div>
                    ))}
                  </div>
                  {previewCards.length > shownCards.length && (
                    <p className="mt-2 text-center text-xs text-fg-placeholder">
                      แสดง {shownCards.length} จาก {previewCards.length} รายการแรก
                    </p>
                  )}
                  </>
                )}
              </div>
            </div>

            {error && (
              <div className="border-error bg-error mt-3 rounded-lg border px-4 py-2.5 text-sm text-fg-error">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!done && (
          <div className="flex items-center justify-between gap-2 border-t border-line-subtle px-5 py-3">
            <button
              onClick={() => void runPreview()}
              disabled={!dirty || checking}
              className="inline-flex items-center gap-2 rounded-lg border border-line-brand px-4 py-2 text-sm font-semibold text-fg-brand transition-colors hover:bg-peach-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking && <Loader2 size={15} className="animate-spin" />}
              แยกข้อมูล
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setRaw('');
                  setPreview(null);
                  setError(null);
                }}
                className="rounded-lg border border-line-subtle px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-elevated"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => void save()}
                disabled={!preview || totalNew === 0 || saving}
                className="inline-flex items-center gap-2 rounded-lg bg-peach-500 px-5 py-2 text-sm font-semibold text-white transition-transform hover:bg-peach-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                บันทึก
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
