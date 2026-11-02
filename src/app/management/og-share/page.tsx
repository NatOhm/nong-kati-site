'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Save, Trash2 } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { Skeleton } from '@/components/ui/Skeleton';
import { adminJson } from '@/lib/adminSession';
import {
  DEFAULT_OG_SHARE,
  OG_SHARE_CHANNEL_MAX,
  OG_SHARE_HEADING_MAX,
  OG_SHARE_META_DESC_MAX,
  OG_SHARE_META_TITLE_MAX,
  OG_SHARE_PILL_MAX,
  type OgShareSettings,
} from '@/lib/ogShareSettings';
import { cn } from '@/utils/cn';

type FieldKey = Exclude<keyof OgShareSettings, 'imageUrl'>;

interface FieldSpec {
  key: FieldKey;
  label: string;
  hint: string;
  max: number;
}

/** Left side of the card — headline, brand chips, trust pills. */
const CARD_FIELDS: FieldSpec[] = [
  { key: 'headingLine1', label: 'หัวข้อบรรทัดที่ 1', hint: 'เช่น แอคดูหนัง ซีรีส์', max: OG_SHARE_HEADING_MAX },
  { key: 'headingLine2', label: 'หัวข้อบรรทัดที่ 2', hint: 'เช่น ส่งถึงอีเมลทันที', max: OG_SHARE_HEADING_MAX },
  { key: 'channels', label: 'รายชื่อแอป (คั่นด้วย ·)', hint: 'เช่น Netflix · Spotify · YouTube', max: OG_SHARE_CHANNEL_MAX },
  { key: 'pill1', label: 'ป้ายที่ 1 (สีส้ม)', hint: 'เช่น โอนเงิน · ตรวจสลิป', max: OG_SHARE_PILL_MAX },
  { key: 'pill2', label: 'ป้ายที่ 2 (สีน้ำตาล)', hint: 'เช่น ส่งโค้ดทันที', max: OG_SHARE_PILL_MAX },
];

/** What LINE/Facebook/Discord show under the link (and what Google quotes). */
const META_FIELDS: FieldSpec[] = [
  { key: 'ogTitle', label: 'หัวข้อตอนแชร์ (og:title)', hint: 'ขึ้นต้นด้วยชื่อร้าน เช่น Nong-Kati — …', max: OG_SHARE_META_TITLE_MAX },
  { key: 'ogDescription', label: 'คำอธิบายตอนแชร์ (og:description)', hint: 'ประโยคขายของ 1 บรรทัด ใต้หัวข้อ', max: OG_SHARE_META_DESC_MAX },
];

function FieldRow({
  spec,
  value,
  disabled,
  onChange,
}: {
  spec: FieldSpec;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-fg-secondary" htmlFor={`og-${spec.key}`}>
          {spec.label}
        </label>
        <span className="text-xs tabular-nums text-fg-placeholder" aria-hidden="true">
          {value.length}/{spec.max}
        </span>
      </div>
      <input
        id={`og-${spec.key}`}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={spec.max}
        disabled={disabled}
        placeholder={spec.hint}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:ring-2 focus:ring-peach-500 disabled:opacity-60"
      />
      <p className="mt-1 text-xs text-fg-placeholder">{spec.hint}</p>
    </div>
  );
}

export default function OgSharePage(): React.JSX.Element {
  const [form, setForm] = useState<OgShareSettings>({ ...DEFAULT_OG_SHARE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminJson<OgShareSettings>('/api/v1/admin/settings/og-share');
      setForm({ ...DEFAULT_OG_SHARE, ...data });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (key: FieldKey, value: string): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const persist = (next: OgShareSettings): Promise<unknown> =>
    adminJson('/api/v1/admin/settings/og-share', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await persist(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  /** The picture saves immediately — an image op, not part of the text save. */
  async function uploadCard(file: File): Promise<void> {
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });
      const up = await adminJson<{ path: string }>('/api/v1/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      const next: OgShareSettings = { ...form, imageUrl: up.path };
      await persist(next);
      setForm(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปโหลดรูปการ์ดไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  async function removeCard(): Promise<void> {
    setUploading(true);
    setError(null);
    try {
      const next: OgShareSettings = { ...form, imageUrl: null };
      await persist(next);
      setForm(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ลบรูปการ์ดไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  const disabled = loading || saving;

  return (
    <AdminShell
      staffRole="super_admin"
      breadcrumbs={[
        { label: 'ตั้งค่า', href: '/management/settings' },
        { label: 'รูปแชร์ลิงก์ (OG)' },
      ]}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">รูปแชร์ลิงก์ (OG)</h1>
            <p className="mt-1 text-sm text-fg-placeholder">
              การ์ดตอนแปะลิงก์ใน LINE / Facebook / Discord และหัวข้อตอนแชร์หน้าแรก —
              แก้แล้วบันทึก ใช้ทันที
            </p>
          </div>
          <button
            onClick={() => void handleSave()}
            disabled={disabled}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
              !disabled
                ? 'bg-peach-500 text-white hover:bg-peach-400'
                : 'cursor-not-allowed bg-surface text-fg-placeholder',
            )}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึก'}
          </button>
        </div>

        {error && (
          <div className="border-error bg-error rounded-lg border px-4 py-3 text-sm text-fg-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-live="polite">
            <span className="sr-only">กำลังโหลดการตั้งค่ารูปแชร์ลิงก์…</span>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Card artwork — uploaded, or the drawn clay card when unset. */}
            <section className="space-y-3 rounded-xl border border-line-subtle bg-surface px-4 py-4">
              <div>
                <h2 className="text-sm font-semibold text-fg">รูปการ์ด</h2>
                <p className="mt-0.5 text-xs text-fg-placeholder">
                  แนะนำ 1200×630 px (PNG/JPG/WebP สูงสุด 5MB) — เว้นว่างไว้ = ใช้การ์ดที่ระบบวาดให้
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {form.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin upload served immutable
                  <img
                    src={form.imageUrl}
                    alt="รูปการ์ดที่ใช้อยู่"
                    className="aspect-[1200/630] w-40 rounded-lg border border-line-subtle object-cover"
                  />
                ) : (
                  <div className="flex aspect-[1200/630] w-40 items-center justify-center rounded-lg border border-dashed border-line px-3 text-center text-xs text-fg-placeholder">
                    ยังไม่ได้อัปโหลด
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || loading}
                    className="flex items-center gap-2 rounded-lg border border-line-subtle bg-surface px-3 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-sunken disabled:opacity-50"
                  >
                    {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                    {form.imageUrl ? 'เปลี่ยนรูป' : 'อัปโหลดรูปการ์ด'}
                  </button>
                  {form.imageUrl && (
                    <button
                      type="button"
                      onClick={() => void removeCard()}
                      disabled={uploading}
                      className="hover:bg-error flex items-center gap-2 rounded-lg border border-coral-300 px-3 py-2 text-sm font-semibold text-fg-error transition-colors disabled:opacity-50 dark:border-coral-700 dark:text-coral-300 dark:hover:bg-coral-900/20"
                    >
                      <Trash2 size={15} /> ใช้การ์ดที่ระบบวาด
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void uploadCard(f);
                  }}
                />
              </div>
            </section>

            {/* Live preview — text-only mock of the 1200×630 card, not a screenshot. */}
            <div
              aria-hidden="true"
              className="overflow-hidden rounded-xl border border-line-subtle p-6"
              style={{
                background: 'linear-gradient(135deg, #FFF7ED 0%, #FFE8D0 48%, #FDBA74 100%)',
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9A3412]">
                ตัวอย่างการ์ด
              </p>
              <p className="mt-3 text-2xl font-bold leading-tight text-[#431407]">
                {form.headingLine1}
                <br />
                {form.headingLine2}
              </p>
              <p className="mt-2 text-sm font-medium text-[#9A3412]">{form.channels}</p>
              <div className="mt-3 flex gap-2">
                <span className="rounded-full bg-[#EA580C] px-4 py-1.5 text-xs font-semibold text-white">
                  {form.pill1}
                </span>
                <span className="rounded-full bg-[#4E3820] px-4 py-1.5 text-xs font-semibold text-[#FFEDD5]">
                  {form.pill2}
                </span>
              </div>
            </div>

            <section className="space-y-4 rounded-xl border border-line-subtle bg-surface px-4 py-4">
              <div>
                <h2 className="text-sm font-semibold text-fg">ข้อความในการ์ด</h2>
                <p className="mt-0.5 text-xs text-fg-placeholder">
                  เว้นว่าง = ใช้ข้อความเริ่มต้นเดิม
                </p>
              </div>
              {CARD_FIELDS.map((spec) => (
                <FieldRow
                  key={spec.key}
                  spec={spec}
                  value={form[spec.key]}
                  disabled={disabled}
                  onChange={(v) => setField(spec.key, v)}
                />
              ))}
            </section>

            <section className="space-y-4 rounded-xl border border-line-subtle bg-surface px-4 py-4">
              <div>
                <h2 className="text-sm font-semibold text-fg">รายละเอียดตอนแชร์ลิงก์หน้าแรก</h2>
                <p className="mt-0.5 text-xs text-fg-placeholder">
                  ขึ้นใน LINE / Facebook / Discord และค้นหา Google — เว้นว่าง = ใช้ข้อความเริ่มต้นเดิม
                </p>
              </div>
              {META_FIELDS.map((spec) => (
                <FieldRow
                  key={spec.key}
                  spec={spec}
                  value={form[spec.key]}
                  disabled={disabled}
                  onChange={(v) => setField(spec.key, v)}
                />
              ))}
            </section>

            <p className="text-xs text-fg-placeholder">
              ตัวอย่างด้านบนเป็นข้อความล้วน — การ์ดจริงที่ LINE/Facebook เห็นคือรูปการ์ดที่อัปโหลดไว้
              (หรือการ์ดที่ระบบวาดให้เมื่อยังไม่ได้อัปโหลด)
            </p>
          </>
        )}
      </div>
    </AdminShell>
  );
}
