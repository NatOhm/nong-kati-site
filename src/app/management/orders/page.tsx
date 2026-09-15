'use client';

import { useState } from 'react';
import { Search, Eye, Mail, RefreshCw, XCircle } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';
import {
  adminListOrders,
  adminGetOrder,
  adminResendOrderEmail,
  adminRefundOrder,
  type AdminOrderListItem,
  type AdminOrderDetail,
} from '@/api/adminOrders';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'รอชำระเงิน', color: 'text-peach-600' },
  payment_failed: { label: 'ชำระเงินล้มเหลว', color: 'text-coral-600' },
  paid: { label: 'ชำระแล้ว', color: 'text-jade-600' },
  delivering: { label: 'กำลังส่ง', color: 'text-sky-400' },
  completed: { label: 'สำเร็จ', color: 'text-jade-600' },
  pending_manual_fulfilment: { label: 'รอส่งโค้ด', color: 'text-peach-600' },
  refunded: { label: 'คืนเงิน', color: 'text-coral-600' },
  cancelled: { label: 'ยกเลิก', color: 'text-clay-500' },
  expired: { label: 'หมดอายุ', color: 'text-clay-400' },
};

const PAYMENT_METHODS: Record<string, string> = {
  promptpay: 'PromptPay',
  card: 'บัตรเครดิต',
};

export default function AdminOrdersPage(): React.JSX.Element {
  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleSearch = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const params: Parameters<typeof adminListOrders>[0] = {};
      if (searchQuery) params.q = searchQuery;
      if (statusFilter) params.status = statusFilter;
      const result = await adminListOrders(params);
      setOrders(result.data);
    } finally {
      setLoading(false);
    }
  };

  const handleViewOrder = async (orderId: string) => {
    const detail = await adminGetOrder(orderId);
    setSelectedOrder(detail);
  };

  const handleResendEmail = async (orderId: string) => {
    const result = await adminResendOrderEmail(orderId, 'staff-001', 'founder@nong-kati.co.th');
    if (result.success) {
      setActionMessage('ส่งอีเมลอีกครั้งสำเร็จ');
    }
  };

  const handleRefund = async (orderId: string) => {
    const result = await adminRefundOrder(
      orderId,
      {
        reason: 'โค้ดไม่ถูกต้อง / ใช้แล้ว',
        gatewayRefundReference: `re_mock_${Date.now()}`,
        refundAmountThb: selectedOrder?.totalAmountThb ?? 0,
        voidCodes: true,
      },
      'staff-001',
      'founder@nong-kati.co.th',
    );
    if (result.success) {
      setActionMessage('คืนเงินสำเร็จ');
      setSelectedOrder(null);
      handleSearch();
    } else {
      setActionMessage(result.error ?? 'เกิดข้อผิดพลาด');
    }
  };

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'คำสั่งซื้อ' }]}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-clay-900">คำสั่งซื้อ</h1>

        {actionMessage && (
          <div className="rounded-md border border-jade-500/40 bg-jade-500/10 px-4 py-3 text-sm text-jade-700">
            {actionMessage}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 md:max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-clay-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="ค้นหาหมายเลขคำสั่งซื้อ หรืออีเมล..."
              className="w-full rounded-md border border-clay-200 bg-white py-2 pl-9 pr-3 text-sm text-clay-900 placeholder:text-clay-400 focus:border-peach-300 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-clay-200 bg-white px-3 py-2 text-sm text-clay-700 focus:border-peach-300 focus:outline-none"
          >
            <option value="">ทุกสถานะ</option>
            {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="rounded-md bg-peach-500 px-4 py-2 text-sm font-medium text-clay-900 hover:bg-peach-400 disabled:opacity-50"
          >
            {loading ? 'กำลังค้นหา...' : 'ค้นหา'}
          </button>
        </div>

        {/* Order Detail Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-clay-200 bg-clay-50 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-clay-900">
                  คำสั่งซื้อ {selectedOrder.orderNumber}
                </h2>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-clay-500 hover:text-clay-900"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-clay-500">อีเมล</p>
                    <p className="text-clay-900">{selectedOrder.customerEmail}</p>
                  </div>
                  <div>
                    <p className="text-clay-500">สถานะ</p>
                    <p className={cn('font-medium', STATUS_LABELS[selectedOrder.status]?.color)}>
                      {STATUS_LABELS[selectedOrder.status]?.label}
                    </p>
                  </div>
                  <div>
                    <p className="text-clay-500">ยอดรวม</p>
                    <p className="text-clay-900">{formatThb(selectedOrder.totalAmountThb)}</p>
                  </div>
                  <div>
                    <p className="text-clay-500">ชำระผ่าน</p>
                    <p className="text-clay-900">
                      {PAYMENT_METHODS[selectedOrder.paymentMethod ?? ''] ?? 'ไม่ทราบ'}
                    </p>
                  </div>
                </div>

                {/* Items */}
                <div>
                  <p className="mb-2 text-sm font-medium text-clay-600">สินค้า</p>
                  {selectedOrder.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded border border-clay-200 p-3 text-sm"
                    >
                      <div>
                        <p className="text-clay-900">{item.productNameTh}</p>
                        <p className="text-xs text-clay-500">
                          {item.skuCode} × {item.quantity}
                        </p>
                      </div>
                      <p className="text-clay-700">{formatThb(item.lineTotalThb)}</p>
                    </div>
                  ))}
                </div>

                {/* Codes */}
                {selectedOrder.items.some((i) => i.codes.length > 0) && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-clay-600">โค้ดที่ส่งแล้ว</p>
                    {selectedOrder.items
                      .flatMap((i) => i.codes)
                      .map((code) => (
                        <div
                          key={code.codeId}
                          className="flex items-center gap-3 rounded border border-clay-200 p-2 font-mono text-sm text-peach-600"
                        >
                          {code.maskedCode}
                          <span className="text-xs text-clay-500">{code.status}</span>
                        </div>
                      ))}
                  </div>
                )}

                {/* Notes */}
                {selectedOrder.notes && (
                  <div>
                    <p className="text-sm font-medium text-clay-600">หมายเหตุ</p>
                    <p className="text-sm text-clay-700">{selectedOrder.notes}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-3 border-t border-clay-200 pt-4">
                  <button
                    onClick={() => handleResendEmail(selectedOrder.id)}
                    className="inline-flex items-center gap-2 rounded-md border border-clay-300 px-3 py-2 text-sm text-clay-700 hover:bg-clay-100"
                  >
                    <Mail size={14} /> ส่งอีเมลอีกครั้ง
                  </button>
                  {selectedOrder.status !== 'refunded' && selectedOrder.status !== 'expired' && (
                    <button
                      onClick={() => handleRefund(selectedOrder.id)}
                      className="inline-flex items-center gap-2 rounded-md border border-coral-300 px-3 py-2 text-sm text-coral-600 hover:bg-coral-50"
                    >
                      <RefreshCw size={14} /> คืนเงิน
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Orders Table */}
        <div className="overflow-x-auto rounded-md border border-clay-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-clay-200 bg-clay-100">
                <th className="px-4 py-3 text-left font-medium text-clay-600">หมายเลข</th>
                <th className="px-4 py-3 text-left font-medium text-clay-600">อีเมล</th>
                <th className="px-4 py-3 text-center font-medium text-clay-600">สถานะ</th>
                <th className="px-4 py-3 text-center font-medium text-clay-600">ชำระผ่าน</th>
                <th className="px-4 py-3 text-right font-medium text-clay-600">ยอดรวม</th>
                <th className="px-4 py-3 text-center font-medium text-clay-600">วันที่</th>
                <th className="px-4 py-3 text-right font-medium text-clay-600">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-clay-400">
                    {loading ? 'กำลังโหลด...' : 'ไม่พบคำสั่งซื้อ — กด "ค้นหา" เพื่อแสดงทั้งหมด'}
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-b border-clay-200 hover:bg-white">
                    <td className="px-4 py-3 font-mono text-xs text-clay-700">
                      {order.orderNumber}
                    </td>
                    <td className="px-4 py-3 text-clay-700">{order.customerEmail}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn('text-xs font-medium', STATUS_LABELS[order.status]?.color)}
                      >
                        {STATUS_LABELS[order.status]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-clay-600">
                      {PAYMENT_METHODS[order.paymentMethod ?? ''] ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-clay-700">
                      {formatThb(order.totalAmountThb)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-clay-500">
                      {order.createdAt.toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleViewOrder(order.id)}
                        className="inline-flex items-center gap-1 rounded bg-clay-100 px-2 py-1 text-xs text-clay-600 hover:bg-clay-300 hover:text-clay-900"
                      >
                        <Eye size={12} /> ดู
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
