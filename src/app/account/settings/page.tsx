'use client';

/**
 * Settings Page — 12-dashboard.md §12, 01-prd.md FR-073.
 * Account settings: name, phone, marketing preferences — saved for real via
 * PATCH /api/v1/auth/me. The profile comes from the shared layout context
 * (single /me fetch per mount — the page no longer refetches); after a save
 * it pushes the updated profile back into the context so the rest of the
 * account UI stays in sync without another request. Theme uses semantic
 * tokens so text stays readable in dark mode.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle, Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useCustomerProfile } from '@/components/layout/CustomerProfileProvider';
import { cn } from '@/utils/cn';

export default function AccountSettingsPage(): React.JSX.Element {
  const router = useRouter();
  const { profile, setProfile } = useCustomerProfile();
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form fields from the shared profile when it arrives (and after
  // each save, so the form always reflects server state).
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName ?? '');
    setPhoneNumber(profile.phoneNumber ?? '');
    setMarketingOptIn(profile.marketingOptIn);
    setHydrated(true);
  }, [profile]);

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    // Review: never save against defaults — if the profile never loaded we
    // would overwrite existing values with empty ones.
    if (!profile || saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Review: omit an unchanged name so nameless accounts (registration
          // allows null) can still save phone/marketing preferences.
          ...(fullName !== (profile.fullName ?? '') && { fullName }),
          phoneNumber,
          marketingOptIn,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        customer?: typeof profile;
      };
      if (!res.ok || !data.success) {
        const MSG: Record<string, string> = {
          INVALID_PHONE: 'หมายเลขโทรศัพท์ไม่ถูกต้อง (0XXXXXXXXX)',
          NAME_REQUIRED: 'กรุณากรอกชื่อ-นามสกุล',
        };
        throw new Error(MSG[data.error ?? ''] ?? 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
      }
      if (data.customer) setProfile(data.customer);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full bg-surface p-2.5 text-fg-muted shadow-clay-sm transition-transform duration-fast ease-out-quart hover:scale-105 active:scale-90"
          aria-label="ย้อนกลับ"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-2xl font-bold text-fg">ตั้งค่าบัญชี</h1>
      </div>

      {saved && (
        <div className="dark:text-jade-300 flex items-center gap-2 rounded-lg bg-jade-500/10 px-4 py-3 text-sm text-jade-700">
          <CheckCircle size={16} /> บันทึกสำเร็จ
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-coral-50 px-4 py-3 text-sm text-coral-700 dark:bg-coral-900/20 dark:text-coral-300">
          {error}
        </p>
      )}

      {!profile || !hydrated ? (
        // The layout guard guarantees an authed profile here; this neutral
        // state only covers the instant before hydration (never an editable
        // form backed by empty defaults).
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-fg-placeholder">
          <Loader2 size={16} className="animate-spin" /> กำลังโหลด…
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Profile */}
          <div className="clay-card rounded-2xl p-6">
            <h2 className="mb-4 text-lg font-semibold text-fg">ข้อมูลส่วนตัว</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="settings-email" className="mb-1 block text-sm text-fg-muted">
                  อีเมล
                </label>
                <input
                  id="settings-email"
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full rounded-full border border-line bg-surface-base px-4 py-2.5 text-sm text-fg-muted"
                />
                <p className="mt-1 text-xs text-fg-placeholder">อีเมลไม่สามารถเปลี่ยนแปลงได้</p>
              </div>
              <div>
                <label htmlFor="settings-name" className="mb-1 block text-sm text-fg-muted">
                  ชื่อ-นามสกุล
                </label>
                <input
                  id="settings-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-fg focus:border-peach-400"
                />
              </div>
              <div>
                <label htmlFor="settings-phone" className="mb-1 block text-sm text-fg-muted">
                  หมายเลขโทรศัพท์
                </label>
                <input
                  id="settings-phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-fg focus:border-peach-400"
                  placeholder="08XXXXXXXX"
                />
              </div>
            </div>
          </div>

          {/* Marketing */}
          <div className="clay-card rounded-2xl p-6">
            <h2 className="mb-4 text-lg font-semibold text-fg">การตลาด</h2>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
                className="size-4 rounded accent-peach-500"
              />
              <div>
                <p className="text-sm text-fg">รับข่าวสารและโปรโมชั่น</p>
                <p className="text-xs text-fg-muted">รับอีเมลเกี่ยวกับโปรโมชั่นและสินค้าใหม่</p>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className={cn(
              'inline-flex items-center gap-2 rounded-full bg-peach-500 px-5 py-2.5 text-sm font-semibold text-white shadow-clay-sm',
              'transition-transform duration-fast ease-out-quart hover:scale-105 active:scale-90 disabled:opacity-50',
            )}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </form>
      )}
    </div>
  );
}
