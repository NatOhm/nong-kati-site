'use client';

import { useState, useEffect, useRef } from 'react';
import { Banknote, Save, CheckCircle2, AlertTriangle, Trash2, Image as ImageIcon, Loader2, QrCode } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import { safeJson } from '@/lib/json';

import { useSettingsSaver, type RegisterSaver, Section, Field, ToggleSwitch } from '../shared';

// ─── Payment Settings ─────────────────────────────────────
export interface ManualTransferForm {
  enabled: boolean;
  accountType: 'promptpay' | 'bank';
  accountName: string;
  accountNumber: string;
  bankName: string;
  qrImageUrl: string | null;
}

/**
 * Manual transfer instructions shown in checkout while the real Omise
 * gateway is not implemented (review High #2). Persisted via
 * /api/v1/admin/settings/manual-transfer (SiteSetting 'manual-transfer').
 */
export function ManualTransferSettings({
  registerSaver,
}: {
  registerSaver: RegisterSaver;
}): React.JSX.Element {
  const [form, setForm] = useState<ManualTransferForm>({
    enabled: false,
    accountType: 'promptpay',
    accountName: '',
    accountNumber: '',
    bankName: '',
    qrImageUrl: null,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const qrInput = useRef<HTMLInputElement>(null);

  /** Upload the shop's static bank QR via /admin/upload, then keep the
   * returned path in the form (persisted on the next Save). */
  async function uploadQr(file: File): Promise<void> {
    setQrBusy(true);
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
      set('qrImageUrl', path);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปโหลดภาพ QR ไม่สำเร็จ');
    } finally {
      setQrBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/settings/manual-transfer')
      .then(async (r) => {
        if (!r.ok) throw new Error((await safeJson<{ error?: string }>(r)).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<Partial<ManualTransferForm>>;
      })
      .then((data) => {
        if (cancelled) return;
        setForm((f) => ({
          ...f,
          enabled: data.enabled ?? f.enabled,
          accountType: data.accountType === 'bank' ? 'bank' : f.accountType,
          accountName: data.accountName ?? f.accountName,
          accountNumber: data.accountNumber ?? f.accountNumber,
          bankName: data.bankName ?? f.bankName,
          qrImageUrl: data.qrImageUrl ?? null,
        }));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function set<K extends keyof ManualTransferForm>(field: K, value: ManualTransferForm[K]): void {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // The header buttons call this too, so read the latest form values.
  const formRef = useSettingsSaver(registerSaver, form, saveToApi);

  async function saveToApi(): Promise<void> {
    const form = formRef.current;
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch('/api/v1/admin/settings/manual-transfer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: form.enabled,
          accountType: form.accountType,
          accountName: form.accountName,
          accountNumber: form.accountNumber,
          bankName: form.bankName,
          qrImageUrl: form.qrImageUrl,
        }),
      });
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(
          data.error === 'INVALID_QR_IMAGE_URL'
            ? 'พาธรูป QR ไม่ถูกต้อง — ต้องเป็นไฟล์ที่อัปโหลดผ่านระบบเท่านั้น'
            : (data.error ?? `HTTP ${res.status}`),
        );
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
      // Rethrow so the header button can report the failure too.
      throw e;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="โอนเงินแมนนวล"
      subtitle="บัญชีที่ลูกค้าใช้โอนเงินในหน้าชำระเงิน — เปิดใช้งานเพื่อแสดงบัญชีและช่องอัปโหลดสลิป"
    >
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-jade-500/15 text-jade-700">
              <Banknote size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-fg">โอนเงินแล้วส่งสลิป</p>
              <p className="text-xs text-fg-placeholder">
                ลูกค้าเห็นเลขบัญชีในขั้นตอนชำระเงิน โอนแล้วอัปโหลดสลิปให้แอดมินยืนยัน
              </p>
            </div>
          </div>
          <ToggleSwitch enabled={form.enabled} onChange={(v) => set('enabled', v)} />
        </div>

        {form.enabled && (
          <div className="mt-4 space-y-3">
            <Field label="ประเภทบัญชี">
              <div className="flex gap-2" role="radiogroup" aria-label="ประเภทบัญชี">
                {(
                  [
                    { value: 'promptpay', label: 'พร้อมเพย์' },
                    { value: 'bank', label: 'เลขบัญชีธนาคาร' },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                      form.accountType === opt.value
                        ? 'border-peach-500 bg-peach-50 text-fg'
                        : 'border-line bg-surface text-fg-muted hover:border-line-brand',
                    )}
                  >
                    <input
                      type="radio"
                      name="manual-transfer-type"
                      value={opt.value}
                      checked={form.accountType === opt.value}
                      onChange={() => set('accountType', opt.value)}
                      className="h-4 w-4 text-fg-brand focus:ring-peach-500"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="ชื่อบัญชี">
              <input
                value={form.accountName}
                onChange={(e) => set('accountName', e.target.value)}
                placeholder="ชื่อ-นามสกุล เจ้าของบัญชี"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
              />
            </Field>
            <Field
              label={
                form.accountType === 'bank' ? 'เลขบัญชีธนาคาร' : 'เบอร์พร้อมเพย์ / เลขบัตรประชาชน'
              }
            >
              <input
                value={form.accountNumber}
                onChange={(e) => set('accountNumber', e.target.value)}
                placeholder={form.accountType === 'bank' ? '000-0-00000-0' : '0800000000'}
                inputMode="numeric"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
              />
            </Field>
            {form.accountType === 'bank' && (
              <Field label="ชื่อธนาคาร">
                <input
                  value={form.bankName}
                  onChange={(e) => set('bankName', e.target.value)}
                  placeholder="เช่น ธนาคารกสิกรไทย"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
                />
              </Field>
            )}
            <Field label="ภาพ QR ของร้าน (ไม่บังคับ)">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl border border-line-subtle bg-surface">
                  {form.qrImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.qrImageUrl}
                      alt="ภาพ QR ที่ใช้ในหน้าชำระเงิน"
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <QrCode size={28} className="text-fg-placeholder" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-xs text-fg-placeholder">
                    {form.qrImageUrl
                      ? 'แสดงภาพนี้ข้างข้อมูลบัญชีในหน้าชำระเงิน — ใช้ QR ที่ธนาคารออกให้กับบัญชีดิบ (ไม่ฝังยอด)'
                      : 'อัปโหลดภาพ QR ที่ธนาคารออกให้กับบัญชี (PNG/JPG/WebP สูงสุด 5MB) — ลูกค้าสแกนแล้วกรอกยอดเอง'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => qrInput.current?.click()}
                      disabled={qrBusy}
                      className="flex items-center gap-2 rounded-lg border border-line-subtle bg-surface px-3 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-brand-subtle disabled:opacity-50"
                    >
                      {qrBusy ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <ImageIcon size={15} />
                      )}
                      {form.qrImageUrl ? 'เปลี่ยนภาพ QR' : 'อัปโหลดภาพ QR'}
                    </button>
                    {form.qrImageUrl && (
                      <button
                        type="button"
                        onClick={() => set('qrImageUrl', null)}
                        disabled={qrBusy}
                        className="hover:bg-error flex items-center gap-2 rounded-lg border border-coral-300 px-3 py-2 text-sm font-semibold text-fg-error transition-colors disabled:opacity-50 dark:border-coral-700 dark:text-coral-300 dark:hover:bg-coral-900/20"
                      >
                        <Trash2 size={15} /> ลบภาพ QR
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={qrInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void uploadQr(f);
                  }}
                />
              </div>
            </Field>
            <div className="rounded-md bg-surface p-3 text-xs text-fg-placeholder">
              ข้อมูลนี้จะแสดงในขั้นตอนชำระเงินของลูกค้า (ช่อง “PromptPay / Thai QR”)
              พร้อมปุ่มอัปโหลดสลิป
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="border-error bg-error mt-3 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-fg-error">
          <AlertTriangle size={16} /> {error}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => {
            // The header button needs saveToApi to reject; here the panel's
            // own error box already shows the reason.
            void saveToApi().catch(() => {});
          }}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-peach-400 disabled:opacity-50"
        >
          {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกข้อมูลโอนเงิน'}
        </button>
      </div>
    </Section>
  );
}
