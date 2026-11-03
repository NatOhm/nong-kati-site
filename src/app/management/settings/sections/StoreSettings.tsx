'use client';

import { useState, useEffect } from 'react';
import { Store, Save, CheckCircle2, AlertTriangle } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { safeJson } from '@/lib/json';

import { useSettingsSaver, type RegisterSaver, Section, Field } from '../shared';

// ─── Store Settings ───────────────────────────────────────

export interface StoreInfoForm {
  name: string;
  description: string;
  email: string;
  phone: string;
  line: string;
  lineUrl: string;
  facebook: string;
}

export function StoreSettings({
  registerSaver,
}: {
  registerSaver: RegisterSaver;
}): React.JSX.Element {
  const [form, setForm] = useState<StoreInfoForm>({
    name: '',
    description: '',
    email: '',
    phone: '',
    line: '',
    lineUrl: '',
    facebook: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/settings/store-info')
      .then(async (r) => {
        if (!r.ok) throw new Error((await safeJson<{ error?: string }>(r)).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<Partial<StoreInfoForm>>;
      })
      .then((data) => {
        if (cancelled) return;
        setForm((f) => ({
          ...f,
          name: data.name ?? f.name,
          description: data.description ?? f.description,
          email: data.email ?? f.email,
          phone: data.phone ?? f.phone,
          line: data.line ?? f.line,
          lineUrl: data.lineUrl ?? f.lineUrl,
          facebook: data.facebook ?? f.facebook,
        }));
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

  function set(field: keyof StoreInfoForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const formRef = useSettingsSaver(registerSaver, form, saveToApi);

  async function saveToApi(): Promise<void> {
    const res = await adminFetch('/api/v1/admin/settings/store-info', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formRef.current),
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
      title="การตั้งค่าร้านค้า"
      subtitle="ข้อมูลที่แสดงในฟุตเตอร์และหน้าติดต่อ — เว้นว่างเพื่อใช้ค่าเริ่มต้น"
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-fg-placeholder">กำลังโหลด…</p>
      ) : (
        <>
          <Field label="ชื่อร้านค้า">
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Nong-Kati"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
            />
          </Field>
          <Field label="คำอธิบายร้านค้า">
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              placeholder="ซื้อแอคดูหนัง ซีรีส์ Netflix Spotify และอื่นๆ ได้ที่ Nong-Kati ส่งโค้ดทันที"
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="อีเมลติดต่อ">
              <input
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder=""
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
              />
            </Field>
            <Field label="เบอร์โทรศัพท์">
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder=""
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="LINE ID">
              <input
                value={form.line}
                onChange={(e) => set('line', e.target.value)}
                placeholder=""
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
              />
            </Field>
            <Field label="ลิงก์ LINE Official Account (lin.ee หรือ line.me)">
              <input
                value={form.lineUrl}
                onChange={(e) => set('lineUrl', e.target.value)}
                placeholder=""
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Facebook Page">
              <input
                value={form.facebook}
                onChange={(e) => set('facebook', e.target.value)}
                placeholder="https://facebook.com/..."
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
              />
            </Field>
          </div>

          {error && (
            <div className="border-error bg-error flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-fg-error">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-peach-400 disabled:opacity-50"
            >
              {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
              {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกข้อมูลร้าน'}
            </button>
          </div>
        </>
      )}
    </Section>
  );
}
