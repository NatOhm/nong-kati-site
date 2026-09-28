'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Eye, EyeOff } from 'lucide-react';

import { hasAdminSession, setAdminRemembered } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/**
 * Admin Login page — per UF-09.
 * Two-factor mandatory: email+password → TOTP 2FA.
 *
 * Ease-of-access pass: admins who still hold a live session land straight on
 * the dashboard, the last successful login email is prefilled (secret-free —
 * the password is never stored), and every field carries the autocomplete
 * hints password managers need, so the common case is two taps.
 */
export default function AdminLoginPage(): React.JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | '2fa' | '2fa-setup'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  // Audit #9: the backup codes handed out at setup are REAL one-time login
  // codes now — the 2FA box accepts either a 6-digit TOTP or XXXX-XXXX.
  const [challengeToken, setChallengeToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupData, setSetupData] = useState<{
    qrDataUrl: string;
    totpUri: string;
    secretBase32: string;
    backupCodes: string[];
  } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Prefill the remembered email, then put the cursor where the admin
    // actually types next: the password field.
    const last = window.localStorage.getItem('nk_admin_email');
    if (last) {
      setEmail(last);
      passwordRef.current?.focus();
    } else {
      emailRef.current?.focus();
    }

    // A live session skips the form entirely. The presence marker alone is
    // NOT enough — a stale flag with a dead refresh cookie would bounce
    // login → dashboard → login forever — so confirm with /me first and
    // only then hand off to the dashboard.
    if (!hasAdminSession()) return;
    let cancelled = false;
    fetch('/api/v1/auth/admin/me', { credentials: 'same-origin' })
      .then((r) => {
        if (!cancelled && r.ok) router.replace('/management/dashboard');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Step 1: Login with credentials
  const handleCredentialsSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/v1/auth/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, remember }),
        });
        const result = (await res.json()) as {
          success: boolean;
          requires2faSetup?: boolean;
          challengeToken?: string;
          error?: string;
          retryAfter?: number;
        };

        if (!result.success) {
          setError(
            result.error === 'INVALID_CREDENTIALS'
              ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
              : result.error === 'ACCOUNT_LOCKED'
                ? `บัญชีถูกล็อค กรุณาลองใหม่ใน ${Math.ceil((result.retryAfter ?? 900) / 60)} นาที`
                : result.error === 'ACCOUNT_DEACTIVATED'
                  ? 'บัญชีนี้ถูกปิดใช้งาน'
                  : 'เกิดข้อผิดพลาด',
          );
          return;
        }

        setChallengeToken(result.challengeToken ?? '');

        if (result.requires2faSetup) {
          // First login — setup 2FA
          const setupRes = await fetch('/api/v1/auth/admin/2fa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challengeToken: result.challengeToken ?? '', action: 'setup' }),
          });
          const setup = (await setupRes.json()) as {
            success: boolean;
            error?: string;
            qrDataUrl?: string;
            totpUri?: string;
            secretBase32?: string;
            backupCodes?: string[];
          };
          if (setup.success) {
            setSetupData({
              qrDataUrl: setup.qrDataUrl ?? '',
              totpUri: setup.totpUri ?? '',
              secretBase32: setup.secretBase32 ?? '',
              backupCodes: setup.backupCodes ?? [],
            });
            setStep('2fa-setup');
          } else {
            // Setup call failed — previously the page froze silently here.
            setError(
              setup.error === 'ALREADY_ENROLLED'
                ? 'บัญชีนี้ตั้งค่า 2FA ไว้แล้ว กรุณาเข้าสู่ระบบใหม่'
                : 'โหลดหน้าตั้งค่า 2FA ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
            );
            return;
          }
        } else {
          setStep('2fa');
        }
      } catch {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    },
    [email, password, remember],
  );

  // Step 2: Verify TOTP
  const handleTotpSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/v1/auth/admin/2fa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeToken, code: totpCode, remember }),
        });
        const result = (await res.json()) as {
          success: boolean;
          accessToken?: string;
          refreshToken?: string;
          mustChangePassword?: boolean;
          error?: string;
        };
        if (result.success) {
          // The session pair was set as HttpOnly cookies by the response —
          // nothing token-shaped is stored in JS from here on.
          setAdminRemembered(remember);
          localStorage.setItem('nk_admin_email', email);
          if (result.mustChangePassword) {
            // First login / forced rotation — land on the change form.
            router.push('/management/settings?tab=security&changePassword=1');
            return;
          }
          // Redirect to dashboard
          router.push('/management/dashboard');
        } else if (result.error === 'TOKEN_INVALID' || result.error === 'TOTP_INVALID') {
          // The challenge is consumed on EVERY confirm attempt (single use,
          // anti-brute-force) — so after a wrong code, “ลองใหม่” on the same
          // challenge is a lie. Restart the login cleanly instead.
          setStep('credentials');
          setChallengeToken('');
          setTotpCode('');
          setError(
            result.error === 'TOTP_INVALID'
              ? 'รหัสไม่ถูกต้อง กรุณาเข้าสู่ระบบและยืนยันใหม่อีกครั้ง'
              : 'หมดเวลายืนยัน กรุณาเข้าสู่ระบบใหม่',
          );
        } else {
          setError('เกิดข้อผิดพลาด');
        }
      } catch {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    },
    [challengeToken, totpCode, remember, email, router],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-peach-100">
            <Shield size={28} className="text-fg-brand" />
          </div>
          <h1 className="text-2xl font-bold text-fg">Nong-Kati Admin</h1>
          <p className="text-sm text-fg-placeholder">ระบบจัดการหลังบ้าน</p>
        </div>

        {/* Step 1: Credentials */}
        {step === 'credentials' && (
          <form
            onSubmit={handleCredentialsSubmit}
            className="space-y-4 rounded-md border border-line-subtle bg-surface p-6"
          >
            <h2 className="text-lg font-semibold text-fg">เข้าสู่ระบบ</h2>

            {error && (
              <div className="border-error bg-error rounded-md border px-3 py-2 text-sm text-fg-error">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="admin-email" className="mb-1 block text-sm text-fg-muted">
                อีเมล
              </label>
              <input
                ref={emailRef}
                id="admin-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-fg focus:ring-2 focus:ring-peach-500"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="mb-1 block text-sm text-fg-muted">
                รหัสผ่าน
              </label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="admin-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-md border border-line bg-surface px-3 py-2.5 pr-10 text-sm text-fg focus:ring-2 focus:ring-peach-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-fg-placeholder hover:text-fg-secondary"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember me — unchecked: session ends with the browser tab
                (12h server cap); checked: stays logged in for 30 days. */}
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-line accent-peach-500"
              />
              จดจำการเข้าสู่ระบบไว้ในเครื่องนี้ (30 วัน)
            </label>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full rounded-md px-5 py-2.5 text-sm font-semibold transition-colors',
                loading
                  ? 'bg-clay-300 text-fg-placeholder'
                  : 'bg-peach-500 text-white shadow-clay-sm hover:bg-peach-400',
              )}
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        )}

        {/* Step 2: 2FA Setup */}
        {step === '2fa-setup' && setupData && (
          <div className="space-y-4 rounded-md border border-line-subtle bg-surface p-6">
            <h2 className="text-lg font-semibold text-fg">ตั้งค่า 2FA</h2>
            <p className="text-sm text-fg-placeholder">
              สแกน QR Code ด้วย Google Authenticator หรือ Authy
            </p>

            <div className="flex justify-center">
              <div className="rounded-md bg-surface p-4">
                {/* Server-rendered PNG data URL — no external image host, so the
                    QR can never fail to load because of a blocked domain. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- admin-upload/data-URL source: served immutable via /api/v1/images or inline QR; next/image optimizer has no remote pattern for these hosts */}
                <img src={setupData.qrDataUrl} alt="QR Code 2FA" width={200} height={200} />
              </div>
            </div>

            <div className="rounded-md bg-surface p-3 text-center">
              <p className="text-xs text-fg-placeholder">รหัสลับ (เก็บไว้ปลอดภัย)</p>
              <p className="font-mono text-sm font-bold text-fg-brand">{setupData.secretBase32}</p>
            </div>

            {/* Audit #9: these are REAL one-time login codes — each replaces
                the 6-digit TOTP once, then dies. */}
            <div className="rounded-md bg-surface p-3">
              <p className="mb-2 text-xs text-fg-placeholder">
                รหัสสำรอง (ใช้แทนรหัส 6 หลักได้เมื่อสูญหาย Authenticator —
                ใช้ได้ครั้งเดียวต่อหนึ่งรหัส)
              </p>
              <div className="grid grid-cols-2 gap-1">
                {setupData.backupCodes.map((code) => (
                  <p key={code} className="font-mono text-xs text-fg-muted">
                    {code}
                  </p>
                ))}
              </div>
            </div>

            <form onSubmit={handleTotpSubmit} className="space-y-3">
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="รหัส 6 หลัก หรือรหัสสำรอง XXXX-XXXX"
                maxLength={9}
                className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-center font-mono text-lg tracking-widest text-fg focus:ring-2 focus:ring-peach-500"
              />
              {error && <p className="text-sm text-fg-error">{error}</p>}
              <button
                type="submit"
                disabled={loading || totpCode.trim().length < 6}
                className="w-full rounded-md bg-peach-500 px-5 py-2.5 text-sm font-semibold text-fg hover:bg-peach-400 disabled:opacity-50"
              >
                {loading ? 'กำลังยืนยัน...' : 'ยืนยัน'}
              </button>
            </form>
          </div>
        )}

        {/* Step 3: TOTP Verification */}
        {step === '2fa' && (
          <form
            onSubmit={handleTotpSubmit}
            className="space-y-4 rounded-md border border-line-subtle bg-surface p-6"
          >
            <h2 className="text-lg font-semibold text-fg">ยืนยันตัวตน</h2>
            <p className="text-sm text-fg-placeholder">
              กรอกรหัส 6 หลักจาก Authenticator App หรือรหัสสำรอง (XXXX-XXXX)
            </p>

            {error && (
              <div className="border-error bg-error rounded-md border px-3 py-2 text-sm text-fg-error">
                {error}
              </div>
            )}

            <input
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="รหัส 6 หลัก หรือรหัสสำรอง XXXX-XXXX"
              maxLength={9}
              autoFocus
              autoComplete="one-time-code"
              aria-label="รหัสยืนยัน 2FA"
              className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-center font-mono text-lg tracking-widest text-fg focus:ring-2 focus:ring-peach-500"
            />

            <button
              type="submit"
              disabled={loading || totpCode.trim().length < 6}
              className={cn(
                'w-full rounded-md px-5 py-2.5 text-sm font-semibold transition-colors',
                loading
                  ? 'bg-clay-300 text-fg-placeholder'
                  : 'bg-peach-500 text-white shadow-clay-sm hover:bg-peach-400',
              )}
            >
              {loading ? 'กำลังยืนยัน...' : 'ยืนยัน'}
            </button>
          </form>
        )}

        {/* Escape hatch back to the storefront. */}
        <p className="mt-6 text-center">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center text-sm text-fg-placeholder hover:text-fg-brand"
          >
            ← กลับหน้าร้าน
          </Link>
        </p>
      </div>
    </div>
  );
}
