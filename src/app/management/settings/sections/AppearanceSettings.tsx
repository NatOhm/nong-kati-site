'use client';

import { useState, useEffect, useRef } from 'react';
import { Save, CheckCircle2, AlertTriangle, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import { safeJson } from '@/lib/json';

import { useSettingsSaver, type RegisterSaver, Section, Field } from '../shared';

// ─── Appearance (theme + animation speed) ────────────────

export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'บัตเตอร์สก็อต (เดิม)', hex: '#F97316' },
  { name: 'แฮมสเตอร์ทอง', hex: '#D97706' },
  { name: 'กุหลาบน้ำนม', hex: '#F43F5E' },
  { name: 'เจดแก้ว', hex: '#10B981' },
  { name: 'ฟ้าน้ำนม', hex: '#0EA5E9' },
  { name: 'ม่วงมินต์', hex: '#8B5CF6' },
];

export const SPEED_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: 'slow', label: 'ช้า', desc: 'ขยับนุ่มนวล ชมได้เพลิน ๆ' },
  { value: 'normal', label: 'ปกติ', desc: '550ms — ค่าที่ออกแบบไว้' },
  { value: 'fast', label: 'เร็ว', desc: 'สั้นกระชับ ตอบสนองไว' },
  { value: 'off', label: 'ปิดแอนิเมชัน', desc: 'ทุกอย่างปรากฏทันที' },
];

export function AppearanceSettings({
  registerSaver,
}: {
  registerSaver: RegisterSaver;
}): React.JSX.Element {
  const [accent, setAccent] = useState('#F97316');
  const [speed, setSpeed] = useState('normal');
  const [mascotUrl, setMascotUrl] = useState<string | null>(null);
  const [mascotBusy, setMascotBusy] = useState(false);
  const mascotInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/settings/appearance')
      .then(async (r) => {
        if (!r.ok) throw new Error((await safeJson<{ error?: string }>(r)).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<{
          accent?: string | null;
          speed?: string;
          mascotUrl?: string | null;
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.accent) setAccent(data.accent);
        if (data.speed) setSpeed(data.speed);
        if (data.mascotUrl !== undefined) setMascotUrl(data.mascotUrl);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const valuesRef = useSettingsSaver(registerSaver, { accent, speed }, saveToApi);

  async function saveToApi(): Promise<void> {
    const { accent: a, speed: s } = valuesRef.current;
    const res = await adminFetch('/api/v1/admin/settings/appearance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accent: a, speed: s }),
    });
    if (!res.ok) {
      const data = await safeJson<{ error?: string }>(res);
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveToApi();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  /** Mascot image ops save immediately (image op, not part of the form save). */
  async function saveMascot(url: string | null): Promise<void> {
    const { accent: a, speed: s } = valuesRef.current;
    const res = await adminFetch('/api/v1/admin/settings/appearance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accent: a, speed: s, mascotUrl: url }),
    });
    if (!res.ok) {
      const data = await safeJson<{ error?: string }>(res);
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  }

  async function uploadMascot(file: File): Promise<void> {
    setMascotBusy(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });
      const up = await adminFetch('/api/v1/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      if (!up.ok) {
        const data = await safeJson<{ error?: string; message?: string }>(up);
        throw new Error(data.message ?? data.error ?? `HTTP ${up.status}`);
      }
      const { path } = (await up.json()) as { path: string };
      await saveMascot(path);
      setMascotUrl(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปโหลดมาสคอตไม่สำเร็จ');
    } finally {
      setMascotBusy(false);
    }
  }

  async function removeMascot(): Promise<void> {
    setMascotBusy(true);
    setError(null);
    try {
      await saveMascot(null);
      setMascotUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ลบมาสคอตไม่สำเร็จ');
    } finally {
      setMascotBusy(false);
    }
  }

  return (
    <Section
      title="ธีมและแอนิเมชัน"
      subtitle="เปลี่ยนสีหลักของเว็บและความเร็วแอนิเมชัน — บันทึกแล้วมีผลทันทีกับทุกหน้า"
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-fg-placeholder">กำลังโหลด…</p>
      ) : (
        <>
          <Field label="สีหลัก (Accent)">
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  onClick={() => setAccent(p.hex)}
                  title={p.name}
                  className={cn(
                    'h-10 w-10 rounded-full border-2 transition-transform hover:scale-110',
                    accent.toLowerCase() === p.hex.toLowerCase()
                      ? 'border-fg shadow-md ring-2 ring-peach-300 ring-offset-2'
                      : 'border-line-subtle',
                  )}
                  style={{ backgroundColor: p.hex }}
                  aria-label={p.name}
                  aria-pressed={accent.toLowerCase() === p.hex.toLowerCase()}
                />
              ))}
              <label
                className={cn(
                  'flex h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs text-fg-secondary hover:bg-surface',
                  !ACCENT_PRESETS.some((p) => p.hex.toLowerCase() === accent.toLowerCase())
                    ? 'border-fg ring-2 ring-peach-300 ring-offset-2'
                    : 'border-line-subtle',
                )}
              >
                <span
                  className="h-5 w-5 rounded-full border border-line-subtle"
                  style={{ backgroundColor: accent }}
                />
                กำหนดเอง
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="sr-only"
                />
              </label>
            </div>
          </Field>

          <Field label="ความเร็วแอนิเมชัน">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSpeed(opt.value)}
                  className={cn(
                    'transition-smart rounded-lg border px-3 py-3 text-left',
                    speed === opt.value
                      ? 'border-peach-500 bg-peach-50 ring-1 ring-peach-500'
                      : 'border-line-subtle hover:bg-surface',
                  )}
                  aria-pressed={speed === opt.value}
                >
                  <p className="text-sm font-semibold text-fg">{opt.label}</p>
                  <p className="text-[10px] text-fg-placeholder">{opt.desc}</p>
                </button>
              ))}
            </div>
          </Field>

          <Field label="มาสคอตของเว็บ (แฮมสเตอร์)">
            <div className="flex flex-wrap items-center gap-4">
              {/* Current mascot preview */}
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-line-subtle bg-surface">
                {mascotUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mascotUrl}
                    alt="มาสคอตปัจจุบัน"
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <span className="text-3xl" aria-hidden="true">
                    🐹
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs text-fg-placeholder">
                  {mascotUrl
                    ? 'ใช้รูปที่อัปโหลดแล้ว — โลโก้บนแถบเมนูและแฮมสเตอร์ทุกจุด (หน้าแรก, ตะกร้า, ชำระเงิน, toast)'
                    : 'ยังใช้แฮมสเตอร์ตัวเดิม — อัปโหลดรูป PNG/JPG/WebP/GIF (สูงสุด 5MB) เพื่อเปลี่ยนโลโก้และมาสคอต'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => mascotInput.current?.click()}
                    disabled={mascotBusy}
                    className="flex items-center gap-2 rounded-lg border border-line-subtle bg-surface px-3 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-brand-subtle disabled:opacity-50"
                  >
                    {mascotBusy ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <ImageIcon size={15} />
                    )}
                    {mascotUrl ? 'เปลี่ยนรูป' : 'อัปโหลดรูปมาสคอต'}
                  </button>
                  {mascotUrl && (
                    <button
                      type="button"
                      onClick={() => void removeMascot()}
                      disabled={mascotBusy}
                      className="hover:bg-error flex items-center gap-2 rounded-lg border border-coral-300 px-3 py-2 text-sm font-semibold text-fg-error transition-colors disabled:opacity-50 dark:border-coral-700 dark:text-coral-300 dark:hover:bg-coral-900/20"
                    >
                      <Trash2 size={15} /> ใช้แฮมสเตอร์เดิม
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={mascotInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadMascot(f);
                }}
              />
            </div>
          </Field>

          {/* Live preview */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-placeholder">
              ตัวอย่าง
            </p>
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line-subtle bg-surface p-4">
              <button
                className="rounded-full px-5 py-2 text-sm font-semibold text-white shadow-clay-brand transition-transform hover:scale-[1.03] active:scale-95"
                style={{ backgroundColor: accent }}
              >
                ปุ่มซื้อสินค้า
              </button>
              <div className="h-4 w-32 overflow-hidden rounded-full bg-surface">
                <div
                  className="transition-smart h-full rounded-full duration-700"
                  style={{ width: '72%', backgroundColor: accent }}
                />
              </div>
              <span className="text-sm font-bold" style={{ color: accent }}>
                ฿25 ลดเหลือ ฿19
              </span>
            </div>
          </div>

          {error && (
            <div className="border-error bg-error flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-fg-error">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-peach-400 disabled:opacity-50"
            >
              {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
              {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกธีม'}
            </button>
          </div>
        </>
      )}
    </Section>
  );
}
