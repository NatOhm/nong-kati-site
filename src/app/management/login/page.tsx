'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';

import { setAdminSession, setAdminRemembered } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/**
 * Admin Login page — per UF-09.
 * Two-factor mandatory: email+password → TOTP 2FA.
 */
export default function AdminLoginPage(): React.JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | '2fa' | '2fa-setup'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupData, setSetupData] = useState<{
    totpUri: string;
    secretBase32: string;
    backupCodes: string[];
  } | null>(null);

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
            totpUri?: string;
            secretBase32?: string;
            backupCodes?: string[];
          };
          if (setup.success) {
            setSetupData({
              totpUri: setup.totpUri ?? '',
              secretBase32: setup.secretBase32 ?? '',
              backupCodes: setup.backupCodes ?? [],
            });
            setStep('2fa-setup');
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
          body: JSON.stringify({ challengeToken, code: totpCode }),
        });
        const result = (await res.json()) as {
          success: boolean;
          accessToken?: string;
          refreshToken?: string;
          mustChangePassword?: boolean;
          error?: string;
        };
        if (result.success) {
          // Store the token pair via the shared session helper
          if (result.accessToken && result.refreshToken) {
            setAdminSession(result.accessToken, result.refreshToken);
            setAdminRemembered(remember);
          }
          localStorage.setItem('nk_admin_email', email);
          if (result.mustChangePassword) {
            // First login / forced rotation — land on the change form.
            router.push('/management/settings?tab=security&changePassword=1');
            return;
          }
          // Redirect to dashboard
          router.push('/management/dashboard');
        } else if (result.error === 'TOKEN_INVALID') {
          // Challenge expired/consumed (5-min TTL, single use) — restart cleanly
          setStep('credentials');
          setChallengeToken('');
          setTotpCode('');
          setError('หมดเวลายืนยัน กรุณาเข้าสู่ระบบใหม่');
        } else {
          setError(
            result.error === 'TOTP_INVALID' ? 'รหัสไม่ถูกต้อง กรุณาลองใหม่' : 'เกิดข้อผิดพลาด',
          );
        }
      } catch {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    },
    [challengeToken, totpCode],
  );

  return (
    <div className="nk-admin-theme flex min-h-screen items-center justify-center bg-surface-base p-4">
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
              <div className="rounded-md border border-coral-300 bg-coral-50 px-3 py-2 text-sm text-coral-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="admin-email" className="mb-1 block text-sm text-fg-muted">
                อีเมล
              </label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-peach-500"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="mb-1 block text-sm text-fg-muted">
                รหัสผ่าน
              </label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-peach-500"
              />
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
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.totpUri)}`}
                  alt="QR Code"
                  width={200}
                  height={200}
                />
              </div>
            </div>

            <div className="rounded-md bg-surface p-3 text-center">
              <p className="text-xs text-fg-placeholder">รหัสลับ (เก็บไว้ปลอดภัย)</p>
              <p className="font-mono text-sm font-bold text-fg-brand">{setupData.secretBase32}</p>
            </div>

            <div className="rounded-md bg-surface p-3">
              <p className="mb-2 text-xs text-fg-placeholder">รหัสสำรอง (ใช้เมื่อสูญหาย)</p>
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
                placeholder="กรอกรหัส 6 หลัก"
                maxLength={6}
                className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-center font-mono text-lg tracking-widest text-fg focus:outline-none focus:ring-2 focus:ring-peach-500"
              />
              {error && <p className="text-sm text-coral-600">{error}</p>}
              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
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
            <p className="text-sm text-fg-placeholder">กรอกรหัส 6 หลักจาก Authenticator App</p>

            {error && (
              <div className="rounded-md border border-coral-300 bg-coral-50 px-3 py-2 text-sm text-coral-700">
                {error}
              </div>
            )}

            <input
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="กรอกรหัส 6 หลัก"
              maxLength={6}
              autoFocus
              className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-center font-mono text-lg tracking-widest text-fg focus:outline-none focus:ring-2 focus:ring-peach-500"
            />

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
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
      </div>
    </div>
  );
}
