'use client';

import { useState } from 'react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminFetch } from '@/lib/adminSession';

/**
 * ONE-CLICK TEST SETUP (dev only — the backing endpoint 404s in production).
 * Seeds a test customer with ฿100 wallet credit and up to 2 encrypted test
 * codes, so the A–E walkthrough can start instantly.
 */

interface SeedResult {
  success?: boolean;
  customer?: { email: string; walletCreditThb: number };
  variant?: { productName: string; price: number };
  availableCodes?: number;
  codesAdded?: number;
  note?: string;
  error?: string;
}

export default function DevSeedPage(): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seed = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch('/api/v1/admin/dev-seed', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as SeedResult;
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        setResult(null);
        return;
      }
      setResult(body);
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'Dev Seed' }]}>
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold text-fg">สร้างข้อมูลทดสอบ (Dev only)</h1>
        <p className="text-sm text-fg-muted">
          ปุ่มเดียวจบ: สร้างลูกค้าทดสอบพร้อมเครดิต ฿100 + เติมโค้ดทดสอบ 2 ชิ้นในสินค้าราคาถูกสุด
          ใช้กับ flow: ซื้อด้วยเครดิต → โค้ดส่งทันที → ยืนยันสลิปแมนนวล → เครดิตไม่พอ
        </p>
        <button
          onClick={() => void seed()}
          disabled={busy}
          className="rounded-md bg-peach-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-peach-400 disabled:opacity-50"
        >
          {busy ? 'กำลังสร้าง...' : '🧪 สร้างข้อมูลทดสอบ'}
        </button>

        {error && (
          <div className="border-error bg-error rounded-md border px-4 py-3 text-sm text-fg-error">
            {error}
          </div>
        )}

        {result?.success && (
          <div className="space-y-2 rounded-md border border-jade-500/40 bg-jade-500/10 px-4 py-3 text-sm text-jade-700">
            <p className="font-semibold">สร้างเรียบร้อย ✓</p>
            <p>
              ลูกค้า: <code className="font-mono">{result.customer?.email}</code> — เครดิต ฿
              {result.customer?.walletCreditThb}
            </p>
            <p>
              โค้ดทดสอบบน &quot;{result.variant?.productName}&quot; (฿{result.variant?.price}) —
              พร้อมขายทั้งหมด {result.availableCodes} ชิ้น
              {result.codesAdded ? ` (เพิ่มใหม่ ${result.codesAdded})` : ' (มีอยู่แล้ว)'}
            </p>
            <p className="text-jade-600 text-xs">{result.note}</p>
            <p className="text-xs text-fg-muted">
              ขั้นตอนต่อ: สมัคร/ล็อกอินเป็นลูกค้า → ซื้อสินค้านี้ด้วยเครดิต → เช็ค /account/codes
            </p>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
