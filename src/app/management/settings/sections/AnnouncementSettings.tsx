'use client';

import { useState, useEffect } from 'react';
import { Save, CheckCircle2, AlertTriangle } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { safeJson } from '@/lib/json';

import { useSettingsSaver, type RegisterSaver, Section, Field, ToggleSwitch } from '../shared';

// ─── Announcement Bar Settings ────────────────────────
export interface AnnouncementContent {
  message: string;
  href: string | null;
  enabled: boolean;
}

export function AnnouncementSettings({
  registerSaver,
}: {
  registerSaver: RegisterSaver;
}): React.JSX.Element {
  const [message, setMessage] = useState('');
  const [href, setHref] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/announcement')
      .then(async (r) => {
        if (!r.ok) throw new Error((await safeJson<{ error?: string }>(r)).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<AnnouncementContent>;
      })
      .then((data) => {
        if (cancelled) return;
        setMessage(data.message);
        setHref(data.href ?? '');
        setEnabled(data.enabled);
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

  const valuesRef = useSettingsSaver(registerSaver, { message, href, enabled }, saveToApi);

  async function saveToApi(): Promise<void> {
    const { message: m, href: h, enabled: en } = valuesRef.current;
    const res = await adminFetch('/api/v1/admin/announcement', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: m.trim(), href: h.trim() || null, enabled: en }),
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

  return (
    <Section
      title="แถบประกาศหน้าเว็บ"
      subtitle="ข้อความที่แสดงในแถบด้านบนสุดของหน้าร้าน — บันทึกแล้วจะแสดงทุกหน้าทันที"
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-fg-placeholder">กำลังโหลด…</p>
      ) : (
        <>
          <Field label="ข้อความประกาศ">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="เช่น 🎉 โปรโมชั่นพิเศษ! HBO Max 7 วัน ลดเหลือ ฿25"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
            />
          </Field>
          <Field label="ลิงก์ (ไม่บังคับ) — เช่น /product/hbo-max-7-4k-4">
            <input
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="/product/..."
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
            />
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-line-subtle bg-surface px-4 py-3">
            <div>
              <p className="text-sm font-medium text-fg-secondary">แสดงแถบประกาศ</p>
              <p className="text-xs text-clay-400">ปิดเพื่อซ่อนแถบทั้งหมดชั่วคราว</p>
            </div>
            <ToggleSwitch enabled={enabled} onChange={setEnabled} />
          </div>

          {/* Live preview */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-placeholder">
              ตัวอย่าง
            </p>
            <div className="rounded-lg bg-gradient-to-r from-peach-400 via-peach-300 to-peach-400 px-4 py-2 text-center">
              <p className="text-sm font-medium text-fg">
                {message || <span className="opacity-60">(ข้อความว่าง)</span>}
                {href && (
                  <>
                    {' — '}
                    <span className="font-bold underline">กดซื้อเลย!</span>
                  </>
                )}
              </p>
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
              className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-peach-400 disabled:opacity-50"
            >
              {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
              {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกประกาศ'}
            </button>
          </div>
        </>
      )}
    </Section>
  );
}
