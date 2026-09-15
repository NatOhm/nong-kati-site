'use client';

/**
 * Customer Registration Page — 08-auth.md §4.1.
 * Email + password registration.
 */

import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { registerCustomer } from '@/api/customerAuth';

export default function RegisterPage(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      setLoading(false);
      return;
    }

    const params: Parameters<typeof registerCustomer>[0] = { email, password, marketingOptIn };
    if (fullName) params.fullName = fullName;
    const result = await registerCustomer(params);

    if (result.success) {
      setSuccess(true);
    } else {
      setError(
        result.error === 'EMAIL_ALREADY_EXISTS'
          ? 'อีเมลนี้ถูกใช้งานแล้ว'
          : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
      );
    }

    setLoading(false);
  };

  if (success) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 text-4xl">✉️</div>
          <h1 className="mb-2 text-2xl font-bold text-clay-900">สมัครสมาชิกสำเร็จ</h1>
          <p className="mb-6 text-sm text-clay-500">
            เราได้ส่งลิงก์ยืนยันไปยังอีเมลของคุณแล้ว กรุณาคลิกลิงก์ในอีเมลเพื่อยืนยันบัญชี
          </p>
          <Link
            href="/account/login"
            className="inline-block rounded-md bg-peach-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-peach-400"
          >
            ไปที่หน้าเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-2xl font-bold text-clay-900">สมัครสมาชิก</h1>
          <p className="text-sm text-clay-500">สร้างบัญชีเพื่อจัดการคำสั่งซื้อและโค้ด</p>
        </div>

        <div className="rounded-lg border border-clay-200 bg-white p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="mb-1 block text-sm text-clay-600">ชื่อ-นามสกุล (ไม่บังคับ)</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="placeholder:text-clay-9000 w-full rounded-md border border-clay-200 bg-clay-100 px-3 py-2 text-sm text-clay-900 focus:border-peach-300 focus:outline-none"
                placeholder="ชื่อที่แสดง"
              />
            </div>

            {/* Email */}
            <div>
              <label className="mb-1 block text-sm text-clay-600">อีเมล *</label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-clay-500"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="placeholder:text-clay-9000 w-full rounded-md border border-clay-200 bg-clay-100 py-2 pl-9 pr-3 text-sm text-clay-900 focus:border-peach-300 focus:outline-none"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1 block text-sm text-clay-600">รหัสผ่าน *</label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-clay-500"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="placeholder:text-clay-9000 w-full rounded-md border border-clay-200 bg-clay-100 py-2 pl-9 pr-10 text-sm text-clay-900 focus:border-peach-300 focus:outline-none"
                  placeholder="อย่างน้อย 8 ตัวอักษร"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-clay-500 hover:text-clay-700"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="mb-1 block text-sm text-clay-600">ยืนยันรหัสผ่าน *</label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-clay-500"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="placeholder:text-clay-9000 w-full rounded-md border border-clay-200 bg-clay-100 py-2 pl-9 pr-3 text-sm text-clay-900 focus:border-peach-300 focus:outline-none"
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                />
              </div>
            </div>

            {/* Marketing opt-in */}
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span className="text-xs text-clay-500">
                ต้องการรับข่าวสารและโปรโมชั่นจาก Nong-Kati
              </span>
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
              disabled={loading || !email || !password || !confirmPassword}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-peach-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-peach-400 disabled:opacity-50"
            >
              <UserPlus size={16} />
              {loading ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-clay-500">
          มีบัญชีอยู่แล้ว?{' '}
          <Link href="/account/login" className="text-peach-600 hover:text-peach-700">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  );
}
