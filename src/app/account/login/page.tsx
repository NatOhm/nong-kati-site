'use client';

/**
 * Customer Login Page — 08-auth.md §4.1.
 * Email + password login with brute-force lockout.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/utils/cn';

/** Only allow same-site relative paths in ?next= (no open redirect). */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/account/dashboard';
}

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
              <label className="mb-1 block text-sm text-fg-muted">อีเมล</label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-md border border-line-subtle bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand focus:outline-none"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1 block text-sm text-fg-muted">รหัสผ่าน</label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-md border border-line-subtle bg-surface py-2 pl-9 pr-10 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand focus:outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-fg-placeholder hover:text-fg-secondary"
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
              <div className="rounded-md border border-coral-300 bg-coral-50 px-3 py-2 text-sm text-coral-600">
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

          {/* Magic Link */}
          <div className="mt-4 border-t border-line-subtle pt-4 text-center">
            <Link href="/account/magic-link" className="text-sm text-fg-brand hover:text-fg-brand">
              เข้าสู่ระบบด้วย Magic Link
            </Link>
          </div>
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
