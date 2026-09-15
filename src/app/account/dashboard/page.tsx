/**
 * Customer Dashboard Overview — 12-dashboard.md §5.
 * Summary of recent orders, codes, and account status.
 */

import { ShoppingBag, Key, Clock } from 'lucide-react';
import { formatThb } from '@/lib/pricing';

export default function AccountDashboardPage(): React.JSX.Element {
  // Mock data — in production, from GET /account/overview
  const overview = {
    recentOrders: [
      {
        id: 'order-001',
        orderNumber: 'NK-2026-000001',
        total: 214,
        status: 'completed',
        date: '20 Aug 2026',
      },
      {
        id: 'order-002',
        orderNumber: 'NK-2026-000002',
        total: 107,
        status: 'completed',
        date: '15 Aug 2026',
      },
    ],
    deliveredCodes: 3,
    pendingOrders: 0,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-clay-900">ภาพรวม</h1>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-clay-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-peach-100 text-peach-600">
              <ShoppingBag size={20} />
            </div>
            <div>
              <p className="text-xs text-clay-500">คำสั่งซื้อล่าสุด</p>
              <p className="text-xl font-bold text-clay-900">{overview.recentOrders.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-md border border-clay-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-jade-500/15 text-jade-700">
              <Key size={20} />
            </div>
            <div>
              <p className="text-xs text-clay-500">โค้ดที่ได้รับ</p>
              <p className="text-xl font-bold text-clay-900">{overview.deliveredCodes}</p>
            </div>
          </div>
        </div>
        <div className="rounded-md border border-clay-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-clay-100 text-clay-500">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-xs text-clay-500">รอดำเนินการ</p>
              <p className="text-xl font-bold text-clay-900">{overview.pendingOrders}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="rounded-md border border-clay-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-clay-900">คำสั่งซื้อล่าสุด</h2>
        {overview.recentOrders.length === 0 ? (
          <p className="text-sm text-clay-500">ยังไม่มีคำสั่งซื้อ</p>
        ) : (
          <div className="space-y-3">
            {overview.recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded border border-clay-200 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-clay-700">{order.orderNumber}</p>
                  <p className="text-xs text-clay-500">{order.date}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-clay-700">{formatThb(order.total)}</p>
                  <p className="text-xs text-jade-700">สำเร็จ</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
