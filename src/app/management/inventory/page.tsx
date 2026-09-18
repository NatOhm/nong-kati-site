'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Plus, Minus, AlertTriangle, History } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/**
 * Admin Inventory — real stock from /api/v1/admin/inventory.
 * เติม/ตัดสต๊อกพร้อมบันทึก StockMove (ประวัติการจัดสต๊อกแบบละเอียด),
 * โค้ดพร้อมขายนับจาก GiftCode available จริง, แถบเตือนสต๊อกใกล้หมด.
 */

interface InventoryItem {
  id: string;
  skuCode: string;
  productName: string;
  price: number;
  cost: number | null;
  stock: number;
  codesAvailable: number;
  isActive: boolean;
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

export default function AdminInventoryPage(): React.JSX.Element {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [moves, setMoves] = useState<StockMoveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');

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

  const submitAdjust = async (variantId: string, sign: 1 | -1) => {
    const n = Number(delta);
    if (!Number.isInteger(n) || n <= 0) {
      setErr('กรอกจำนวนเป็นตัวเลขมากกว่า 0');
      return;
    }
    setErr(null);
    setMsg(null);
    try {
      const res = await adminJson<{ stock: number; label: string }>('/api/v1/admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId,
          delta: sign * n,
          reason: sign > 0 ? 'restock' : 'adjust',
          note: note.trim() || null,
        }),
      });
      setMsg(`อัปเดตสต๊อก ${res.label} → เหลือ ${res.stock} ชิ้น`);
      setDelta('');
      setNote('');
      setAdjusting(null);
      await load();
    } catch (e) {
      setErr(
        e instanceof Error && e.message.includes('FORBIDDEN')
          ? 'ไม่มีสิทธิ์จัดสต๊อก'
          : 'บันทึกไม่สำเร็จ',
      );
    }
  };

  const lowCount = items.filter((i) => i.stock <= LOW_STOCK_THRESHOLD).length;

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'คลังสินค้า' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg">คลังสินค้า</h1>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle px-3 py-1.5 text-sm text-fg-secondary hover:bg-surface"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} /> รีเฟรช
          </button>
        </div>

        {lowCount > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} />
            มี {lowCount} รุ่นสินค้าที่สต๊อกใกล้หมด (≤ {LOW_STOCK_THRESHOLD} ชิ้น)
          </div>
        )}

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

        {/* Stock table */}
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface">
                <th className="px-4 py-3 text-left font-medium text-fg-muted">สินค้า</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">รุ่น</th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">ราคาขาย</th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">ต้นทุน</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">สต๊อก</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">โค้ดพร้อมขาย</th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">เติม/ตัดสต๊อก</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                    ยังไม่มีสินค้าในระบบ
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-line-subtle hover:bg-white">
                    <td className="px-4 py-3 text-fg">{item.productName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-fg-secondary">
                      {item.skuCode}
                    </td>
                    <td className="px-4 py-3 text-right text-fg-secondary">
                      ฿{item.price.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-fg-muted">
                      {item.cost === null ? '—' : `฿${item.cost.toLocaleString()}`}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'font-semibold',
                          item.stock === 0
                            ? 'text-coral-600'
                            : item.stock <= LOW_STOCK_THRESHOLD
                              ? 'text-amber-600'
                              : 'text-jade-600',
                        )}
                      >
                        {item.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-fg-secondary">
                      {item.codesAvailable}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {adjusting === item.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <input
                            autoFocus
                            type="number"
                            min="1"
                            value={delta}
                            onChange={(e) => setDelta(e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="จำนวน"
                            className="h-8 w-16 rounded border border-line px-2 text-xs text-fg focus:border-line-brand focus:outline-none"
                          />
                          <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="หมายเหตุ"
                            className="h-8 w-28 rounded border border-line px-2 text-xs text-fg focus:border-line-brand focus:outline-none"
                          />
                          <button
                            onClick={() => void submitAdjust(item.id, 1)}
                            className="bg-jade-600 rounded px-2 py-1 text-xs font-semibold text-white hover:bg-jade-500"
                            title="เติมสต๊อก"
                          >
                            <Plus size={12} />
                          </button>
                          <button
                            onClick={() => void submitAdjust(item.id, -1)}
                            className="rounded bg-coral-500 px-2 py-1 text-xs font-semibold text-white hover:bg-coral-400"
                            title="ตัดสต๊อก"
                          >
                            <Minus size={12} />
                          </button>
                          <button
                            onClick={() => {
                              setAdjusting(null);
                              setDelta('');
                              setNote('');
                            }}
                            className="text-xs text-fg-muted hover:text-fg"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAdjusting(item.id)}
                          className="rounded bg-peach-100 px-3 py-1.5 text-xs font-medium text-fg-brand hover:bg-peach-200"
                        >
                          เติม/ตัดสต๊อก
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Stock move history */}
        <div className="rounded-md border border-line-subtle bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-fg">
            <History size={18} /> ประวัติการจัดสต๊อก (ล่าสุด 50 รายการ)
          </h2>
          {moves.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-muted">
              ยังไม่มีประวัติ — เติมสต๊อกหรือขายแล้วจะบันทึกที่นี่
            </p>
          ) : (
            <div className="space-y-2">
              {moves.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-line-subtle px-4 py-2.5 text-sm"
                >
                  <div>
                    <p className="text-fg">
                      {m.productName}{' '}
                      <span className="text-xs text-fg-muted">({m.variantLabel})</span>
                    </p>
                    <p className="text-xs text-fg-muted">
                      {REASON_LABELS[m.reason] ?? m.reason}
                      {m.note ? ` · ${m.note}` : ''} ·{' '}
                      {new Date(m.createdAt).toLocaleString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={cn('font-bold', m.delta > 0 ? 'text-jade-600' : 'text-coral-600')}
                    >
                      {m.delta > 0 ? '+' : ''}
                      {m.delta}
                    </span>
                    <span className="ml-2 text-xs text-fg-muted">→ {m.stockAfter}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
