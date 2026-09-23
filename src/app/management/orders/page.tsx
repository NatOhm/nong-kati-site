'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Eye, XCircle, CheckCircle, RefreshCw, ShieldCheck } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';

/**
 * Admin Orders — real data from /api/v1/admin/orders.
 * ระบบตรวจสอบการชำระเงิน: pending_payment / pending_manual_fulfilment orders
 * expose ยืนยันการชำระเงิน — server claims atomically, assigns gift codes,
 * decrements stock and completes the order in one transaction.
 */

interface OrderRow {
  id: string;
  orderNumber: string;
  customerEmail: string;
  status: string;
  paymentMethod: string | null;
  subtotalThb: number;
  discountThb: number;
  totalThb: number;
  itemCount: number;
  manualFulfilmentReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  customerEmail: string;
  status: string;
  subtotalThb: number;
  discountThb: number;
  totalAmountThb: number;
  manualFulfilmentReason: string | null;
  /** Present when the customer's slip was auto-verified (SlipOK). */
  slipVerification: { ref: string; verifiedAt: string | null; receiverAccount: string | null } | null;
  items: {
    id: string;
    productNameTh: string;
    skuCode: string;
    quantity: number;
    unitPriceThb: number;
    lineTotalThb: number;
    deliveryStatus: string;
    codesDelivered: number;
  }[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'รอชำระเงิน', color: 'text-amber-600' },
  payment_confirmed: { label: 'ชำระแล้ว', color: 'text-sky-600' },
  pending_manual_fulfilment: { label: 'รอส่งโค้ด', color: 'text-fg-brand' },
  completed: { label: 'สำเร็จ', color: 'text-jade-600' },
  refunded: { label: 'คืนเงิน', color: 'text-coral-600' },
  failed: { label: 'ล้มเหลว', color: 'text-coral-600' },
  expired: { label: 'หมดอายุ', color: 'text-fg-muted' },
  abandoned: { label: 'ถูกทิ้ง', color: 'text-fg-muted' },
};

const PAYMENT_METHODS: Record<string, string> = {
  promptpay: 'พร้อมเพย์',
  credit_card: 'บัตรเครดิต',
};

export default function AdminOrdersPage(): React.JSX.Element {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const data = await adminJson<{ orders: OrderRow[]; statusCounts: Record<string, number> }>(
        `/api/v1/admin/orders${params.size ? `?${params}` : ''}`,
      );
      setOrders(data.orders);
      setStatusCounts(data.statusCounts);
    } catch {
      setActionError('โหลดคำสั่งซื้อไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    try {
      const detail = await adminJson<OrderDetail>(`/api/v1/admin/orders/${id}`);
      setSelectedOrder(detail);
    } catch {
      setActionError('โหลดรายละเอียดไม่สำเร็จ');
    }
  };

  /**
   * ระบบตรวจสอบการชำระเงิน — confirm the slip: server fulfils codes + stock.
   */
  const verifyPayment = async (id: string) => {
    setVerifyingId(id);
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await adminJson<{ status: string; codesDelivered?: number; message?: string }>(
        `/api/v1/admin/orders/${id}/verify-payment`,
        { method: 'POST' },
      );
      if (res.status === 'completed') {
        setActionMessage(`ยืนยันสำเร็จ — ส่งโค้ดแล้ว ${res.codesDelivered ?? 0} รายการ`);
      } else {
        setActionMessage(res.message ?? 'ยืนยันแล้ว');
      }
      setSelectedOrder(null);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setActionError(
        msg.includes('ALREADY_CONFIRMED')
          ? 'ออเดอร์นี้ถูกยืนยันไปแล้ว'
          : msg.includes('FORBIDDEN')
            ? 'ไม่มีสิทธิ์ยืนยันการชำระเงิน'
            : 'ยืนยันไม่สำเร็จ กรุณาลองใหม่',
      );
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'คำสั่งซื้อ' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg">คำสั่งซื้อ</h1>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle px-3 py-1.5 text-sm text-fg-secondary hover:bg-surface"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} /> รีเฟรช
          </button>
        </div>

        {actionMessage && (
          <div className="rounded-md border border-jade-500/40 bg-jade-500/10 px-4 py-3 text-sm text-jade-700">
            {actionMessage}
          </div>
        )}
        {actionError && (
          <div className="rounded-md border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700">
            {actionError}
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('')}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              statusFilter === ''
                ? 'bg-peach-500 text-white'
                : 'bg-surface text-fg-secondary hover:bg-clay-100',
            )}
          >
            ทั้งหมด
          </button>
          {Object.entries(STATUS_LABELS).map(([key, { label }]) =>
            (statusCounts[key] ?? 0) > 0 || statusFilter === key ? (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  statusFilter === key
                    ? 'bg-peach-500 text-white'
                    : 'bg-surface text-fg-secondary hover:bg-clay-100',
                )}
              >
                {label} ({statusCounts[key] ?? 0})
              </button>
            ) : null,
          )}
        </div>

        {/* Orders table */}
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface">
                <th className="px-4 py-3 text-left font-medium text-fg-muted">หมายเลข</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">อีเมล</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">สถานะ</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">ชำระผ่าน</th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">ยอดรวม</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">วันที่</th>
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
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                    ไม่พบคำสั่งซื้อในสถานะนี้
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-b border-line-subtle hover:bg-surface">
                    <td className="px-4 py-3 font-mono text-xs text-fg-secondary">
                      {order.orderNumber}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">{order.customerEmail}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn('text-xs font-medium', STATUS_LABELS[order.status]?.color)}
                      >
                        {STATUS_LABELS[order.status]?.label ?? order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-fg-muted">
                      {PAYMENT_METHODS[order.paymentMethod ?? ''] ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-fg-secondary">
                      {formatThb(order.totalThb)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-fg-muted">
                      {new Date(order.createdAt).toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {(order.status === 'pending_payment' ||
                          order.status === 'pending_manual_fulfilment') && (
                          <button
                            onClick={() => void verifyPayment(order.id)}
                            disabled={verifyingId === order.id}
                            className="bg-jade-600 inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold text-white hover:bg-jade-500 disabled:opacity-60"
                          >
                            <CheckCircle size={12} />
                            {verifyingId === order.id
                              ? 'กำลังยืนยัน...'
                              : order.status === 'pending_manual_fulfilment'
                                ? 'ส่งโค้ดอีกครั้ง'
                                : 'ยืนยันการชำระเงิน'}
                          </button>
                        )}
                        <button
                          onClick={() => void openDetail(order.id)}
                          className="inline-flex items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-fg-muted hover:bg-clay-300 hover:text-fg"
                        >
                          <Eye size={12} /> ดู
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Order detail modal */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line-subtle bg-surface-base p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-fg">
                  คำสั่งซื้อ {selectedOrder.orderNumber}
                </h2>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-fg-muted hover:text-fg"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-fg-muted">อีเมล</p>
                  <p className="text-fg">{selectedOrder.customerEmail}</p>
                </div>
                <div>
                  <p className="text-fg-muted">สถานะ</p>
                  <p className={cn('font-medium', STATUS_LABELS[selectedOrder.status]?.color)}>
                    {STATUS_LABELS[selectedOrder.status]?.label ?? selectedOrder.status}
                  </p>
                </div>
                <div>
                  <p className="text-fg-muted">ยอดรวม</p>
                  <p className="text-fg">{formatThb(selectedOrder.totalAmountThb)}</p>
                </div>
                {selectedOrder.discountThb > 0 && (
                  <div>
                    <p className="text-fg-muted">ส่วนลด</p>
                    <p className="text-jade-600">−{formatThb(selectedOrder.discountThb)}</p>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-fg-muted">สินค้า</p>
                <div className="space-y-2">
                  {selectedOrder.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded border border-line-subtle p-3 text-sm"
                    >
                      <div>
                        <p className="text-fg">{item.productNameTh}</p>
                        <p className="text-xs text-fg-muted">
                          {item.skuCode} × {item.quantity} ·{' '}
                          {item.deliveryStatus === 'delivered' ? (
                            <span className="text-jade-600">
                              ส่งแล้ว ({item.codesDelivered} โค้ด)
                            </span>
                          ) : (
                            <span className="text-amber-600">ยังไม่ส่ง</span>
                          )}
                        </p>
                      </div>
                      <p className="text-fg-secondary">{formatThb(item.lineTotalThb)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {selectedOrder.slipVerification && (
                <div className="mt-5 flex items-start gap-2 rounded-md border border-jade-500/40 bg-jade-900/5 px-3 py-2.5 text-sm text-jade-700">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">ยืนยันอัตโนมัติด้วยสลิป (SlipOK)</p>
                    <p className="mt-0.5 text-xs">
                      ref {selectedOrder.slipVerification.ref}
                      {selectedOrder.slipVerification.receiverAccount
                        ? ` · เข้าบัญชี ...${selectedOrder.slipVerification.receiverAccount.slice(-4)}`
                        : ''}
                      {selectedOrder.slipVerification.verifiedAt
                        ? ` · ${new Date(selectedOrder.slipVerification.verifiedAt).toLocaleString('th-TH')}`
                        : ''}
                    </p>
                  </div>
                </div>
              )}

              {(selectedOrder.status === 'pending_payment' ||
                selectedOrder.status === 'pending_manual_fulfilment') && (
                <div className="mt-5 border-t border-line-subtle pt-4">
                  <button
                    onClick={() => void verifyPayment(selectedOrder.id)}
                    disabled={verifyingId === selectedOrder.id}
                    className="bg-jade-600 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white hover:bg-jade-500 disabled:opacity-60"
                  >
                    <CheckCircle size={16} />
                    {verifyingId === selectedOrder.id
                      ? 'กำลังยืนยัน...'
                      : selectedOrder.status === 'pending_manual_fulfilment'
                        ? 'ส่งโค้ดอีกครั้ง (หลังเติมสต๊อก)'
                        : 'ยืนยันการชำระเงิน — ส่งโค้ดทันที'}
                  </button>
                  <p className="mt-2 text-center text-xs text-fg-muted">
                    ระบบจะตัดสต๊อกและส่งโค้ดให้ลูกค้าอัตโนมัติทันทีที่ยืนยัน
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
