'use client';

/**
 * Customer Login Page — 08-auth.md §4.1.
 * Email + password login with brute-force lockout.
 */

import { useState } from 'react';
import Link from 'next/link';
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/utils/cn';
import { loginCustomer } from '@/api/customerAuth';

export default function LoginPage(): React.JSX.Element {
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

    const result = await loginCustomer({ email, password, rememberMe });

    if (result.success) {
      // In production: store access token in memory, set refresh cookie
      window.location.href = '/account/dashboard';
    } else {
      if (result.error === 'ACCOUNT_LOCKED') {
        const retryMin = Math.ceil((result.retryAfterMs ?? 0) / 60000);
        setError(`บัญชีถูกล็อคชั่วคราว กรุณารอ ${retryMin} นาที`);
      } else if (result.error === 'ACCOUNT_BLOCKED') {
        setError('บัญชีถูกบล็อค กรุณาติดต่อฝ่ายสนับสนุน');
      } else {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      }
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-2xl font-bold text-ink-100">เข้าสู่ระบบ</h1>
          <p className="text-sm text-ink-400">เข้าสู่ระบบเพื่อจัดการคำสั่งซื้อและโค้ดของคุณ</p>
        </div>

        <div className="rounded-lg border border-ink-700 bg-ink-850 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="mb-1 block text-sm text-ink-300">อีเมล</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-md border border-ink-700 bg-ink-800 py-2 pl-9 pr-3 text-sm text-ink-100 placeholder:text-ink-500 focus:border-amber-700 focus:outline-none"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1 block text-sm text-ink-300">รหัสผ่าน</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-md border border-ink-700 bg-ink-800 py-2 pl-9 pr-10 text-sm text-ink-100 placeholder:text-ink-500 focus:border-amber-700 focus:outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-200"
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
                className="rounded"
              />
              <span className="text-sm text-ink-400">จดจำฉัน</span>
            </label>

            {/* Error */}
            {error && (
              <div className="rounded-md border border-crimson-700/50 bg-crimson-900/10 px-3 py-2 text-sm text-crimson-400">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-400 px-4 py-2.5 text-sm font-medium text-ink-900 hover:bg-amber-300 disabled:opacity-50"
            >
              <LogIn size={16} />
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          {/* Magic Link */}
          <div className="mt-4 border-t border-ink-700 pt-4 text-center">
            <Link href="/account/magic-link" className="text-sm text-amber-400 hover:text-amber-300">
              เข้าสู่ระบบด้วย Magic Link
            </Link>
          </div>
        </div>

        {/* Register link */}
        <p className="mt-4 text-center text-sm text-ink-400">
          ยังไม่มีบัญชี?{' '}
          <Link href="/account/register" className="text-amber-400 hover:text-amber-300">
            สมัครสมาชิก
          </Link>
        </p>
      </div>
    </div>
  );
}
