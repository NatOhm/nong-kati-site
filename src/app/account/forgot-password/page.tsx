'use client';

/**
 * Forgot Password Page — request a reset link.
 * Uniform behaviour with the API: whatever the email answer is, the sent
 * confirmation looks identical (no enumeration). The ?next= target survives
 * through reset → login.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Clock, KeyRound, Mail, Send } from 'lucide-react';

type Phase = 'request' | 'sent';

export default function ForgotPasswordPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = (() => {
    const raw = searchParams.get('next');
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
    return '/account/login';
  })();

  const [phase, setPhase] = useState<Phase>('request');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function submitRequest(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (sending || cooldown > 0) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (res.ok) {
        setSentTo(email);
        setPhase('sent');
        setCooldown(60);
        return;
      }
      if (data.error === 'INVALID_EMAIL') {
        setError('รูปแบบอีเมลไม่ถูกต้อง');
      } else if (data.error === 'RATE_LIMITED') {
        setError('ขอลิงก์บ่อยเกินไป — กรุณารอสักครู่แล้วลองใหม่');
      } else {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      }
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSending(false);
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
          {phase === 'request' ? (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-peach-100">
                  <KeyRound size={22} className="text-fg-brand" />
                </div>
                <h1 className="mb-2 text-2xl font-bold text-fg">ลืมรหัสผ่าน?</h1>
                <p className="text-sm text-fg-secondary">
                  ใส่อีเมลที่สมัครไว้ — เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้
                </p>
              </div>

              <form onSubmit={submitRequest} className="space-y-4">
                <div>
                  <label htmlFor="forgot-email" className="mb-1 block text-sm text-fg-muted">
                    อีเมล
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
                    />
                    <input
                      id="forgot-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full rounded-md border border-line-subtle bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand focus:outline-none"
                      placeholder="your@email.com"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-coral-600" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={sending || !email}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-peach-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-peach-600 disabled:opacity-50"
                >
                  <Send size={16} />
                  {sending ? 'กำลังส่งลิงก์...' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-fg-placeholder">
                จำรหัสผ่านได้แล้ว?{' '}
                <Link
                  href={`/account/login?next=${encodeURIComponent(next)}`}
                  className="text-fg-brand hover:text-fg-brand"
                >
                  เข้าสู่ระบบ
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-jade-500/15">
                  <Send size={22} className="text-jade-600" />
                </div>
                <h1 className="mb-2 text-2xl font-bold text-fg">ส่งลิงก์แล้ว!</h1>
                <p className="text-sm text-fg-secondary">
                  หากอีเมลนี้มีบัญชี เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่{' '}
                  <span className="font-medium text-fg">{sentTo}</span>
                </p>
              </div>

              <div className="rounded-md border border-line-subtle bg-surface-sunken p-3 text-xs text-fg-secondary">
                <p className="flex items-start gap-2">
                  <Clock size={14} className="mt-0.5 shrink-0" />
                  ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน 30 นาที — ตรวจสอบโฟลเดอร์จดหมายขยะด้วย
                </p>
                <p className="mt-2 flex items-start gap-2">
                  <KeyRound size={14} className="mt-0.5 shrink-0" />
                  ตั้งรหัสใหม่สำเร็จแล้ว ระบบจะปิดการใช้งานทุกอุปกรณ์ที่ล็อกอินค้างไว้
                  เพื่อความปลอดภัย
                </p>
              </div>

              <button
                type="button"
                disabled={cooldown > 0}
                onClick={() => {
                  setPhase('request');
                  setError(null);
                }}
                className="mt-4 w-full rounded-md border border-line-subtle px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-peach-50 disabled:opacity-50"
              >
                {cooldown > 0
                  ? `ขอลิงก์ใหม่ได้ใน ${cooldown} วินาที`
                  : 'ส่งไปอีเมลอื่น / ขอลิงก์ใหม่'}
              </button>

              <p className="mt-4 text-center text-sm text-fg-placeholder">
                <Link
                  href={`/account/login?next=${encodeURIComponent(next)}`}
                  className="text-fg-brand hover:text-fg-brand"
                >
                  กลับไปหน้าเข้าสู่ระบบ
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
