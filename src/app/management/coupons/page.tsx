'use client';

/**
 * Admin Coupons Page — 07-api.md §25.
 * Coupon management: list, create, edit, toggle, delete.
 */

import { useState } from 'react';
import { Plus, Edit, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import {
  adminListCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminToggleCoupon,
  adminDeleteCoupon,
  type Coupon,
} from '@/api/coupons';

export default function AdminCouponsPage(): React.JSX.Element {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Create/Edit form state
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDiscountValue, setFormDiscountValue] = useState(10);
  const [formScope, setFormScope] = useState<'cart' | 'product' | 'category'>('cart');
  const [formUsageLimit, setFormUsageLimit] = useState('');
  const [formPerCustomerLimit, setFormPerCustomerLimit] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');

  const handleLoad = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const result = await adminListCoupons({});
      setCoupons(result.data);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormCode('');
    setFormDescription('');
    setFormDiscountValue(10);
    setFormScope('cart');
    setFormUsageLimit('');
    setFormPerCustomerLimit('');
    setFormExpiresAt('');
    setEditingCoupon(null);
    setShowCreateForm(false);
  };

  const handleCreate = async () => {
    const params: Parameters<typeof adminCreateCoupon>[0] = {
      code: formCode,
      description: formDescription,
      discountValue: formDiscountValue,
      scope: formScope,
    };
    if (formUsageLimit) params.usageLimit = parseInt(formUsageLimit);
    if (formPerCustomerLimit) params.perCustomerLimit = parseInt(formPerCustomerLimit);
    if (formExpiresAt) params.expiresAt = new Date(formExpiresAt);

    const result = await adminCreateCoupon(params, 'staff-001', 'founder@nong-kati.co.th');
    if (result.error) {
      setActionMessage(result.error === 'COUPON_CODE_EXISTS' ? 'รหัสคูปองนี้มีอยู่แล้ว' : result.error);
    } else {
      setActionMessage('สร้างคูปองสำเร็จ');
      resetForm();
      handleLoad();
    }
  };

  const handleUpdate = async () => {
    if (!editingCoupon) return;

    const params: Parameters<typeof adminUpdateCoupon>[1] = {
      description: formDescription,
      discountValue: formDiscountValue,
      scope: formScope,
    };
    if (formUsageLimit) params.usageLimit = parseInt(formUsageLimit);
    else params.usageLimit = null;
    if (formPerCustomerLimit) params.perCustomerLimit = parseInt(formPerCustomerLimit);
    else params.perCustomerLimit = null;
    if (formExpiresAt) params.expiresAt = new Date(formExpiresAt);
    else params.expiresAt = null;

    const result = await adminUpdateCoupon(editingCoupon.id, params, 'staff-001', 'founder@nong-kati.co.th');
    if (result.error) {
      setActionMessage(result.error);
    } else {
      setActionMessage('อัปเดตคูปองสำเร็จ');
      resetForm();
      handleLoad();
    }
  };

  const handleToggle = async (couponId: string, currentActive: boolean) => {
    const result = await adminToggleCoupon(couponId, !currentActive, 'staff-001', 'founder@nong-kati.co.th');
    if (result.data) {
      setActionMessage(currentActive ? 'ปิดใช้งานคูปอง' : 'เปิดใช้งานคูปอง');
      handleLoad();
    }
  };

  const handleDelete = async (couponId: string) => {
    const result = await adminDeleteCoupon(couponId, 'staff-001', 'founder@nong-kati.co.th');
    if (result.error) {
      setActionMessage(result.error === 'COUPON_HAS_USAGES' ? 'ไม่สามารถลบคูปองที่ถูกใช้งานแล้ว' : result.error);
    } else {
      setActionMessage('ลบคูปองสำเร็จ');
      handleLoad();
    }
  };

  const startEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormCode(coupon.code);
    setFormDescription(coupon.description);
    setFormDiscountValue(coupon.discountValue);
    setFormScope(coupon.scope);
    setFormUsageLimit(coupon.usageLimit?.toString() ?? '');
    setFormPerCustomerLimit(coupon.perCustomerLimit?.toString() ?? '');
    setFormExpiresAt(coupon.expiresAt?.toISOString().slice(0, 10) ?? '');
    setShowCreateForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-100">คูปอง</h1>
        <div className="flex gap-3">
          <button
            onClick={handleLoad}
            disabled={loading}
            className="rounded-md border border-ink-700 px-4 py-2 text-sm text-ink-200 hover:bg-ink-800"
          >
            {loading ? 'กำลังโหลด...' : 'โหลด'}
          </button>
          <button
            onClick={() => { resetForm(); setShowCreateForm(true); }}
            className="inline-flex items-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-amber-300"
          >
            <Plus size={16} /> สร้างคูปอง
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="rounded-md border border-jade-700/50 bg-jade-900/10 px-4 py-3 text-sm text-jade-300">
          {actionMessage}
        </div>
      )}

      {/* Create/Edit Form */}
      {showCreateForm && (
        <div className="rounded-md border border-ink-700 bg-ink-850 p-6">
          <h2 className="mb-4 text-lg font-semibold text-ink-100">
            {editingCoupon ? 'แก้ไขคูปอง' : 'สร้างคูปองใหม่'}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {!editingCoupon && (
              <div>
                <label className="mb-1 block text-sm text-ink-300">รหัสคูปอง *</label>
                <input
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  className="w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 font-mono focus:border-amber-700 focus:outline-none"
                  placeholder="SUMMER10"
                  maxLength={20}
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm text-ink-300">คำอธิบาย *</label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 focus:border-amber-700 focus:outline-none"
                placeholder="ลด 10% ทุกสินค้า"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ink-300">ส่วนลด (%) *</label>
              <input
                type="number"
                value={formDiscountValue}
                onChange={(e) => setFormDiscountValue(parseFloat(e.target.value) || 0)}
                min={0.01}
                max={100}
                step={0.01}
                className="w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 focus:border-amber-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ink-300">ขอบเขต</label>
              <select
                value={formScope}
                onChange={(e) => setFormScope(e.target.value as typeof formScope)}
                className="w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 focus:border-amber-700 focus:outline-none"
              >
                <option value="cart">ทั้งตะกร้า</option>
                <option value="product">ตามสินค้า</option>
                <option value="category">ตามหมวดหมู่</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-ink-300">จำกัดการใช้งาน</label>
              <input
                type="number"
                value={formUsageLimit}
                onChange={(e) => setFormUsageLimit(e.target.value)}
                className="w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 focus:border-amber-700 focus:outline-none"
                placeholder="ไม่จำกัด"
                min={1}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ink-300">จำกัดต่อลูกค้า</label>
              <input
                type="number"
                value={formPerCustomerLimit}
                onChange={(e) => setFormPerCustomerLimit(e.target.value)}
                className="w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 focus:border-amber-700 focus:outline-none"
                placeholder="ไม่จำกัด"
                min={1}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ink-300">วันหมดอายุ</label>
              <input
                type="date"
                value={formExpiresAt}
                onChange={(e) => setFormExpiresAt(e.target.value)}
                className="w-full rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-100 focus:border-amber-700 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={editingCoupon ? handleUpdate : handleCreate}
              disabled={!formDescription || formDiscountValue <= 0}
              className="rounded-md bg-amber-400 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-amber-300 disabled:opacity-50"
            >
              {editingCoupon ? 'บันทึก' : 'สร้าง'}
            </button>
            <button
              onClick={resetForm}
              className="rounded-md border border-ink-700 px-4 py-2 text-sm text-ink-300 hover:bg-ink-800"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      <div className="text-sm text-ink-400">พบ {total} รายการ</div>

      {/* Coupons Table */}
      <div className="overflow-x-auto rounded-md border border-ink-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-700 bg-ink-800">
              <th className="px-4 py-3 text-left font-medium text-ink-300">รหัส</th>
              <th className="px-4 py-3 text-left font-medium text-ink-300">คำอธิบาย</th>
              <th className="px-4 py-3 text-center font-medium text-ink-300">ส่วนลด</th>
              <th className="px-4 py-3 text-center font-medium text-ink-300">ขอบเขต</th>
              <th className="px-4 py-3 text-center font-medium text-ink-300">ใช้แล้ว</th>
              <th className="px-4 py-3 text-center font-medium text-ink-300">สถานะ</th>
              <th className="px-4 py-3 text-center font-medium text-ink-300">หมดอายุ</th>
              <th className="px-4 py-3 text-right font-medium text-ink-300">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink-500">
                  {loading ? 'กำลังโหลด...' : 'กด "โหลด" เพื่อแสดงคูปอง'}
                </td>
              </tr>
            ) : (
              coupons.map((coupon) => {
                const now = new Date();
                const isExpired = coupon.expiresAt && coupon.expiresAt < now;
                return (
                  <tr key={coupon.id} className="border-b border-ink-700/50 hover:bg-ink-850">
                    <td className="px-4 py-3 font-mono text-xs text-amber-300">{coupon.code}</td>
                    <td className="px-4 py-3 text-ink-200">{coupon.description}</td>
                    <td className="px-4 py-3 text-center text-ink-200">{coupon.discountValue}%</td>
                    <td className="px-4 py-3 text-center text-xs text-ink-400">{coupon.scope}</td>
                    <td className="px-4 py-3 text-center text-ink-300">
                      {coupon.usageCount}{coupon.usageLimit ? `/${coupon.usageLimit}` : ''}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                        isExpired ? 'bg-ink-800 text-ink-500' :
                        coupon.isActive ? 'bg-jade-900/30 text-jade-400' :
                        'bg-crimson-900/30 text-crimson-400'
                      )}>
                        {isExpired ? 'หมดอายุ' : coupon.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-ink-400">
                      {coupon.expiresAt ? coupon.expiresAt.toLocaleDateString('th-TH') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => startEdit(coupon)}
                          className="rounded p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                          title="แก้ไข"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleToggle(coupon.id, coupon.isActive)}
                          className="rounded p-1.5 text-ink-400 hover:bg-ink-800 hover:text-amber-300"
                          title={coupon.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        >
                          {coupon.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                        {coupon.usageCount === 0 && (
                          <button
                            onClick={() => handleDelete(coupon.id)}
                            className="rounded p-1.5 text-ink-400 hover:bg-crimson-900/20 hover:text-crimson-400"
                            title="ลบ"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
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
  );
}
