'use client';

/**
 * Magic Link Page — request + consume states.
 *
 * No ?token=  → request form (confirm) → "sent" confirmation.
 * ?token=…    → consumes the token on mount → success / used / expired /
 *               invalid states, mirroring the audit's required flows.
 *
 * The `next` query param is preserved through the request → sent flow and
 * re-applied after sign-in (same-origin relative paths only, as on login).
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Link2,
  LogIn,
  Mail,
  Send,
  ShieldAlert,
} from 'lucide-react';

/** Only allow same-site relative paths in ?next= (no open redirect). */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/account/dashboard';
}

type Phase = 'request' | 'sent';
type ConsumeState = 'consuming' | 'success' | 'used' | 'expired' | 'invalid' | 'blocked';

export default function MagicLinkPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const next = safeNext(searchParams.get('next'));

  const [phase, setPhase] = useState<Phase>('request');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const [consume, setConsume] = useState<ConsumeState>('consuming');
  const consumedRef = useRef(false);

  // ── Consume flow: run once per token ────────────────────
  useEffect(() => {
    if (!token || consumedRef.current) return;
    consumedRef.current = true;

    (async () => {
      try {
        const res = await fetch('/api/v1/auth/magic-link/consume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };

        if (res.ok && data) {
          setConsume('success');
          window.setTimeout(() => {
            window.location.href = next;
          }, 1200);
          return;
        }
        if (data.error === 'TOKEN_USED') setConsume('used');
        else if (data.error === 'TOKEN_EXPIRED') setConsume('expired');
        else if (data.error === 'ACCOUNT_BLOCKED') setConsume('blocked');
        else setConsume('invalid');
      } catch {
        setConsume('invalid');
      }
    })();
  }, [token, next]);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  // ── Request flow ────────────────────────────────────────
  async function submitRequest(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (sending || cooldown > 0) return;
    setSending(true);
    setRequestError(null);

    try {
      const res = await fetch('/api/v1/auth/magic-link', {
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
        setRequestError('รูปแบบอีเมลไม่ถูกต้อง');
      } else if (data.error === 'RATE_LIMITED') {
        setRequestError('ขอลิงก์บ่อยเกินไป — กรุณารอสักครู่แล้วลองใหม่');
      } else {
        setRequestError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      }
    } catch {
      setRequestError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
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

        {/* ═══ Consume states (arrived with ?token=) ═══ */}
        {token ? (
          <div className="rounded-lg border border-line-subtle bg-surface p-8 text-center">
            {consume === 'consuming' && (
              <>
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-fg-brand" />
                <h1 className="text-xl font-bold text-fg">กำลังตรวจสอบลิงก์...</h1>
                <p className="mt-2 text-sm text-fg-secondary">อย่าปิดหน้านี้จนกว่าจะเสร็จ</p>
              </>
            )}

            {consume === 'success' && (
              <>
                <CheckCircle2 size={48} className="mx-auto mb-4 text-jade-600" />
                <h1 className="text-xl font-bold text-fg">เข้าสู่ระบบสำเร็จ!</h1>
                <p className="mt-2 text-sm text-fg-secondary">กำลังพาไปหน้าบัญชีของคุณ...</p>
              </>
            )}

            {consume === 'used' && (
              <>
                <Link2 size={48} className="mx-auto mb-4 text-fg-brand" />
                <h1 className="text-xl font-bold text-fg">ลิงก์นี้ถูกใช้ไปแล้ว</h1>
                <p className="mt-2 text-sm text-fg-secondary">
                  ลิงก์ใช้ได้ครั้งเดียวเพื่อความปลอดภัย — ขอลิงก์ใหม่ได้เสมอ
                </p>
                <RequestAgain note={next} />
              </>
            )}

            {consume === 'expired' && (
              <>
                <Clock size={48} className="mx-auto mb-4 text-fg-brand" />
                <h1 className="text-xl font-bold text-fg">ลิงก์หมดอายุแล้ว</h1>
                <p className="mt-2 text-sm text-fg-secondary">
                  ลิงก์ใช้ได้ใน 15 นาที — ขอลิงก์ใหม่เพื่อเข้าสู่ระบบต่อ
                </p>
                <RequestAgain note={next} />
              </>
            )}

            {(consume === 'invalid' || consume === 'blocked') && (
              <>
                <ShieldAlert size={48} className="mx-auto mb-4 text-coral-600" />
                <h1 className="text-xl font-bold text-fg">
                  {consume === 'blocked' ? 'บัญชีนี้เข้าสู่ระบบไม่ได้' : 'ลิงก์ไม่ถูกต้อง'}
                </h1>
                <p className="mt-2 text-sm text-fg-secondary">
                  {consume === 'blocked'
                    ? 'บัญชีถูกบล็อค — ติดต่อฝ่ายสนับสนุนสำหรับความช่วยเหลือ'
                    : 'ลิงก์อาจถูกคัดลอกไม่ครบหรือถูกแก้ไข — ลองขอลิงก์ใหม่'}
                </p>
                {consume === 'invalid' && <RequestAgain note={next} />}
                {consume === 'blocked' && (
                  <Link
                    href="/account/support"
                    className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-peach-700 px-4 text-sm font-medium text-white hover:bg-peach-600"
                  >
                    ติดต่อฝ่ายสนับสนุน
                  </Link>
                )}
              </>
            )}
          </div>
        ) : (
          /* ═══ Request + sent states ═══ */
          <div className="rounded-lg border border-line-subtle bg-surface p-6">
            {phase === 'request' ? (
              <>
                <div className="mb-6 text-center">
                  <h1 className="mb-2 text-2xl font-bold text-fg">เข้าสู่ระบบด้วยลิงก์</h1>
                  <p className="text-sm text-fg-secondary">
                    ใส่อีเมลที่สมัครไว้ — เราจะส่งลิงก์เข้าสู่ระบบให้ ไม่ต้องใช้รหัสผ่าน
                  </p>
                </div>

                <form onSubmit={submitRequest} className="space-y-4">
                  <div>
                    <label htmlFor="magic-email" className="mb-1 block text-sm text-fg-muted">
                      อีเมล
                    </label>
                    <div className="relative">
                      <Mail
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
                      />
                      <input
                        id="magic-email"
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

                  {requestError && (
                    <p className="text-xs text-coral-600" role="alert">
                      {requestError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={sending || !email}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-peach-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-peach-600 disabled:opacity-50"
                  >
                    <Send size={16} />
                    {sending ? 'กำลังส่งลิงก์...' : 'ส่งลิงก์เข้าสู่ระบบ'}
                  </button>
                </form>

                <p className="mt-4 text-center text-sm text-fg-placeholder">
                  มีรหัสผ่าน?{' '}
                  <Link href={`/account/login?next=${encodeURIComponent(next)}`} className="text-fg-brand hover:text-fg-brand">
                    เข้าสู่ระบบแบบปกติ
                  </Link>
                </p>
              </>
            ) : (
              <>
                <div className="mb-6 text-center">
                  <CheckCircle2 size={48} className="mx-auto mb-3 text-jade-600" />
                  <h1 className="mb-2 text-2xl font-bold text-fg">ส่งลิงก์แล้ว!</h1>
                  <p className="text-sm text-fg-secondary">
                    เราได้ส่งลิงก์เข้าสู่ระบบไปที่{' '}
                    <span className="font-medium text-fg">{sentTo}</span>
                  </p>
                </div>

                <div className="rounded-md border border-line-subtle bg-surface-sunken p-3 text-xs text-fg-secondary">
                  <p className="flex items-start gap-2">
                    <Clock size={14} className="mt-0.5 shrink-0" />
                    ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน 15 นาที — ตรวจสอบโฟลเดอร์จดหมายขยะด้วย
                  </p>
                </div>

                <button
                  type="button"
                  disabled={cooldown > 0}
                  onClick={() => {
                    setPhase('request');
                    setRequestError(null);
                  }}
                  className="mt-4 w-full rounded-md border border-line-subtle px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-peach-50 disabled:opacity-50"
                >
                  {cooldown > 0 ? `ขอลิงก์ใหม่ได้ใน ${cooldown} วินาที` : 'ส่งไปอีเมลอื่น / ขอลิงก์ใหม่'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Register link */}
        {!token && (
          <p className="mt-4 text-center text-sm text-fg-placeholder">
            ยังไม่มีบัญชี?{' '}
            <Link href="/account/register" className="text-fg-brand hover:text-fg-brand">
              สมัครสมาชิก
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

/** Shared "request another link" action that preserves the ?next target. */
function RequestAgain({ note }: { note: string }): React.JSX.Element {
  return (
    <Link
      href={`/account/magic-link?next=${encodeURIComponent(note)}`}
      className="mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-peach-700 px-4 text-sm font-medium text-white hover:bg-peach-600"
    >
      <LogIn size={16} />
      ขอลิงก์ใหม่
    </Link>
  );
}
