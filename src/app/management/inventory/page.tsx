'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Search,
  Edit2,
  Eye,
  EyeOff,
  History,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminFetch, adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/**
 * Admin Inventory — รายการสินค้าจริงทั้งหมด (ชุดเดียวกับหน้าเว็บหลัก)
 * แก้ไขรายละเอียดได้: SKU, ชื่อ, ราคา, ต้นทุน, คำอธิบาย, สต๊อก
 * เปิด/ปิดการขายได้ (ปิด = ซ่อนจากหน้าเว็บทันที) + ประวัติการจัดสต๊อก
 */

interface InventoryItem {
  id: string;
  variantId: string | null;
  variantCount: number;
  sku: string | null;
  name: string;
  categoryName: string;
  imageUrl: string | null;
  description: string | null;
  price: number | null;
  cost: number | null;
  stock: number;
  codesAvailable: number;
  isActive: boolean;
  isFeatured: boolean;
}

interface StockMoveRow {
  id: string;
  variantLabel: string;
  productName: string;
  delta: number;
  reason: string;
  note: string | null;
  stockAfter: number;
  createdAt: string;
}

const REASON_LABELS: Record<string, string> = {
  restock: 'เติมสต๊อก',
  adjust: 'ปรับยอด',
  sale: 'ขาย',
  refund: 'คืนสินค้า',
  import: 'นำเข้า',
};

const LOW_STOCK_THRESHOLD = 5;

/** ฟอร์มแก้ไขสินค้า (draft state แยกจาก list เพื่อกดยกเลิกได้ไม่เสียข้อมูล) */
interface EditDraft {
  id: string;
  sku: string;
  name: string;
  price: string;
  cost: string;
  stock: string;
  description: string;
  imageUrl: string;
  variantCount: number;
}

function newDraft(item: InventoryItem): EditDraft {
  return {
    id: item.id,
    sku: item.sku ?? '',
    name: item.name,
    price: item.price === null ? '' : String(item.price),
    cost: item.cost === null ? '' : String(item.cost),
    stock: String(item.stock),
    description: item.description ?? '',
    imageUrl: item.imageUrl ?? '',
    variantCount: item.variantCount,
  };
}

export default function AdminInventoryPage(): React.JSX.Element {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [moves, setMoves] = useState<StockMoveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminJson<{ items: InventoryItem[]; moves: StockMoveRow[] }>(
        '/api/v1/admin/inventory',
      );
      setItems(data.items);
      setMoves(data.moves);
    } catch {
      setErr('โหลดสต๊อกไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (!showInactive && !i.isActive) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.sku ?? '').toLowerCase().includes(q) ||
        i.categoryName.toLowerCase().includes(q)
      );
    });
  }, [items, query, showInactive]);

  const lowCount = items.filter((i) => i.isActive && i.stock <= LOW_STOCK_THRESHOLD).length;

  const toggleActive = async (item: InventoryItem) => {
    setErr(null);
    setMsg(null);
    setToggling(item.id);
    try {
      await adminFetch(`/api/v1/admin/products/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      setMsg(item.isActive ? `ซ่อน ${item.name} ออกจากหน้าเว็บแล้ว` : `เปิดขาย ${item.name} แล้ว`);
      await load();
    } catch {
      setErr('บันทึกไม่สำเร็จ');
    } finally {
      setToggling(null);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    const price = draft.price === '' ? null : Number(draft.price);
    const cost = draft.cost === '' ? null : Number(draft.cost);
    const stock = Number(draft.stock);
    if (draft.name.trim() === '') {
      setErr('ชื่อสินค้าห้ามว่าง');
      return;
    }
    if (
      (draft.price !== '' && (!Number.isFinite(price) || price! < 0)) ||
      (draft.cost !== '' && (!Number.isFinite(cost) || cost! < 0))
    ) {
      setErr('ราคา/ต้นทุนต้องเป็นตัวเลข ≥ 0');
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setErr('สต๊อกต้องเป็นจำนวนเต็ม ≥ 0');
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      // Single-variant products: price/stock editable here (replace-all is
      // safe). Multi-variant: only product info — variants belong to the
      // products page, sending them here would wipe the other options.
      const body: Record<string, unknown> = {
        name: draft.name.trim(),
        sku: draft.sku.trim() === '' ? null : draft.sku.trim(),
        description: draft.description.trim() === '' ? null : draft.description.trim(),
        imageUrl: draft.imageUrl.trim() === '' ? null : draft.imageUrl.trim(),
      };
      if (draft.variantCount === 1) {
        body['variants'] = [{ label: 'default', price: price ?? 0, stock, cost, isActive: true }];
      }
      await adminFetch(`/api/v1/admin/products/${draft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setMsg(`บันทึก ${draft.name} เรียบร้อย`);
      setDraft(null);
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setErr(
        m.includes('SKU_TAKEN')
          ? 'SKU นี้ถูกใช้กับสินค้าอื่นแล้ว'
          : m.includes('FORBIDDEN')
            ? 'ไม่มีสิทธิ์แก้ไขสินค้า'
            : 'บันทึกไม่สำเร็จ',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'คลังสินค้า' }]}>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-fg">คลังสินค้า</h1>
            <p className="mt-1 text-sm text-fg-secondary">
              {items.length} รายการ · {items.filter((i) => i.isActive).length} แสดงบนเว็บ ·{' '}
              {items.filter((i) => !i.isActive).length} ซ่อนอยู่
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lowCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-oat-200 bg-oat px-3 py-1.5 text-xs font-medium text-fg-warning">
                <AlertTriangle size={13} /> สต๊อกใกล้หมด {lowCount} รายการ
              </span>
            )}
            <button
              onClick={() => setShowHistory((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border border-line-subtle bg-surface px-3 py-1.5 text-sm text-fg-secondary transition-colors hover:bg-surface-elevated',
                showHistory && 'border-line-brand text-fg-brand',
              )}
            >
              <History size={14} /> ประวัติการจัดสต๊อก
            </button>
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-subtle bg-surface px-3 py-1.5 text-sm text-fg-secondary transition-colors hover:bg-surface-elevated"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> รีเฟรช
            </button>
          </div>
        </div>

        {(msg || err) && (
          <div
            className={cn(
              'rounded-lg border px-4 py-2.5 text-sm',
              err
                ? 'border-crimson-200 bg-coral-50 text-fg-error dark:border-crimson-700 dark:bg-crimson-900/40'
                : 'border-jade-500/40 bg-jade-500/15 text-fg-success',
            )}
          >
            {err ?? msg}
          </div>
        )}

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อ, SKU, หมวดหมู่…"
              className="w-72 rounded-lg border border-line-subtle bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-placeholder focus:border-line-brand"
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg-secondary">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-line"
            />
            แสดงสินค้าที่ซ่อนอยู่
          </label>
        </div>

        {/* ── Product table ── */}
        <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-line-subtle bg-surface-elevated text-left">
                  <th className="px-4 py-3 font-medium text-fg-secondary">SKU</th>
                  <th className="px-4 py-3 font-medium text-fg-secondary">สินค้า</th>
                  <th className="px-4 py-3 font-medium text-fg-secondary">หมวดหมู่</th>
                  <th className="px-4 py-3 text-right font-medium text-fg-secondary">ราคา</th>
                  <th className="px-4 py-3 text-center font-medium text-fg-secondary">สต๊อก</th>
                  <th className="px-4 py-3 text-center font-medium text-fg-secondary">
                    โค้ดพร้อมขาย
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-fg-secondary">สถานะ</th>
                  <th className="px-4 py-3 text-right font-medium text-fg-secondary">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-fg-placeholder">
                      <Loader2 size={22} className="mx-auto mb-2 animate-spin" />
                      กำลังโหลด…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-fg-placeholder">
                      ไม่พบสินค้าที่ตรงกับการค้นหา
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr
                      key={item.id}
                      className={cn(
                        'border-b border-line-subtle transition-colors last:border-0 hover:bg-surface-elevated',
                        !item.isActive && 'opacity-55',
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-fg-secondary">
                        {item.sku ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {item.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="h-9 w-9 flex-shrink-0 rounded-lg border border-line-subtle object-cover"
                            />
                          )}
                          <div>
                            <p className="font-medium text-fg">{item.name}</p>
                            {item.variantCount > 1 && (
                              <p className="text-xs text-fg-placeholder">
                                {item.variantCount} ตัวเลือก
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">{item.categoryName}</td>
                      <td className="px-4 py-3 text-right font-medium text-fg">
                        {item.price === null ? '—' : `฿${item.price.toFixed(2)}`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            'font-semibold',
                            item.stock === 0
                              ? 'text-fg-error'
                              : item.stock <= LOW_STOCK_THRESHOLD
                                ? 'text-fg-warning'
                                : 'text-fg',
                          )}
                        >
                          {item.stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-fg-secondary">
                        {item.codesAvailable}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                            item.isActive
                              ? 'border-jade-500/40 bg-jade-500/15 text-fg-success'
                              : 'bg-sunken border-line-subtle text-fg-placeholder',
                          )}
                        >
                          {item.isActive ? 'แสดงบนเว็บ' : 'ซ่อน'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDraft(newDraft(item))}
                            aria-label={`แก้ไข ${item.name}`}
                            title="แก้ไขรายละเอียด"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-subtle text-fg-secondary transition-colors hover:border-line-brand hover:text-fg-brand"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => void toggleActive(item)}
                            disabled={toggling === item.id}
                            aria-label={
                              item.isActive ? `ซ่อน ${item.name}` : `เปิดขาย ${item.name}`
                            }
                            title={item.isActive ? 'ซ่อนจากหน้าเว็บ' : 'เปิดขาย'}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-subtle text-fg-secondary transition-colors hover:border-line-brand hover:text-fg-brand disabled:opacity-50"
                          >
                            {toggling === item.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : item.isActive ? (
                              <EyeOff size={14} />
                            ) : (
                              <Eye size={14} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Stock move history ── */}
        {showHistory && (
          <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface">
            <div className="border-b border-line-subtle bg-surface-elevated px-4 py-3 text-sm font-semibold text-fg">
              ประวัติการจัดสต๊อกล่าสุด ({moves.length} รายการ)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-left">
                    <th className="px-4 py-2.5 font-medium text-fg-secondary">เวลา</th>
                    <th className="px-4 py-2.5 font-medium text-fg-secondary">สินค้า</th>
                    <th className="px-4 py-2.5 text-center font-medium text-fg-secondary">
                      เปลี่ยนแปลง
                    </th>
                    <th className="px-4 py-2.5 text-center font-medium text-fg-secondary">
                      คงเหลือ
                    </th>
                    <th className="px-4 py-2.5 font-medium text-fg-secondary">เหตุผล</th>
                    <th className="px-4 py-2.5 font-medium text-fg-secondary">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {moves.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-fg-placeholder">
                        ยังไม่มีประวัติการจัดสต๊อก
                      </td>
                    </tr>
                  ) : (
                    moves.map((m) => (
                      <tr key={m.id} className="border-b border-line-subtle last:border-0">
                        <td className="px-4 py-2.5 text-xs text-fg-placeholder">
                          {new Date(m.createdAt).toLocaleString('th-TH')}
                        </td>
                        <td className="px-4 py-2.5 text-fg">
                          {m.productName}
                          <span className="text-fg-placeholder"> · {m.variantLabel}</span>
                        </td>
                        <td
                          className={cn(
                            'px-4 py-2.5 text-center font-semibold',
                            m.delta > 0 ? 'text-fg-success' : 'text-fg-error',
                          )}
                        >
                          {m.delta > 0 ? `+${m.delta}` : m.delta}
                        </td>
                        <td className="px-4 py-2.5 text-center text-fg-secondary">
                          {m.stockAfter}
                        </td>
                        <td className="px-4 py-2.5 text-fg-secondary">
                          {REASON_LABELS[m.reason] ?? m.reason}
                        </td>
                        <td className="px-4 py-2.5 text-fg-placeholder">{m.note ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Edit modal ── */}
      {draft && (
        <div
          className="bg-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !saving && setDraft(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line-subtle bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold text-fg">แก้ไขสินค้า</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-fg-secondary">SKU</label>
                <input
                  value={draft.sku}
                  onChange={(e) => setDraft({ ...draft, sku: e.target.value.toUpperCase() })}
                  placeholder="เช่น NETFLIX_30_JO"
                  className="bg-surface-raised w-full rounded-lg border border-line-subtle px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-placeholder focus:border-line-brand"
                />
                <p className="mt-1 text-xs text-fg-placeholder">
                  รหัสสินค้า (ต้องไม่ซ้ำกับสินค้าอื่น)
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-fg-secondary">
                  ชื่อสินค้า *
                </label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="bg-surface-raised w-full rounded-lg border border-line-subtle px-3 py-2 text-sm text-fg focus:border-line-brand"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-fg-secondary">
                    ราคา (฿)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                    disabled={draft.variantCount > 1}
                    title={
                      draft.variantCount > 1 ? 'แก้ราคาตัวเลือกย่อยในหน้า "สินค้า" แทน' : undefined
                    }
                    className="bg-surface-raised w-full rounded-lg border border-line-subtle px-3 py-2 text-sm text-fg focus:border-line-brand disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-fg-secondary">
                    ต้นทุน (฿)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.cost}
                    onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
                    className="bg-surface-raised w-full rounded-lg border border-line-subtle px-3 py-2 text-sm text-fg focus:border-line-brand"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-fg-secondary">
                    สต๊อก
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={draft.stock}
                    onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                    disabled={draft.variantCount > 1}
                    className="bg-surface-raised w-full rounded-lg border border-line-subtle px-3 py-2 text-sm text-fg focus:border-line-brand disabled:opacity-50"
                  />
                </div>
              </div>
              {draft.variantCount > 1 && (
                <p className="rounded-lg border border-oat-200 bg-oat px-3 py-2 text-xs text-fg-warning">
                  สินค้านี้มี {draft.variantCount} ตัวเลือก — แก้ราคา/สต๊อกรายตัวเลือกในหน้า
                  สินค้า
                </p>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-fg-secondary">
                  คำอธิบาย
                </label>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={3}
                  className="bg-surface-raised w-full resize-none rounded-lg border border-line-subtle px-3 py-2 text-sm text-fg focus:border-line-brand"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-fg-secondary">
                  ลิงก์รูปภาพ (/products/...)
                </label>
                <input
                  value={draft.imageUrl}
                  onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
                  placeholder="/products/example.png"
                  className="bg-surface-raised w-full rounded-lg border border-line-subtle px-3 py-2 text-sm text-fg placeholder:text-fg-placeholder focus:border-line-brand"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setDraft(null)}
                disabled={saving}
                className="rounded-lg border border-line-subtle px-4 py-2 text-sm text-fg-secondary transition-colors hover:bg-surface-elevated disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => void saveDraft()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-peach-500 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] hover:bg-peach-400 active:scale-95 disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />} บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
