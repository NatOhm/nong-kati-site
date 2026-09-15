/**
 * Customer Orders Page — 12-dashboard.md §6.
 * Order history with status badges.
 */

import Link from 'next/link';
import { formatThb } from '@/lib/pricing';

const MOCK_ORDERS = [
  {
    id: 'order-001',
    orderNumber: 'NK-2026-000001',
    status: 'completed',
    total: 214,
    itemCount: 2,
    date: new Date('2026-08-20T14:00:00Z'),
  },
  {
    id: 'order-002',
    orderNumber: 'NK-2026-000002',
    status: 'completed',
    total: 107,
    itemCount: 1,
    date: new Date('2026-08-15T10:30:00Z'),
  },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completed: { label: 'สำเร็จ', color: 'text-jade-600 bg-jade-500/15' },
  pending_payment: { label: 'รอชำระเงิน', color: 'text-peach-600 bg-peach-100' },
  refunded: { label: 'คืนเงิน', color: 'text-coral-600 bg-coral-50' },
  expired: { label: 'หมดอายุ', color: 'text-clay-500 bg-clay-100' },
};

export default function AccountOrdersPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-clay-900">คำสั่งซื้อ</h1>

      {MOCK_ORDERS.length === 0 ? (
        <div className="rounded-md border border-clay-200 bg-white p-8 text-center">
          <p className="text-clay-500">ยังไม่มีคำสั่งซื้อ</p>
        </div>
      ) : (
        <div className="space-y-3">
          {MOCK_ORDERS.map((order) => {
            const fallbackStatus = { label: 'ไม่ทราบ', color: 'text-clay-500 bg-clay-100' };
            const statusInfo = STATUS_LABELS[order.status] ?? fallbackStatus;
            return (
              <Link
                key={order.id}
                href={`/account/orders/${order.id}`}
                className="block rounded-md border border-clay-200 bg-white p-4 transition-colors hover:border-peach-300"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-clay-700">{order.orderNumber}</p>
                    <p className="text-clay-9000 text-xs">
                      {order.date.toLocaleDateString('th-TH')} · {order.itemCount} รายการ
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-clay-900">{formatThb(order.total)}</p>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
