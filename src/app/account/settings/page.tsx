'use client';

/**
 * Settings Page — 12-dashboard.md §12, 01-prd.md FR-073.
 * Account settings: name, phone, marketing preferences.
 */

import { useState } from 'react';
import { Save, CheckCircle } from 'lucide-react';

export default function AccountSettingsPage(): React.JSX.Element {
  const [fullName, setFullName] = useState('แก้ม สีดำ');
  const [phoneNumber, setPhoneNumber] = useState('0812345678');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    // Mock: save settings
    await new Promise((r) => setTimeout(r, 500));
    setSaved(true);
    setLoading(false);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-fg">ตั้งค่าบัญชี</h1>

      {saved && (
        <div className="flex items-center gap-2 rounded-md border border-jade-500/40 bg-jade-500/10 px-4 py-3 text-sm text-jade-700">
          <CheckCircle size={16} /> บันทึกสำเร็จ
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Profile */}
        <div className="rounded-md border border-line-subtle bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg">ข้อมูลส่วนตัว</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-fg-muted">อีเมล</label>
              <input
                type="email"
                value="kaem@example.com"
                disabled
                className="text-clay-9000 w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm"
              />
              <p className="text-clay-9000 mt-1 text-xs">อีเมลไม่สามารถเปลี่ยนแปลงได้</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-fg-muted">ชื่อ-นามสกุล</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-fg focus:border-line-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-fg-muted">หมายเลขโทรศัพท์</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-fg focus:border-line-brand focus:outline-none"
                placeholder="08XXXXXXXX"
              />
            </div>
          </div>
        </div>

        {/* Marketing */}
        <div className="rounded-md border border-line-subtle bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg">การตลาด</h2>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="rounded"
            />
            <div>
              <p className="text-sm text-fg-secondary">รับข่าวสารและโปรโมชั่น</p>
              <p className="text-clay-9000 text-xs">รับอีเมลเกี่ยวกับโปรโมชั่นและสินค้าใหม่</p>
            </div>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-peach-500 px-4 py-2 text-sm font-medium text-white hover:bg-peach-400 disabled:opacity-50"
        >
          <Save size={14} />
          {loading ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </form>
    </div>
  );
}
