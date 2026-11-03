'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Save, Key, Smartphone, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { safeJson } from '@/lib/json';

import { useSettingsSaver, type RegisterSaver, Section, Field, ToggleSwitch, CopyButton } from '../shared';
import { Slip2GoProbeCard } from './Slip2GoProbeCard';

// ─── Payment Gateway Settings — wired to SiteSetting('payment-gateway') ──
export interface PaymentGatewaySettings {
  promptpayEnabled?: boolean;
  promptpayId?: string | null;
  cardEnabled?: boolean;
  omisePublicKey?: string | null;
  omiseSecretKeyEnv?: string | null;
}

export function PaymentSettings({
  registerSaver,
}: {
  registerSaver: RegisterSaver;
}): React.JSX.Element {
  const [promptpayEnabled, setPromptpayEnabled] = useState(true);
  const [promptpayId, setPromptpayId] = useState('');
  const [cardEnabled, setCardEnabled] = useState(false);
  const [omisePublicKey, setOmisePublicKey] = useState('');
  const [omiseSecretKeyEnv, setOmiseSecretKeyEnv] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/settings/payment-gateway')
      .then(async (r): Promise<PaymentGatewaySettings> => (r.ok ? r.json() : {}))
      .then((data) => {
        if (cancelled) return;
        setPromptpayEnabled(data.promptpayEnabled ?? false);
        setPromptpayId(data.promptpayId ?? '');
        setCardEnabled(data.cardEnabled ?? false);
        setOmisePublicKey(data.omisePublicKey ?? '');
        setOmiseSecretKeyEnv(data.omiseSecretKeyEnv ?? '');
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
    promptpayEnabled,
    promptpayId,
    cardEnabled,
    omisePublicKey,
    omiseSecretKeyEnv,
  }, saveToApi);

  async function saveToApi(): Promise<void> {
    const v = valuesRef.current;
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch('/api/v1/admin/settings/payment-gateway', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptpayEnabled: v.promptpayEnabled,
          promptpayId: v.promptpayId.trim() === '' ? null : v.promptpayId.trim(),
          cardEnabled: v.cardEnabled,
          omisePublicKey: v.omisePublicKey.trim() === '' ? null : v.omisePublicKey.trim(),
          omiseSecretKeyEnv: v.omiseSecretKeyEnv.trim(),
        }),
      });
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(
          data.error === 'INVALID_PROMPTPAY_ID'
            ? 'PromptPay ID ต้องเป็นตัวเลข 13 หลัก'
            : data.error === 'INVALID_OMISE_PUBLIC_KEY'
              ? 'Omise Public Key ต้องขึ้นต้นด้วย pkey_test_ หรือ pkey_live_'
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

  if (loading) {
    return (
      <Section title="การชำระเงิน" subtitle="ตั้งค่าช่องทางการชำระเงินและ Payment Gateway">
        <p className="py-6 text-center text-sm text-fg-muted">กำลังโหลด...</p>
      </Section>
    );
  }

  return (
    <Section title="การชำระเงิน" subtitle="ตั้งค่าช่องทางการชำระเงินและ Payment Gateway">
      {/* PromptPay */}
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-jade-500/15 text-jade-700">
              <Smartphone size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-fg">PromptPay</p>
              <p className="text-xs text-fg-placeholder">สแกน QR Code ชำระเงินผ่านแอปธนาคาร</p>
            </div>
          </div>
          <ToggleSwitch enabled={promptpayEnabled} onChange={setPromptpayEnabled} />
        </div>
        {promptpayEnabled && (
          <div className="mt-4 space-y-3">
            <Field label="PromptPay ID (เลขบัตรประชาชน / กรมสรรพากร)">
              <input
                value={promptpayId}
                onChange={(e) => setPromptpayId(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
              />
            </Field>
            <div className="rounded-md bg-surface p-3 text-xs text-fg-placeholder">
              ตัวเลข 13 หลัก (บัตรประชาชน / เลขนิติบุคคล) — ใช้สร้าง QR ในหน้าชำระเงิน เว้นว่างไว้ =
              ไม่แสดงช่องพร้อมเพย์
            </div>
          </div>
        )}
      </div>

      {/* Credit Card */}
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sapphire-400/15 text-sapphire-700">
              <CreditCard size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-fg">บัตรเครดิต / เดบิต (Omise)</p>
              <p className="text-xs text-fg-placeholder">
                Visa, Mastercard, JCB ผ่าน Omise Gateway
              </p>
            </div>
          </div>
          <ToggleSwitch enabled={cardEnabled} onChange={setCardEnabled} />
        </div>
        {cardEnabled && (
          <div className="mt-4 space-y-3">
            <Field label="Omise Public Key">
              <div className="flex gap-2">
                <input
                  value={omisePublicKey}
                  onChange={(e) => setOmisePublicKey(e.target.value)}
                  placeholder="pkey_test_... หรือ pkey_live_..."
                  className="flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
                />
                <CopyButton text={omisePublicKey} />
              </div>
            </Field>
            <Field label="ชื่อ Environment Variable ของ Secret Key">
              <input
                value={omiseSecretKeyEnv}
                onChange={(e) => setOmiseSecretKeyEnv(e.target.value)}
                placeholder="OMISE_SECRET_KEY"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
              />
            </Field>
            <div className="rounded-md bg-surface p-3 text-xs text-fg-placeholder">
              Secret key ไม่ถูกเก็บในฐานข้อมูล — ระบบอ่านจาก environment variable
              ที่ระบุชื่อไว้ตอนรันจริง (ตั้งได้ใน Vercel → Settings → Environment Variables)
              เพื่อไม่ให้คีย์ลับหลุดออกจาก API นี้
            </div>
          </div>
        )}
      </div>

      {/* Live/test hint — follows the configured public key, not a fixed claim. */}
      {cardEnabled && omisePublicKey.startsWith('pkey_live_') && (
        <div className="flex items-center gap-3 rounded-lg border border-jade-500/40 bg-jade-500/10 p-4">
          <AlertTriangle size={20} className="flex-shrink-0 text-jade-700" />
          <div>
            <p className="text-sm font-medium text-jade-700">โหมดจริง (live)</p>
            <p className="text-xs text-fg-placeholder">
              Public key ขึ้นต้นด้วย pkey_live_ — ระบบจะเรียกเก็บเงินจริงเมื่อชำระผ่านบัตร
            </p>
          </div>
        </div>
      )}
      {cardEnabled && omisePublicKey.startsWith('pkey_test_') && (
        <div className="flex items-center gap-3 rounded-lg border bg-peach-50 p-4">
          <AlertTriangle size={20} className="flex-shrink-0 text-fg-brand" />
          <div>
            <p className="text-sm font-medium text-fg-brand">โหมดทดสอบ (test)</p>
            <p className="text-xs text-fg-placeholder">
              Public key ขึ้นต้นด้วย pkey_test_ — ระบบจะไม่เรียกเก็บเงินจริง
            </p>
          </div>
        </div>
      )}

      <Slip2GoProbeCard />

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
          {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกการชำระเงิน'}
        </button>
      </div>
    </Section>
  );
}
