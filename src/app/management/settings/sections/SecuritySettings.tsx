'use client';

import { useState, useEffect } from 'react';
import { Shield, Save, Key, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';

import { adminFetch } from '@/lib/adminSession';
import { safeJson } from '@/lib/json';

import { useSettingsSaver, type RegisterSaver, Section, Field } from '../shared';
import { ChangePassword } from './ChangePassword';

// ─── Security Settings ────────────────────────────────────
export interface SecuritySettingsData {
  lockoutMaxAttempts?: number;
  lockoutMinutes?: number;
  passwordMinLength?: number;
  pwRequireUpper?: boolean;
  pwRequireLower?: boolean;
  pwRequireDigit?: boolean;
  pwRequireSpecial?: boolean;
}

export interface AdminMeData {
  activeSessions?: number;
}

export const PW_RULES = [
  { key: 'pwRequireUpper' as const, label: 'ตัวพิมพ์ใหญ่' },
  { key: 'pwRequireLower' as const, label: 'ตัวพิมพ์เล็ก' },
  { key: 'pwRequireDigit' as const, label: 'ตัวเลข' },
  { key: 'pwRequireSpecial' as const, label: 'อักขระพิเศษ' },
];

export function SecuritySettings({
  registerSaver,
}: {
  registerSaver: RegisterSaver;
}): React.JSX.Element {
  const [lockoutMaxAttempts, setLockoutMaxAttempts] = useState('5');
  const [lockoutMinutes, setLockoutMinutes] = useState('15');
  const [passwordMinLength, setPasswordMinLength] = useState('12');
  const [pwRules, setPwRules] = useState<Record<string, boolean>>({
    pwRequireUpper: true,
    pwRequireLower: true,
    pwRequireDigit: true,
    pwRequireSpecial: false,
  });
  const [activeSessions, setActiveSessions] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/admin/settings/security')
      .then(async (r): Promise<SecuritySettingsData> => (r.ok ? r.json() : {}))
      .then((data) => {
        if (cancelled) return;
        setLockoutMaxAttempts(String(data.lockoutMaxAttempts ?? 5));
        setLockoutMinutes(String(data.lockoutMinutes ?? 15));
        setPasswordMinLength(String(data.passwordMinLength ?? 12));
        setPwRules((prev) => ({
          ...prev,
          ...(data.pwRequireUpper !== undefined && { pwRequireUpper: data.pwRequireUpper }),
          ...(data.pwRequireLower !== undefined && { pwRequireLower: data.pwRequireLower }),
          ...(data.pwRequireDigit !== undefined && { pwRequireDigit: data.pwRequireDigit }),
          ...(data.pwRequireSpecial !== undefined && { pwRequireSpecial: data.pwRequireSpecial }),
        }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    adminFetch('/api/v1/auth/admin/me')
      .then(async (r): Promise<AdminMeData> => (r.ok ? r.json() : {}))
      .then((data) => {
        if (!cancelled) setActiveSessions(data.activeSessions ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const valuesRef = useSettingsSaver(registerSaver, { lockoutMaxAttempts, lockoutMinutes, passwordMinLength, pwRules }, saveToApi);

  async function saveToApi(): Promise<void> {
    const v = valuesRef.current;
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch('/api/v1/admin/settings/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lockoutMaxAttempts: Number(v.lockoutMaxAttempts) || 0,
          lockoutMinutes: Number(v.lockoutMinutes) || 0,
          passwordMinLength: Number(v.passwordMinLength) || 0,
          pwRequireUpper: v.pwRules['pwRequireUpper'] ?? true,
          pwRequireLower: v.pwRules['pwRequireLower'] ?? true,
          pwRequireDigit: v.pwRules['pwRequireDigit'] ?? true,
          pwRequireSpecial: v.pwRules['pwRequireSpecial'] ?? false,
        }),
      });
      if (!res.ok) {
        const data = await safeJson<{ error?: string }>(res);
        throw new Error(
          data.error === 'INVALID_LOCKOUT_ATTEMPTS'
            ? 'จำนวนครั้งก่อนล็อกต้องเป็น 3-10'
            : data.error === 'INVALID_LOCKOUT_MINUTES'
              ? 'เวลาล็อกต้องเป็น 5-1440 นาที'
              : data.error === 'INVALID_PASSWORD_MIN_LENGTH'
                ? 'ความยาวรหัสผ่านขั้นต่ำต้องเป็น 8-64'
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
      <Section title="ความปลอดภัย" subtitle="จัดการ 2FA, Sessions, และ Password Policy">
        <p className="py-6 text-center text-sm text-fg-muted">กำลังโหลด...</p>
      </Section>
    );
  }

  return (
    <Section title="ความปลอดภัย" subtitle="จัดการ 2FA, Sessions, และ Password Policy">
      {/* Change Password */}
      <ChangePassword />

      {/* 2FA */}
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-jade-500/15 text-jade-700">
            <Lock size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg">การยืนยันตัวตนสองชั้น (2FA)</p>
            <p className="text-xs text-fg-placeholder">บังคับใช้ TOTP สำหรับพนักงานทุกคน</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-jade-500/15 px-2.5 py-1 text-xs font-medium text-jade-700">
            <CheckCircle2 size={12} />
            เปิดใช้งาน
          </span>
        </div>
      </div>

      {/* Password Policy — enforced by checkPasswordPolicy on every change. */}
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-secondary">
          <Key size={14} />
          นโยบายรหัสผ่าน
        </h3>
        <div className="space-y-3">
          <Field label="ความยาวรหัสผ่านขั้นต่ำ (8-64)">
            <input
              type="number"
              value={passwordMinLength}
              min={8}
              max={64}
              onChange={(e) => setPasswordMinLength(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-24 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
            />
          </Field>
          <div className="flex flex-wrap gap-4">
            {PW_RULES.map((rule) => (
              <label key={rule.key} className="flex items-center gap-2 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  checked={pwRules[rule.key] ?? false}
                  onChange={(e) =>
                    setPwRules((prev) => ({ ...prev, [rule.key]: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-line bg-surface accent-peach-500"
                />
                {rule.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-clay-400">
            บังคับใช้ทันทีกับการเปลี่ยนรหัสผ่านและรหัสผ่านชั่วคราวที่สร้างใหม่ทั้งหมด
          </p>
        </div>
      </div>

      {/* Active Sessions — real count from /auth/admin/me. */}
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-secondary">
          <Shield size={14} />
          Sessions ที่ใช้งานอยู่
        </h3>
        <p className="text-sm text-fg">
          บัญชีนี้มี session ที่ยังไม่หมดอายุ:{' '}
          <span className="font-semibold">{activeSessions ?? '—'}</span>
        </p>
        <p className="mt-1 text-xs text-clay-400">
          การเปลี่ยนรหัสผ่านจะเพิกถอนทุก session ทันที (ระบบบังคับล็อกอินใหม่)
        </p>
      </div>

      {/* Login Attempt Limits — enforced by the login flow. */}
      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-fg-secondary">ล็อกอินล้มเหลว</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ล็อกบัญชีหลังจาก (ครั้ง, 3-10)">
            <input
              type="number"
              value={lockoutMaxAttempts}
              min={3}
              max={10}
              onChange={(e) => setLockoutMaxAttempts(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-24 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
            />
          </Field>
          <Field label="ล็อกนาน (นาที, 5-1440)">
            <input
              type="number"
              value={lockoutMinutes}
              min={5}
              max={1440}
              onChange={(e) => setLockoutMinutes(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-24 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500"
            />
          </Field>
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
          {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกแล้ว!' : 'บันทึกการตั้งค่าความปลอดภัย'}
        </button>
      </div>
    </Section>
  );
}
