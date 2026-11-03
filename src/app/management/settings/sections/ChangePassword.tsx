'use client';

import { useState } from 'react';
import { Save, Key, CheckCircle2, AlertTriangle } from 'lucide-react';

import { adminFetch, clearAdminSession } from '@/lib/adminSession';
import { safeJson } from '@/lib/json';

import { Field } from '../shared';

// ─── Change Password ────────────────────────────

export const INPUT_CLASS =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-clay-400 focus:ring-2 focus:ring-peach-500';

/**
 * Self-service password change for the signed-in admin. On success the API
 * revokes EVERY session (including this one), so the UI clears storage and
 * sends the admin to the login page — they re-enter with the new password.
 */
export function ChangePassword(): React.JSX.Element {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 12) {
      setError('รหัสผ่านใหม่ต้องมีอย่างน้อย 12 ตัวอักษร');
      return;
    }
    if (next !== confirm) {
      setError('รหัสผ่านใหม่ที่กรอกทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setSaving(true);
    adminFetch('/api/v1/auth/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    })
      .then(async (res) => {
        const data = await safeJson<{
          success?: boolean;
          error?: string;
        }>(res);
        if (!res.ok || !data.success) {
          setError(
            data.error === 'CURRENT_PASSWORD_INCORRECT'
              ? 'รหัสผ่านปัจจุบันไม่ถูกต้อง'
              : data.error === 'PASSWORD_TOO_SHORT'
                ? 'รหัสผ่านใหม่ต้องมีอย่างน้อย 12 ตัวอักษร'
                : `บันทึกไม่สำเร็จ (${data.error ?? `HTTP ${res.status}`})`,
          );
          setSaving(false);
          return;
        }
        setDone(true);
        setSaving(false);
        // Every session was revoked server-side — this one included.
        setTimeout(() => {
          clearAdminSession();
          localStorage.removeItem('nk_admin_email');
          window.location.href = '/management/login';
        }, 1800);
      })
      .catch(() => {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
        setSaving(false);
      });
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-line-subtle bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-secondary">
        <Key size={14} />
        เปลี่ยนรหัสผ่าน
      </h3>
      <div className="space-y-3">
        <Field label="รหัสผ่านปัจจุบัน">
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="รหัสผ่านใหม่ (12 ตัวอักษรขึ้นไป)">
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={12}
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="ยืนยันรหัสผ่านใหม่">
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        {error && (
          <div className="border-error bg-error flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-fg-error">
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        {done && (
          <div className="border-jade-300 bg-jade-50 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-jade-700">
            <CheckCircle2 size={16} /> เปลี่ยนรหัสผ่านสำเร็จ — กำลังพาไปหน้าเข้าสู่ระบบ…
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || done}
            className="flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-peach-400 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </div>
      </div>
    </form>
  );
}
