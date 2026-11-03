'use client';

import { useState, useEffect } from 'react';
import { Save, CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import { safeJson } from '@/lib/json';
import type { SmtpProbeResult } from '@/lib/email/smtpProbe';

import { useSettingsSaver, type RegisterSaver, Section, Field, ToggleSwitch } from '../shared';

// ─── Email Settings — wired to SiteSetting('email') ──────
export interface EmailSettingsData {
  smtpHost?: string | null;
  smtpPort?: number;
  smtpUser?: string | null;
  smtpPasswordEnv?: string | null;
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
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPasswordEnv, setSmtpPasswordEnv] = useState('');
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
        setSmtpHost(data.smtpHost ?? '');
        setSmtpPort(String(data.smtpPort ?? 587));
        setSmtpUser(data.smtpUser ?? '');
        setSmtpPasswordEnv(data.smtpPasswordEnv ?? '');
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

  const valuesRef = useSettingsSaver(registerSaver, {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPasswordEnv,
    templates,
  }, saveToApi);

  async function saveToApi(): Promise<void> {
    const v = valuesRef.current;
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch('/api/v1/admin/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: v.smtpHost.trim() === '' ? null : v.smtpHost.trim(),
          smtpPort: Number(v.smtpPort) || 0,
          smtpUser: v.smtpUser.trim() === '' ? null : v.smtpUser.trim(),
          smtpPasswordEnv: v.smtpPasswordEnv.trim(),
          emailTemplates: v.templates,
        }),
      });
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(
          data.error === 'INVALID_SMTP_PORT'
            ? 'SMTP Port ต้องเป็นตัวเลข 1-65535'
            : data.error === 'INVALID_ENV_VAR_NAME'
                ? 'ชื่อ environment variable ต้องเป็น A-Z ตัวใหญ่ ตัวเลข และ _ เท่านั้น'
                : 'บันทึกไม่สำเร็จ',
        );
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

  // ── Test connection (SMTP probe) — uses the values TYPED in the form;
  // no save required. The route fills gaps from the saved settings.
  const [probe, setProbe] = useState<SmtpProbeResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  async function runConnectionTest(): Promise<void> {
    setTesting(true);
    setTestError(null);
    setProbe(null);
    try {
      const res = await adminFetch('/api/v1/admin/settings/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: smtpHost.trim() || undefined,
          smtpPort: Number(smtpPort) || undefined,
          smtpUser: smtpUser.trim() || undefined,
          smtpPasswordEnv: smtpPasswordEnv.trim() || undefined,
        }),
      });
      const data = await safeJson<Record<string, unknown>>(res);
      if (!res.ok) {
        setTestError(
          data['error'] === 'SMTP_NOT_CONFIGURED'
            ? 'กรอก SMTP Host และ Port ก่อนทดสอบ'
            : data['error'] === 'INVALID_SMTP_HOST'
              ? 'ชื่อโฮสต์ไม่ถูกต้อง'
              : data['error'] === 'INVALID_ENV_VAR_NAME'
                ? 'ชื่อ environment variable ต้องเป็น A-Z ตัวใหญ่ ตัวเลข และ _ เท่านั้น'
                : 'ทดสอบไม่สำเร็จ',
        );
        return;
      }
      setProbe(data as unknown as SmtpProbeResult);
    } catch {
      setTestError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <Section title="การตั้งค่าอีเมล" subtitle="ตั้งค่า SMTP และรูปแบบอีเมลที่ส่งให้ลูกค้า">
        <p className="py-6 text-center text-sm text-fg-muted">กำลังโหลด...</p>
      </Section>
    );
  }

  return (
    <Section title="การตั้งค่าอีเมล" subtitle="ตั้งค่า SMTP และรูปแบบอีเมลที่ส่งให้ลูกค้า">
      <div className="grid grid-cols-2 gap-4">
        <Field label="SMTP Host">
          <input
            value={smtpHost}
            onChange={(e) => setSmtpHost(e.target.value)}
            placeholder="smtp.resend.com"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
          />
        </Field>
        <Field label="SMTP Port">
          <input
            value={smtpPort}
            onChange={(e) => setSmtpPort(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
          />
        </Field>
      </div>
      <Field label="SMTP Username">
        <input
          value={smtpUser}
          onChange={(e) => setSmtpUser(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
        />
      </Field>
      <Field label="ชื่อ Environment Variable ของรหัสผ่าน SMTP">
        <input
          value={smtpPasswordEnv}
          onChange={(e) => setSmtpPasswordEnv(e.target.value)}
          placeholder="SMTP_PASSWORD"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
        />
        <p className="mt-1 text-xs text-clay-400">
          รหัสผ่าน SMTP ไม่ถูกเก็บในฐานข้อมูล — ระบบอ่านจาก environment variable ที่ระบุชื่อไว้
        </p>
      </Field>
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
                ? 'bg-success-500/10 text-fg-success'
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
      </div>

      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-fg-secondary">ทดสอบการเชื่อมต่อ SMTP</h3>
            <p className="mt-0.5 text-xs text-clay-400">
              ทดสอบ DNS → TCP → Greeting → EHLO ด้วยค่าในฟอร์ม (ไม่ต้องบันทึกก่อน) —
              ไม่มีการส่งอีเมลจริง
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runConnectionTest()}
            disabled={testing}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-fg transition-colors hover:border-peach-400 disabled:opacity-50"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {testing ? 'กำลังทดสอบ…' : 'ทดสอบการเชื่อมต่อ'}
          </button>
        </div>
        {testError && (
          <p className="mt-3 rounded-md bg-coral-500/10 px-3 py-2 text-sm text-fg-error">
            {testError}
          </p>
        )}
        {probe && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {probe.ok ? (
                <span className="flex items-center gap-1.5 font-semibold text-fg-success">
                  <CheckCircle2 size={16} /> เชื่อมต่อสำเร็จ ({probe.latencyMs} ms)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-semibold text-fg-error">
                  <AlertTriangle size={16} /> เชื่อมต่อไม่สำเร็จ
                  {probe.error ? ` — ${probe.error}` : ''}
                </span>
              )}
            </div>
            <ul className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
              {(
                [
                  ['DNS', probe.steps.dns],
                  ['TCP', probe.steps.tcp],
                  ['Greeting', probe.steps.greeting],
                  ['EHLO', probe.steps.ehlo],
                ] as const
              ).map(([label, passed]) => (
                <li
                  key={label}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
                    passed ? 'bg-jade-500/15 text-fg-success' : 'bg-coral-500/15 text-fg-error',
                  )}
                >
                  {passed ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {label}
                </li>
              ))}
            </ul>
            {probe.ok && (
              <p className="text-xs text-clay-400">
                STARTTLS: {probe.capabilities.starttls ? 'รองรับ' : 'ไม่รองรับ'} · AUTH:{' '}
                {probe.capabilities.auth ? 'รองรับ' : 'ไม่รองรับ'}
              </p>
            )}
          </div>
        )}
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
