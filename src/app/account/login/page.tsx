'use client';

/**
 * Customer Login Page — 08-auth.md §4.1.
 * Sign-in channels (client ask: "customer login can be login with LINE,
 * facebook, google mail, phone number"):
 *   1. Email + password (with brute-force lockout)
 *   2. Social: Google / LINE / Facebook — buttons render only for providers
 *      configured server-side (GET /api/v1/auth/oauth)
 *   3. Phone (SMS OTP): request a 6-digit code, then verify it
 *   4. Magic link (passwordless email) — kept from the previous release
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, LogIn, Mail, Lock, Eye, EyeOff, Phone } from 'lucide-react';
import { cn } from '@/utils/cn';

/** Brand marks for the social buttons (simple, current-color paths). */
function GoogleMark(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.2 3.7-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5H1.4v3C3.4 21.3 7.4 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4v-3H1.4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.4l3.8-3z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c2.3 0 3.8 1 4.7 1.8L20 3.1C18 1.2 15.2 0 12 0S0 5.1 0 11.5c0 5.7 5 10.4 11.8 11.3.5.1 1.1.3 1.3.7.1.4.1 1 .1 1.5 0 0 .1 1 .1 1.9 0 .6.4.7.9.5 4.2-2 9.8-6.1 9.8-15.9z"
      />
    </svg>
  );
}

function LineMark(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#06C755"
        d="M24 11.5C24 5.1 18.6 0 12 0S0 5.1 0 11.5c0 5.7 5 10.4 11.8 11.3.5.1 1.1.3 1.3.7.1.4.1 1 .1 1.5 0 0 .1 1 .1 1.9 0 .6.4.7.9.5 4.2-2 9.8-6.1 9.8-15.9z"
      />
      <path
        fill="#fff"
        d="M4.6 8.6c-.3 0-.5-.2-.5-.5s.2-.5.5-.5h1.7L4.1 11.4c-.1.1-.1.3-.1.4 0 .3.2.5.5.5h2.8c.3 0 .5-.2.5-.5s-.2-.5-.5-.5H5.6l2.2-3.8c.1-.1.1-.3.1-.4 0-.3-.2-.5-.5-.5H4.6zm5.5 3.2c0 .3-.2.5-.5.5s-.5-.2-.5-.5V7.6c0-.3.2-.5.5-.5s.5.2.5.5v4.2zm4.2 0c0 .2-.1.4-.4.5h-.1c-.2 0-.3-.1-.5-.2L11.6 9.4v2.4c0 .3.2.5.5.5s.5-.2.5-.5V7.6c0-.2.1-.4.4-.5h.1c.2 0 .3.1.5.2l2.2 2.7V7.6c0-.3.2-.5.5-.5s.5.2.5.5v4.2zm3.3-1.6c.3 0 .5.2.5.5s-.2.5-.5.5h-1.5v1.1c0 .3.2.5.5.5s.5-.2.5-.5V7.6h2c.3 0 .5.2.5.5s-.2.5-.5.5h-1.5v1.1z"
      />
    </svg>
  );
}

function FacebookMark(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z"
      />
    </svg>
  );
}

/** Only allow same-site relative paths in ?next= (no open redirect). */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/account/dashboard';
}

/** Thai copy for phone OTP API errors. */
function otpErrorMessage(error: string | undefined, status: number): string {
  switch (error) {
    case 'INVALID_PHONE':
      return 'เบอร์โทรศัพท์ไม่ถูกต้อง (รองรับเบอร์มือถือไทย เช่น 08X-XXX-XXXX)';
    case 'RATE_LIMITED':
      return 'ขอรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
    case 'SMS_UNAVAILABLE':
      return 'ยังไม่เปิดใช้งานการเข้าสู่ระบบด้วยเบอร์โทร';
    case 'SMS_SEND_FAILED':
      return 'ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    case 'INVALID_CODE':
      return 'รหัสไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
    case 'CODE_EXPIRED':
      return 'รหัสหมดอายุแล้ว กดส่งรหัสใหม่ได้เลย';
    case 'CODE_USED':
      return 'รหัสนี้ถูกใช้ไปแล้ว กดส่งรหัสใหม่ได้เลย';
    case 'TOO_MANY_ATTEMPTS':
      return 'ลองรหัสหลายครั้งเกินไป กดส่งรหัสใหม่ได้เลย';
    case 'ACCOUNT_BLOCKED':
      return 'บัญชีนี้ถูกบล็อค กรุณาติดต่อฝ่ายสนับสนุน';
    default:
      return status >= 500
        ? 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง'
        : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  }
}

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get('oauth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);
  const [phoneAvailable, setPhoneAvailable] = useState(false);

  // Phone OTP (SMS) sign-in state.
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);

  // Which channels are configured server-side.
  useEffect(() => {
    fetch('/api/v1/auth/oauth')
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((d: { providers?: string[] }) => setOauthProviders(d.providers ?? []))
      .catch(() => setOauthProviders([]));
    fetch('/api/v1/auth/phone-otp')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { available?: boolean } | null) => setPhoneAvailable(Boolean(d?.available)))
      .catch(() => setPhoneAvailable(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        window.location.href = safeNext(searchParams.get('next'));
        return;
      }
      if (data.error === 'ACCOUNT_LOCKED') {
        const retryMin = Math.ceil((data.retryAfterMs ?? 0) / 60000);
        setError(`บัญชีถูกล็อคชั่วคราว กรุณารอ ${retryMin} นาที`);
      } else if (data.error === 'ACCOUNT_BLOCKED') {
        setError('บัญชีถูกบล็อค กรุณาติดต่อฝ่ายสนับสนุน');
      } else {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      }
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }

    setLoading(false);
  };

  const handleSendOtp = async (): Promise<void> => {
    setOtpBusy(true);
    setOtpError(null);
    setOtpMessage(null);
    try {
      const res = await fetch('/api/v1/auth/phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (res.ok && data.success) {
        setOtpSent(true);
        setOtpMessage(data.message ?? 'ส่งรหัส 6 หลักทาง SMS แล้ว');
      } else {
        setOtpError(otpErrorMessage(data.error, res.status));
      }
    } catch {
      setOtpError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setOtpBusy(false);
    }
  };

  const handleVerifyOtp = async (): Promise<void> => {
    setOtpBusy(true);
    setOtpError(null);
    try {
      const res = await fetch('/api/v1/auth/phone-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otpCode }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        isNewAccount?: boolean;
        error?: string;
      };
      if (res.ok && data.success) {
        // New phone-only accounts land in settings to set their real email;
        // everyone else continues to wherever they were heading.
        window.location.href = data.isNewAccount
          ? '/account/settings'
          : safeNext(searchParams.get('next'));
        return;
      }
      setOtpError(otpErrorMessage(data.error, res.status));
    } catch {
      setOtpError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setOtpBusy(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Back to previous page (home fallback when opened directly) */}
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
          className="mb-4 inline-flex min-h-[36px] items-center gap-2 text-sm text-fg-placeholder transition-colors duration-200 hover:text-fg-brand"
        >
          <ArrowLeft size={16} />
          กลับ
        </button>

        <div className="mb-8 text-center">
          <h1 className="mb-2 text-2xl font-bold text-fg">เข้าสู่ระบบ</h1>
          <p className="text-sm text-fg-placeholder">
            เข้าสู่ระบบเพื่อจัดการคำสั่งซื้อและโค้ดของคุณ
          </p>
        </div>

        <div className="rounded-lg border border-line-subtle bg-surface p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="mb-1 block text-sm text-fg-muted">
                อีเมล
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
                />
                <input
                  id="login-email"
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

            {/* Password */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="login-password" className="block text-sm text-fg-muted">
                  รหัสผ่าน
                </label>
                {/* audit #9: no password reset exists yet — route users to the
                    passwordless email-link flow, which lands in the same place. */}
                <a
                  href={`/account/magic-link?next=${encodeURIComponent(safeNext(searchParams.get('next')))}`}
                  className="text-sm text-fg-brand underline hover:no-underline"
                >
                  ลืมรหัสผ่าน?
                </a>
              </div>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
                />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-md border border-line-subtle bg-surface py-2 pl-9 pr-10 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand focus:outline-none"
                  placeholder="••••••••"
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

            {/* Remember me */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="relative h-5 w-5 rounded before:absolute before:-inset-2.5 before:content-['']"
              />
              <span className="text-sm text-fg-placeholder">จดจำฉัน</span>
            </label>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="rounded-md border border-coral-300 bg-coral-50 px-3 py-2 text-sm text-coral-600"
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-peach-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-peach-400 disabled:opacity-50"
            >
              <LogIn size={16} />
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          {/* Social sign-in (Google / LINE / Facebook) — buttons render only
              when the provider is configured server-side (GET /api/v1/auth/oauth). */}
          {(oauthProviders.length > 0 || oauthError) && (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-fg-placeholder">
                <span className="h-px flex-1 bg-line-subtle" />
                หรือเข้าสู่ระบบด้วย
                <span className="h-px flex-1 bg-line-subtle" />
              </div>
              <div className="grid gap-2">
                {oauthProviders.includes('google') && (
                  <a
                    href={`/api/v1/auth/oauth/google?next=${encodeURIComponent(safeNext(searchParams.get('next')))}`}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-line-subtle bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-peach-50"
                  >
                    <GoogleMark />
                    ดำเนินการต่อด้วย Google
                  </a>
                )}
                {oauthProviders.includes('line') && (
                  <a
                    href={`/api/v1/auth/oauth/line?next=${encodeURIComponent(safeNext(searchParams.get('next')))}`}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-line-subtle bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-peach-50"
                  >
                    <LineMark />
                    ดำเนินการต่อด้วย LINE
                  </a>
                )}
                {oauthProviders.includes('facebook') && (
                  <a
                    href={`/api/v1/auth/oauth/facebook?next=${encodeURIComponent(safeNext(searchParams.get('next')))}`}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-line-subtle bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-peach-50"
                  >
                    <FacebookMark />
                    ดำเนินการต่อด้วย Facebook
                  </a>
                )}
              </div>
            </>
          )}

          {/* Phone sign-in (SMS OTP) — available only when the SMS gateway
              is configured (or dev mode is on): GET /api/v1/auth/phone-otp. */}
          {phoneAvailable && (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-fg-placeholder">
                <span className="h-px flex-1 bg-line-subtle" />
                หรือเข้าสู่ระบบด้วยเบอร์โทรศัพท์
                <span className="h-px flex-1 bg-line-subtle" />
              </div>
              <div className="space-y-3">
                <div>
                  <label htmlFor="login-phone" className="mb-1 block text-sm text-fg-muted">
                    เบอร์โทรศัพท์
                  </label>
                  <div className="relative">
                    <Phone
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
                    />
                    <input
                      id="login-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        // A new number means the previous code no longer matches.
                        setOtpSent(false);
                        setOtpMessage(null);
                        setOtpError(null);
                        setOtpCode('');
                      }}
                      className="h-11 w-full rounded-md border border-line-subtle bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand focus:outline-none"
                      placeholder="08X-XXX-XXXX"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSendOtp()}
                  disabled={otpBusy || phone.trim().length < 9}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-line-subtle bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-peach-50 disabled:opacity-50"
                >
                  <Phone size={16} />
                  {otpSent ? 'ส่งรหัสอีกครั้ง' : 'ส่งรหัสผ่าน SMS'}
                </button>

                {otpSent && (
                  <>
                    <div>
                      <label htmlFor="login-otp-code" className="mb-1 block text-sm text-fg-muted">
                        รหัส 6 หลัก
                      </label>
                      <input
                        id="login-otp-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        className="h-11 w-full rounded-md border border-line-subtle bg-surface px-3 text-center text-lg tracking-[0.3em] text-fg placeholder:text-fg-muted focus:border-line-brand focus:outline-none"
                        placeholder="••••••"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleVerifyOtp()}
                      disabled={otpBusy || otpCode.length !== 6}
                      className="flex min-h-[44px] w-full items-center justify-center rounded-md bg-peach-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-peach-400 disabled:opacity-50"
                    >
                      {otpBusy ? 'กำลังตรวจสอบ...' : 'ยืนยันรหัส'}
                    </button>
                  </>
                )}

                {otpMessage && <p className="text-jade-600 text-xs">{otpMessage}</p>}
                {otpError && (
                  <div
                    role="alert"
                    className="rounded-md border border-coral-300 bg-coral-50 px-3 py-2 text-sm text-coral-600"
                  >
                    {otpError}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Social sign-in error (redirected back from /oauth/[provider]/callback) */}
          {oauthError && (
            <div
              role="alert"
              className="mt-4 rounded-md border border-coral-300 bg-coral-50 px-3 py-2 text-sm text-coral-600"
            >
              {oauthError === 'blocked'
                ? 'บัญชีนี้ถูกบล็อค กรุณาติดต่อฝ่ายสนับสนุน'
                : oauthError === 'denied'
                  ? 'ยกเลิกการเข้าสู่ระบบ — ลองอีกครั้งได้เลย'
                  : 'เข้าสู่ระบบด้วยบัญชีโซเชียลไม่สำเร็จ กรุณาลองใหม่'}
            </div>
          )}

          {/* Magic Link — passwordless sign-in (08-auth.md §4.2). */}
          <div className="my-4 flex items-center gap-3 text-xs text-fg-placeholder">
            <span className="h-px flex-1 bg-line-subtle" />
            หรือ
            <span className="h-px flex-1 bg-line-subtle" />
          </div>
          <a
            href={`/account/magic-link?next=${encodeURIComponent(safeNext(searchParams.get('next')))}`}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-line-subtle bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-peach-50"
          >
            <Mail size={18} className="text-fg-brand" />
            เข้าสู่ระบบด้วยลิงก์อีเมล (ไม่ต้องใช้รหัสผ่าน)
          </a>
        </div>

        {/* Register link */}
        <p className="mt-4 text-center text-sm text-fg-placeholder">
          ยังไม่มีบัญชี?{' '}
          <Link href="/account/register" className="text-fg-brand hover:text-fg-brand">
            สมัครสมาชิก
          </Link>
        </p>
      </div>
    </div>
  );
}
