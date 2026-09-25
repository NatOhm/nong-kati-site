'use client';

/**
 * Reset Password Page — consumes ?token= and sets the new password.
 * States mirror the magic-link consume flow: form → success / used /
 * expired / invalid / blocked. On success the customer goes to login
 * (sessions were revoked — a fresh sign-in is intentional).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  ShieldAlert,
} from 'lucide-react';

type ConsumeState = 'form' | 'success' | 'used' | 'expired' | 'invalid' | 'blocked';

export default function ResetPasswordPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [state, setState] = useState<ConsumeState>(token ? 'form' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A token arriving after a previous submission attempt must not revive the
  // form once it has been consumed in this tab.
  useEffect(() => {
    if (token && state === 'invalid') setState('form');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (password.length < 8) {
      setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (password !== confirm) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (res.ok) {
        setState('success');
        return;
      }
      if (data.error === 'TOKEN_USED') setState('used');
      else if (data.error === 'TOKEN_EXPIRED') setState('expired');
      else if (data.error === 'ACCOUNT_BLOCKED') setState('blocked');
      else if (data.error === 'RATE_LIMITED') setError('ลองหลายครั้งเกินไป — รอสักครู่แล้วลองใหม่');
      else setError('ลิงก์ไม่ถูกต้อง — ลองขอลิงก์ใหม่จากหน้า "ลืมรหัสผ่าน?"');
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
          className="mb-4 inline-flex min-h-[36px] items-center gap-2 text-sm text-fg-placeholder transition-colors duration-200 hover:text-fg-brand"
        >
          <ArrowLeft size={16} />
          กลับ
        </button>

        <div className="rounded-lg border border-line-subtle bg-surface p-6">
          {state === 'success' ? (
            <div className="text-center">
              <CheckCircle2 size={48} className="text-jade-600 mx-auto mb-4" />
              <h1 className="mb-2 text-2xl font-bold text-fg">ตั้งรหัสผ่านใหม่สำเร็จ!</h1>
              <p className="mb-6 text-sm text-fg-secondary">
                ทุกอุปกรณ์ที่ล็อกอินค้างไว้ถูกปิดการใช้งานแล้ว — เข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่
              </p>
              <Link
                href="/account/login"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-peach-700 px-4 text-sm font-medium text-white hover:bg-peach-600"
              >
                เข้าสู่ระบบด้วยรหัสผ่านใหม่
              </Link>
            </div>
          ) : state === 'form' ? (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-peach-100">
                  <KeyRound size={22} className="text-fg-brand" />
                </div>
                <h1 className="mb-2 text-2xl font-bold text-fg">ตั้งรหัสผ่านใหม่</h1>
                <p className="text-sm text-fg-secondary">
                  ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ — ทำครั้งเดียวด้วยลิงก์นี้
                </p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label htmlFor="reset-password" className="mb-1 block text-sm text-fg-muted">
                    รหัสผ่านใหม่
                  </label>
                  <div className="relative">
                    <input
                      id="reset-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="w-full rounded-md border border-line-subtle bg-surface py-2 pl-3 pr-10 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand"
                      placeholder="อย่างน้อย 8 ตัวอักษร"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                      aria-pressed={showPassword}
                      className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center p-2.5 text-fg-placeholder hover:text-fg-secondary"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="reset-confirm" className="mb-1 block text-sm text-fg-muted">
                    ยืนยันรหัสผ่านใหม่
                  </label>
                  <input
                    id="reset-confirm"
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand"
                    placeholder="พิมพ์ซ้ำอีกครั้ง"
                  />
                </div>

                {error && (
                  <p className="text-xs text-coral-600" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || !password || !confirm}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-peach-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-peach-600 disabled:opacity-50"
                >
                  <KeyRound size={16} />
                  {busy ? 'กำลังบันทึก...' : 'ตั้งรหัสผ่านใหม่'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              {state === 'used' && (
                <>
                  <Link2 size={48} className="mx-auto mb-4 text-fg-brand" />
                  <h1 className="mb-2 text-xl font-bold text-fg">ลิงก์นี้ถูกใช้ไปแล้ว</h1>
                  <p className="text-sm text-fg-secondary">
                    ลิงก์ใช้ได้ครั้งเดียวเพื่อความปลอดภัย — ถ้ายังเข้าสู่ระบบไม่ได้
                    ขอลิงก์ใหม่ได้เสมอ
                  </p>
                </>
              )}
              {state === 'expired' && (
                <>
                  <Clock size={48} className="mx-auto mb-4 text-fg-brand" />
                  <h1 className="mb-2 text-xl font-bold text-fg">ลิงก์หมดอายุแล้ว</h1>
                  <p className="text-sm text-fg-secondary">
                    ลิงก์ใช้ได้ใน 30 นาที — ขอลิงก์ใหม่เพื่อตั้งรหัสผ่านต่อ
                  </p>
                </>
              )}
              {(state === 'invalid' || state === 'blocked') && (
                <>
                  <ShieldAlert size={48} className="mx-auto mb-4 text-coral-600" />
                  <h1 className="mb-2 text-xl font-bold text-fg">
                    {state === 'blocked' ? 'บัญชีนี้เข้าสู่ระบบไม่ได้' : 'ลิงก์ไม่ถูกต้อง'}
                  </h1>
                  <p className="text-sm text-fg-secondary">
                    {state === 'blocked'
                      ? 'บัญชีถูกบล็อค — ติดต่อฝ่ายสนับสนุนสำหรับความช่วยเหลือ'
                      : 'ลิงก์อาจถูกคัดลอกไม่ครบหรือถูกแก้ไข — ลองขอลิงก์ใหม่'}
                  </p>
                </>
              )}

              {state !== 'blocked' && (
                <Link
                  href="/account/forgot-password"
                  className="mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-peach-700 px-4 text-sm font-medium text-white hover:bg-peach-600"
                >
                  <KeyRound size={16} />
                  ขอลิงก์ใหม่
                </Link>
              )}
              {state === 'blocked' && (
                <Link
                  href="/account/support"
                  className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-peach-700 px-4 text-sm font-medium text-white hover:bg-peach-600"
                >
                  ติดต่อฝ่ายสนับสนุน
                </Link>
              )}
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-fg-placeholder">
          <Link href="/account/login" className="text-fg-brand hover:text-fg-brand">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  );
}
