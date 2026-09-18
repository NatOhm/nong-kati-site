'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Plus, Trash2, Power } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';

/**
 * Admin Coupons — real coupon CRUD from /api/v1/admin/coupons.
 * โค้ดส่วนลดแบบ บาท/% + ยอดขั้นต่ำ + จำนวนจำกัด + วันหมดอายุ
 * (ตามลิสต์ลูกค้า: คูปองส่วนลด & โปรโมชันพื้นฐาน).
 */

interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discountType: 'percent' | 'amount';
  discountValue: number;
  minSpendThb: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usageCount: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export default function AdminCouponsPage(): React.JSX.Element {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // create form
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [minSpend, setMinSpend] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminJson<{ coupons: CouponRow[] }>('/api/v1/admin/coupons');
      setCoupons(data.coupons);
    } catch {
      setErr('โหลดคูปองไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setErr(null);
    setMsg(null);
    if (!code.trim() || !discountValue) {
      setErr('กรอกโค้ดและมูลค่าส่วนลดให้ครบ');
      return;
    }
    setSaving(true);
    try {
      await adminJson('/api/v1/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          description: description.trim() || undefined,
          discountType,
          discountValue: Number(discountValue),
          minSpendThb: minSpend ? Number(minSpend) : undefined,
          usageLimit: usageLimit ? Number(usageLimit) : undefined,
          expiresAt: expiresAt || undefined,
        }),
      });
      setMsg(`สร้างคูปอง ${code.trim().toUpperCase()} สำเร็จ`);
      setCode('');
      setDescription('');
      setDiscountValue('');
      setMinSpend('');
      setUsageLimit('');
      setExpiresAt('');
      setCreating(false);
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setErr(
        m.includes('CODE_TAKEN')
          ? 'โค้ดนี้ถูกใช้แล้ว'
          : m.includes('INVALID')
            ? 'ข้อมูลไม่ถูกต้อง (ตรวจมูลค่า/จำนวน/วันที่)'
            : 'สร้างไม่สำเร็จ',
      );
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c: CouponRow) => {
    setErr(null);
    try {
      await adminJson(`/api/v1/admin/coupons/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      await load();
    } catch {
      setErr('เปลี่ยนสถานะไม่สำเร็จ');
    }
  };

  const remove = async (c: CouponRow) => {
    if (!window.confirm(`ลบคูปอง ${c.code} ถาวร?`)) return;
    setErr(null);
    try {
      await adminJson(`/api/v1/admin/coupons/${c.id}`, { method: 'DELETE' });
      setMsg(`ลบคูปอง ${c.code} แล้ว`);
      await load();
    } catch {
      setErr('ลบไม่สำเร็จ');
    }
  };

  const inputCls =
    'h-9 w-full rounded-md border border-line bg-surface px-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:border-line-brand focus:outline-none';

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'คูปองส่วนลด' }]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg">คูปองส่วนลด</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setCreating((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md bg-peach-500 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-peach-400"
            >
              <Plus size={14} /> สร้างคูปอง
            </button>
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle px-3 py-1.5 text-sm text-fg-secondary hover:bg-surface"
            >
              <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {msg && (
          <div className="rounded-md border border-jade-500/40 bg-jade-500/10 px-4 py-3 text-sm text-jade-700">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-md border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700">
            {err}
          </div>
        )}

        {/* Create form */}
        {creating && (
          <div className="rounded-md border border-line-subtle bg-surface p-5">
            <h2 className="mb-4 text-base font-semibold text-fg">สร้างคูปองใหม่</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-fg-muted">โค้ด *</label>
                <input
                  className={inputCls}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="SUMMER10"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">ประเภท</label>
                <select
                  className={inputCls}
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as 'percent' | 'amount')}
                >
                  <option value="percent">ลดเปอร์เซ็นต์ (%)</option>
                  <option value="amount">ลดเป็นจำนวนเงิน (บาท)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">
                  {discountType === 'percent' ? 'มูลค่า (%) *' : 'มูลค่า (บาท) *'}
                </label>
                <input
                  className={inputCls}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder={discountType === 'percent' ? '10' : '50'}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">ยอดซื้อขั้นต่ำ (บาท)</label>
                <input
                  className={inputCls}
                  value={minSpend}
                  onChange={(e) => setMinSpend(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="ไม่จำกัด"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">จำนวนจำกัด (ครั้ง)</label>
                <input
                  className={inputCls}
                  value={usageLimit}
                  onChange={(e) => setUsageLimit(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="ไม่จำกัด"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">หมดอายุวันที่</label>
                <input
                  type="date"
                  className={inputCls}
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1 block text-xs text-fg-muted">คำอธิบาย</label>
                <input
                  className={inputCls}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="เช่น ลด 10% ทุกสินค้า"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void create()}
                disabled={saving}
                className="bg-jade-600 rounded-md px-4 py-2 text-sm font-semibold text-white hover:bg-jade-500 disabled:opacity-60"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกคูปอง'}
              </button>
              <button
                onClick={() => setCreating(false)}
                className="rounded-md border border-line px-4 py-2 text-sm text-fg-secondary hover:bg-surface"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {/* Coupon list */}
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface">
                <th className="px-4 py-3 text-left font-medium text-fg-muted">โค้ด</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">ส่วนลด</th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">ขั้นต่ำ</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">ใช้ไป</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">หมดอายุ</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">สถานะ</th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>                    <td colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                      ยังไม่มีคูปอง — กด สร้างคูปอง ด้านบนเพื่อเริ่ม
                    </td>
                </tr>
              ) : (
                coupons.map((c) => {
                  const expired = c.expiresAt !== null && new Date(c.expiresAt) < new Date();
                  return (
                    <tr key={c.id} className="border-b border-line-subtle hover:bg-surface">
                      <td className="px-4 py-3">
                        <p className="font-mono font-semibold text-fg">{c.code}</p>
                        {c.description && <p className="text-xs text-fg-muted">{c.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">
                        {c.discountType === 'percent'
                          ? `${c.discountValue}%`
                          : formatThb(c.discountValue)}
                      </td>
                      <td className="px-4 py-3 text-right text-fg-muted">
                        {c.minSpendThb === null ? '—' : formatThb(c.minSpendThb)}
                      </td>
                      <td className="px-4 py-3 text-center text-fg-secondary">
                        {c.usageCount}
                        {c.usageLimit !== null ? ` / ${c.usageLimit}` : ''}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {c.expiresAt === null ? (
                          <span className="text-fg-muted">ไม่มี</span>
                        ) : expired ? (
                          <span className="text-coral-600">
                            {new Date(c.expiresAt).toLocaleDateString('th-TH')} (หมดแล้ว)
                          </span>
                        ) : (
                          <span className="text-fg-secondary">
                            {new Date(c.expiresAt).toLocaleDateString('th-TH')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            c.isActive && !expired
                              ? 'bg-jade-500/15 text-jade-700'
                              : 'bg-surface-sunken text-fg-muted',
                          )}
                        >
                          {expired ? 'หมดอายุ' : c.isActive ? 'ใช้งาน' : 'ปิด'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => void toggle(c)}
                            className="inline-flex items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-fg-muted hover:bg-clay-300 hover:text-fg"
                            title={c.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          >
                            <Power size={12} /> {c.isActive ? 'ปิด' : 'เปิด'}
                          </button>
                          <button
                            onClick={() => void remove(c)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-coral-600 hover:bg-coral-50"
                            title="ลบ"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
