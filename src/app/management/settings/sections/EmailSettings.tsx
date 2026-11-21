'use client';

import { useState, useEffect } from 'react';
import { Save, CheckCircle2, AlertTriangle } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import { safeJson } from '@/lib/json';

import { useSettingsSaver, type RegisterSaver, Section, ToggleSwitch } from '../shared';

// ─── Email Settings — wired to SiteSetting('email') ──────
// Transport is NOT configured here. The sender and the Resend key come from the
// environment (Infisical → server.js) and are read through '@/lib/email/config',
// so this screen only DISPLAYS them. A second editable copy is exactly what made
// an admin's "saved" sender invisible on the wire (audit finding 2, 2026-10-31).
export interface EmailSettingsData {
  /** Read-only: the From header the mailer actually sends with. */
  liveSender?: string | null;
  emailConfigured?: boolean;
  emailTemplates?: Partial<
    Record<'order_confirm' | 'code_delivery' | 'low_stock' | 'invoice', boolean>
  >;
}

export const EMAIL_TEMPLATES: {
  key: keyof NonNullable<EmailSettingsData['emailTemplates']>;
  name: string;
  desc: string;
}[] = [
  { key: 'order_confirm', name: 'ยืนยันคำสั่งซื้อ', desc: 'ส่งเมื่อลูกค้าชำระเงินสำเร็จ' },
  { key: 'code_delivery', name: 'ส่งโค้ดสินค้า', desc: 'ส่งโค้ดหลังจากทำรายการสำเร็จ' },
  { key: 'low_stock', name: 'แจ้งเตือนสต็อกต่ำ', desc: 'ส่งเมื่อสินค้าใกล้หมด' },
  { key: 'invoice', name: 'ใบแจ้งหนี้ / ใบเสร็จ', desc: 'ส่งใบเสร็จรับเงิน' },
];

export function EmailSettings({
  registerSaver,
}: {
  registerSaver: RegisterSaver;
}): React.JSX.Element {
  const [liveSender, setLiveSender] = useState<string | null>(null);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [templates, setTemplates] = useState<Record<string, boolean>>({
    order_confirm: true,
    code_delivery: true,
    low_stock: true,
    invoice: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/settings/email')
      .then(async (r): Promise<EmailSettingsData> => (r.ok ? r.json() : {}))
      .then((data) => {
        if (cancelled) return;
        setLiveSender(data.liveSender ?? null);
        setEmailConfigured(Boolean(data.emailConfigured));
        setTemplates((t) => ({ ...t, ...(data.emailTemplates ?? {}) }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const valuesRef = useSettingsSaver(registerSaver, { templates }, saveToApi);

  async function saveToApi(): Promise<void> {
    const v = valuesRef.current;
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch('/api/v1/admin/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailTemplates: v.templates }),
      });
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(data.error === 'INVALID_EMAIL_TEMPLATES' ? 'เทมเพลตไม่ถูกต้อง' : 'บันทึกไม่สำเร็จ');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
      throw e;
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Section
        title="การตั้งค่าอีเมล"
        subtitle="ผู้ส่งที่ระบบใช้จริง และเทมเพลตอีเมลที่ส่งให้ลูกค้า"
      >
        <p className="py-6 text-center text-sm text-fg-muted">กำลังโหลด...</p>
      </Section>
    );
  }

  return (
    <Section
      title="การตั้งค่าอีเมล"
      subtitle="ผู้ส่งที่ระบบใช้จริง และเทมเพลตอีเมลที่ส่งให้ลูกค้า"
    >
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-fg-secondary">ผู้ส่งจริง (From)</h3>
            <p className="mt-0.5 text-xs text-clay-400">
              ค่านี้อ่านจาก environment variable <code className="font-mono">NK_RESEND_FROM_EMAIL</code> —
              แก้ที่ Infisical แล้ว restart แอป ไม่ใช่ที่หน้านี้
            </p>
          </div>
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
              emailConfigured
                ? 'bg-jade-500/10 text-fg-success'
                : 'bg-coral-500/10 text-fg-error',
            )}
          >
            {emailConfigured ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
            {emailConfigured ? 'พร้อมส่งอีเมล' : 'ยังไม่พร้อมส่ง'}
          </span>
        </div>
        <p className="mt-3 rounded-md bg-surface-sunken px-3 py-2 font-mono text-sm text-fg">
          {liveSender ?? 'NK_RESEND_FROM_EMAIL ยังไม่ได้ตั้งค่า'}
        </p>
        <p className="mt-3 text-xs text-clay-400">
          ระบบส่งอีเมลผ่าน Resend (HTTP) ไม่ใช่ SMTP — จึงไม่มีช่องกรอก SMTP หรือปุ่มทดสอบ
          การเชื่อมต่อให้ตั้งค่าผิด: การทดสอบที่เชื่อมต่อได้แต่ไม่ได้ส่งอะไรจริงเคยทำให้เข้าใจผิด
        </p>
      </div>

      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-fg-secondary">เทมเพลตอีเมล</h3>
        <div className="space-y-2">
          {EMAIL_TEMPLATES.map((tpl) => (
            <div
              key={tpl.key}
              className="flex items-center justify-between rounded-md bg-surface px-3 py-2"
            >
              <div>
                <p className="text-xs font-medium text-fg-secondary">{tpl.name}</p>
                <p className="text-[10px] text-clay-400">{tpl.desc}</p>
              </div>
              <ToggleSwitch
                enabled={templates[tpl.key] ?? false}
                onChange={(v) => setTemplates((t) => ({ ...t, [tpl.key]: v }))}
              />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="border-error bg-error mt-3 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-fg-error">
          <AlertTriangle size={16} /> {error}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => void saveToApi()}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-peach-400 disabled:opacity-50"
        >
          {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกการตั้งค่าอีเมล'}
        </button>
      </div>
    </Section>
  );
}
