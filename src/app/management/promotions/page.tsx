'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Plus, Trash2, Power, Edit2 } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';

/** Promotions admin page — manage automatic discount promotions. */
interface PromotionRow {
  id: string;
  name: string;
  description: string | null;
  scope: 'all' | 'selected';
  discountType: 'percent' | 'amount';
  discountValue: number;
  productIds: string[];
  minSpendThb: number | null;
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export default function AdminPromotionsPage(): React.JSX.Element {
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // create/edit form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [productIds, setProductIds] = useState('');
  const [minSpend, setMinSpend] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminJson<{ promotions: PromotionRow[] }>(
        '/api/v1/admin/promotions',
      );
      setPromotions(data.promotions);
    } catch {
      setErr('โหลดโปรโมชันไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setScope('all');
    setDiscountType('percent');
    setDiscountValue('');
    setProductIds('');
    setMinSpend('');
    setStartsAt('');
    setExpiresAt('');
    setEditingId(null);
  };

  const startCreate = () => {
    resetForm();
    setCreating(true);
  };

  const startEdit = (p: PromotionRow) => {
    setEditingId(p.id);
    setName(p.name);
    setDescription(p.description ?? '');
    setScope(p.scope);
    setDiscountType(p.discountType);
    setDiscountValue(String(p.discountValue));
    setProductIds(
      p.scope === 'selected' && p.productIds.length > 0
        ? p.productIds.join(', ')
        : '',
    );
    setMinSpend(p.minSpendThb?.toString() ?? '');
    setStartsAt(p.startsAt ? new Date(p.startsAt).toISOString().slice(0, 16) : '');
    setExpiresAt(p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 16) : '');
    setCreating(true);
  };

  const createOrUpdate = async () => {
    setErr(null);
    if (!name.trim()) {
      setErr('กรอกชื่อโปรโมชันให้ครบ');
      return;
    }
    if (!discountValue) {
      setErr('กรอกมูลค่าส่วนลดให้ครบ');
      return;
    }
    if (scope === 'selected' && !productIds.trim()) {
      setErr('เลือกสินค้าอย่างน้อยหนึ่งรายการสำหรับโปรโมชันแบบเจาะจง');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        scope,
        discountType,
        discountValue: Number(discountValue),
        minSpendThb: minSpend ? Number(minSpend) : undefined,
        startsAt: startsAt || undefined,
        expiresAt: expiresAt || undefined,
      };

      if (scope === 'selected') {
        const ids = productIds
          .split(/[,，\s]+/)
          .map((s) => s.trim())
          .filter((s) => s);
        if (ids.length > 0) body.productIds = ids;
      }

      if (editingId) {
        await adminJson(`/api/v1/admin/promotions/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setMsg('บันทึกโปรโมชันแล้ว');
      } else {
        await adminJson('/api/v1/admin/promotions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setMsg('สร้างโปรโมชันใหม่สำเร็จ');
      }

      resetForm();
      setCreating(false);
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (m.includes('PRODUCT_IDS_REQUIRED') || m.includes('INVALID_PRODUCT_IDS')) {
        setErr('สินค้าไม่ถูกต้อง — ตรวจสอบว่าสินค้าที่เลือกยังมีอยู่และใช้งานได้');
      } else if (m.includes('INVALID')) {
        setErr('ข้อมูลไม่ถูกต้อง (ตรวจสอบมูลค่า/วันที่/สินค้า)');
      } else {
        setErr('บันทึกไม่สำเร็จ');
      }
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: PromotionRow) => {
    setErr(null);
    try {
      await adminJson(`/api/v1/admin/promotions/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      await load();
    } catch {
      setErr('เปลี่ยนสถานะไม่สำเร็จ');
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`ลบโปรโมชัน "${name}" ถาวร?`)) return;
    setDeleting(id);
    setErr(null);
    try {
      await adminJson(`/api/v1/admin/promotions/${id}`, { method: 'DELETE' });
      setMsg(`ลบโปรโมชัน "${name}" แล้ว`);
      await load();
    } catch {
      setErr('ลบไม่สำเร็จ');
    } finally {
      setDeleting(null);
    }
  };

  const inputCls =
    'h-9 w-full rounded-md border border-line bg-surface px-2.5 text-sm text-fg placeholder:text-fg-placeholder focus:border-line-brand';

  const isExpired = (p: PromotionRow) => {
    if (!p.expiresAt) return false;
    return new Date(p.expiresAt) < new Date();
  };

  const isNotYetActive = (p: PromotionRow) => {
    if (!p.startsAt) return false;
    return new Date(p.startsAt) > new Date();
  };

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'โปรโมชัน' }]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg">โปรโมชัน</h1>
          <div className="flex gap-2">
            <button
              onClick={() => (creating ? setCreating(false) : startCreate())}
              className="inline-flex items-center gap-1.5 rounded-md bg-peach-500 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-peach-400"
            >
              <Plus size={14} /> {creating ? 'ยกเลิก' : 'สร้างโปรโมชัน'}
            </button>
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle px-3 py-1.5 text-sm text-fg-secondary hover:bg-surface"
            >
              <RefreshCw
                size={14}
                className={cn(loading && 'animate-spin')}
              />
            </button>
          </div>
        </div>

        {msg && (
          <div className="rounded-md border border-jade-500/40 bg-jade-500/10 px-4 py-3 text-sm text-jade-700">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-md border-error bg-error border px-4 py-3 text-sm text-fg-error">
            {err}
          </div>
        )}

        {/* Create/edit form */}
        {creating && (
          <div className="rounded-md border border-line-subtle bg-surface p-5">
            <h2 className="mb-4 text-base font-semibold text-fg">
              {editingId ? 'แก้ไขโปรโมชัน' : 'สร้างโปรโมชันใหม่'}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-fg-muted">
                  ชื่อโปรโมชัน *
                </label>
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น ลด 20% ทุกสินค้า"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">คำอธิบาย</label>
                <input
                  className={inputCls}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="คำอธิบายสำหรับลูกค้า ( Thai )"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">ประเภทส่วนลด</label>
                <select
                  className={inputCls}
                  value={discountType}
                  onChange={(e) =>
                    setDiscountType(e.target.value as 'percent' | 'amount')
                  }
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
                  onChange={(e) =>
                    setDiscountValue(e.target.value.replace(/[^0-9.]/g, ''))
                  }
                  placeholder={discountType === 'percent' ? '20' : '50'}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">ขอบเขต</label>
                <select
                  className={inputCls}
                  value={scope}
                  onChange={(e) =>
                    setScope(e.target.value as 'all' | 'selected')
                  }
                >
                  <option value="all">ทั้งร้าน (ทุกสินค้า)</option>
                  <option value="selected">เจาะจงสินค้า</option>
                </select>
              </div>
              {scope === 'selected' && (
                <div>
                  <label className="mb-1 block text-xs text-fg-muted">
                    สินค้า (คั่นด้วยลูกน้ำ หรือช่องว่าง)
                  </label>
                  <input
                    className={inputCls}
                    value={productIds}
                    onChange={(e) => setProductIds(e.target.value)}
                    placeholder="เช่น sku-001, sku-002"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-fg-muted">ยอดซื้อขั้นต่ำ (บาท)</label>
                <input
                  className={inputCls}
                  value={minSpend}
                  onChange={(e) =>
                    setMinSpend(e.target.value.replace(/[^0-9]/g, ''))
                  }
                  placeholder="ไม่จำกัด"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">เริ่มใช้วันที่</label>
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">หมดอายุวันที่</label>
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void createOrUpdate()}
                disabled={saving}
                className="bg-jade-600 rounded-md px-4 py-2 text-sm font-semibold text-white hover:bg-jade-500 disabled:opacity-60"
              >
                {saving ? 'กำลังบันทึก...' : editingId ? 'บันทึกการเปลี่ยนแปลง' : 'บันทึกโปรโมชัน'}
              </button>
              <button
                onClick={() => {
                  setCreating(false);
                  resetForm();
                }}
                className="rounded-md border border-line px-4 py-2 text-sm text-fg-secondary hover:bg-surface"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {/* Promotions list */}
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface">
                <th className="px-4 py-3 text-left font-medium text-fg-muted">
                  ชื่อโปรโมชัน
                </th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">
                  ส่วนลด
                </th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">
                  ขอบเขต
                </th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">
                  สถานะ
                </th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">
                  วันหมดอายุ
                </th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-fg-muted">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : promotions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-fg-muted"
                  >
                    ยังไม่มีโปรโมชัน — กด "สร้างโปรโมชัน" ด้านบนเพื่อเริ่ม
                  </td>
                </tr>
              ) : (
                promotions.map((p) => {
                  const expired = isExpired(p);
                  const notYetActive = isNotYetActive(p);
                  const effectiveStatus =
                    expired
                      ? 'expired'
                      : notYetActive
                        ? 'pending'
                        : p.isActive
                          ? 'active'
                          : 'inactive';

                  return (
                    <tr
                      key={p.id}
                      className="border-b border-line-subtle hover:bg-surface"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-fg">{p.name}</p>
                        {p.description && (
                          <p className="text-xs text-fg-muted mt-0.5">
                            {p.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">
                        {p.discountType === 'percent' ? (
                          <span className="font-semibold">
                            {p.discountValue}%
                          </span>
                        ) : (
                          formatThb(p.discountValue)
                        )}
                        {p.minSpendThb !== null && (
                          <span className="text-xs text-fg-muted block">
                            ขั้นต่ำ {formatThb(p.minSpendThb)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">
                        {p.scope === 'all' ? 'ทั้งร้าน' : 'เจาะจงสินค้า'}
                        {p.scope === 'selected' &&
                          p.productIds.length > 0 && (
                            <span className="text-xs text-fg-muted block">
                              {p.productIds.length} สินค้า
                            </span>
                          )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            effectiveStatus === 'active' &&
                              'bg-jade-500/15 text-jade-700',
                            effectiveStatus === 'inactive' &&
                              'bg-surface-sunken text-fg-muted',
                            effectiveStatus === 'expired' &&
                              'bg-error/10 text-fg-error',
                            effectiveStatus === 'pending' &&
                              'bg-surface-sunken text-fg-muted',
                          )}
                        >
                          {effectiveStatus === 'active' &&
                            'ใช้งานอยู่'}
                          {effectiveStatus === 'inactive' && 'ปิดใช้งาน'}
                          {effectiveStatus === 'expired' && 'หมดอายุ'}
                          {effectiveStatus === 'pending' && 'รอเวลาเปิด'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {p.expiresAt === null ? (
                          <span className="text-fg-muted">ไม่กำหนด</span>
                        ) : expired ? (
                          <span className="text-fg-error">
                            {new Date(p.expiresAt).toLocaleDateString('th-TH', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        ) : (
                          <span className="text-fg-secondary">
                            {new Date(p.expiresAt).toLocaleDateString('th-TH', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => void toggle(p)}
                            className="inline-flex items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-fg-muted hover:bg-clay-300 hover:text-fg"
                            title={p.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          >
                            <Power size={12} /> {p.isActive ? 'ปิด' : 'เปิด'}
                          </button>
                          <button
                            onClick={() => void startEdit(p)}
                            className="inline-flex items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-fg-muted hover:bg-clay-300 hover:text-fg"
                            title="แก้ไข"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => void remove(p.id, p.name)}
                            disabled={deleting === p.id}
                            className="hover:bg-error inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-fg-error disabled:opacity-50"
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
