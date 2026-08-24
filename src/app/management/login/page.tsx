'use client';

import { useState, useCallback } from 'react';
import { Shield } from 'lucide-react';

import { adminLogin, confirm2fa, setup2fa } from '@/api/adminAuth';
import { cn } from '@/utils/cn';

/**
 * Admin Login page — per UF-09.
 * Two-factor mandatory: email+password → TOTP 2FA.
 */
export default function AdminLoginPage(): React.JSX.Element {
  const [step, setStep] = useState<'credentials' | '2fa' | '2fa-setup'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
  const handleCredentialsSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = adminLogin(email, password);

      if (!result.success) {
        setError(result.error === 'INVALID_CREDENTIALS'
          ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
          : result.error === 'ACCOUNT_LOCKED'
            ? `บัญชีถูกล็อค กรุณาลองใหม่ใน ${Math.ceil((result.retryAfter ?? 1800) / 60)} นาที`
            : 'เกิดข้อผิดพลาด');
        return;
      }

      setChallengeToken(result.challengeToken ?? '');

      if (result.requires2faSetup) {
        // First login — setup 2FA
        const setup = setup2fa(result.challengeToken ?? '');
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
  }, [email, password]);

  // Step 2: Verify TOTP
  const handleTotpSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = confirm2fa(challengeToken, totpCode);
      if (result.success) {
        // Store tokens and redirect to dashboard
        window.location.href = '/management/dashboard';
      } else {
        setError(result.error === 'TOTP_INVALID' ? 'รหัสไม่ถูกต้อง กรุณาลองใหม่' : 'เกิดข้อผิดพลาด');
      }
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [challengeToken, totpCode]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-900/30">
            <Shield size={28} className="text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-ink-100">Nong-Kati Admin</h1>
          <p className="text-sm text-ink-400">ระบบจัดการหลังบ้าน</p>
        </div>

        {/* Step 1: Credentials */}
        {step === 'credentials' && (
          <form onSubmit={handleCredentialsSubmit} className="space-y-4 rounded-md border border-ink-700 bg-ink-850 p-6">
            <h2 className="text-lg font-semibold text-ink-100">เข้าสู่ระบบ</h2>

            {error && (
              <div className="rounded-md border border-crimson-700/50 bg-crimson-900/20 px-3 py-2 text-sm text-crimson-200">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="admin-email" className="mb-1 block text-sm text-ink-300">อีเมล</label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="mb-1 block text-sm text-ink-300">รหัสผ่าน</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full rounded-md px-5 py-2.5 text-sm font-semibold transition-colors',
                loading ? 'bg-ink-700 text-ink-400' : 'bg-amber-400 text-ink-900 hover:bg-amber-300',
              )}
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        )}

        {/* Step 2: 2FA Setup */}
        {step === '2fa-setup' && setupData && (
          <div className="space-y-4 rounded-md border border-ink-700 bg-ink-850 p-6">
            <h2 className="text-lg font-semibold text-ink-100">ตั้งค่า 2FA</h2>
            <p className="text-sm text-ink-400">
              สแกน QR Code ด้วย Google Authenticator หรือ Authy
            </p>

            <div className="flex justify-center">
              <div className="rounded-md bg-white p-4">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.totpUri)}`} alt="QR Code" width={200} height={200} />
              </div>
            </div>

            <div className="rounded-md bg-ink-800 p-3 text-center">
              <p className="text-xs text-ink-400">รหัสลับ (เก็บไว้ปลอดภัย)</p>
              <p className="font-mono text-sm font-bold text-amber-300">{setupData.secretBase32}</p>
            </div>

            <div className="rounded-md bg-ink-800 p-3">
              <p className="mb-2 text-xs text-ink-400">รหัสสำรอง (ใช้เมื่อสูญหาย)</p>
              <div className="grid grid-cols-2 gap-1">
                {setupData.backupCodes.map((code) => (
                  <p key={code} className="font-mono text-xs text-ink-300">{code}</p>
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
                className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2.5 text-center font-mono text-lg tracking-widest text-ink-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {error && <p className="text-sm text-crimson-400">{error}</p>}
              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="w-full rounded-md bg-amber-400 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:bg-amber-300 disabled:opacity-50"
              >
                {loading ? 'กำลังยืนยัน...' : 'ยืนยัน'}
              </button>
            </form>
          </div>
        )}

        {/* Step 3: TOTP Verification */}
        {step === '2fa' && (
          <form onSubmit={handleTotpSubmit} className="space-y-4 rounded-md border border-ink-700 bg-ink-850 p-6">
            <h2 className="text-lg font-semibold text-ink-100">ยืนยันตัวตน</h2>
            <p className="text-sm text-ink-400">
              กรอกรหัส 6 หลักจาก Authenticator App
            </p>

            {error && (
              <div className="rounded-md border border-crimson-700/50 bg-crimson-900/20 px-3 py-2 text-sm text-crimson-200">
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
              className="w-full rounded-md border border-ink-600 bg-ink-800 px-3 py-2.5 text-center font-mono text-lg tracking-widest text-ink-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className={cn(
                'w-full rounded-md px-5 py-2.5 text-sm font-semibold transition-colors',
                loading ? 'bg-ink-700 text-ink-400' : 'bg-amber-400 text-ink-900 hover:bg-amber-300',
              )}
            >
              {loading ? 'กำลังยืนยัน...' : 'ยืนยัน'}
            </button>

            <p className="text-center text-xs text-ink-400">
              รหัสสำหรับทดสอบ: <span className="font-mono text-amber-300">123456</span>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
