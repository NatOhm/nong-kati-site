'use client';

import { useState } from 'react';
import { Search, Eye, ShieldOff, ShieldCheck, XCircle } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';
import {
  adminListCustomers,
  adminGetCustomer,
  adminBlockCustomer,
  type AdminCustomerListItem,
  type AdminCustomerDetail,
} from '@/api/adminCustomers';

export default function AdminCustomersPage(): React.JSX.Element {
  const [customers, setCustomers] = useState<AdminCustomerListItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<AdminCustomerDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleSearch = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const params: Parameters<typeof adminListCustomers>[0] = {};
      if (searchQuery) params.q = searchQuery;
      if (statusFilter) params.status = statusFilter;
      const result = await adminListCustomers(params);
      setCustomers(result.data);
    } finally {
      setLoading(false);
    }
  };

  const handleViewCustomer = async (customerId: string) => {
    const detail = await adminGetCustomer(customerId);
    setSelectedCustomer(detail);
  };

  const handleBlockToggle = async (customerId: string, currentStatus: string) => {
    const block = currentStatus !== 'blocked';
    const result = await adminBlockCustomer(
      customerId,
      block,
      'staff-001',
      'founder@nong-kati.co.th'
    );
    if (result.success) {
      setActionMessage(block ? 'บล็อคลูกค้าสำเร็จ' : 'ปลดบล็อคสำเร็จ');
      setSelectedCustomer(null);
      handleSearch();
    }
  };

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'ลูกค้า' }]}
    >
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink-100">ลูกค้า</h1>

        {actionMessage && (
          <div className="rounded-md border border-jade-700/50 bg-jade-900/10 px-4 py-3 text-sm text-jade-300">
            {actionMessage}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 md:max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="ค้นหาอีเมล หรือชื่อ..."
              className="w-full rounded-md border border-ink-700 bg-ink-850 py-2 pl-9 pr-3 text-sm text-ink-100 placeholder:text-ink-500 focus:border-amber-700 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-ink-200 focus:border-amber-700 focus:outline-none"
          >
            <option value="">ทุกสถานะ</option>
            <option value="active">ใช้งาน</option>
            <option value="blocked">บล็อค</option>
          </select>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="rounded-md bg-amber-400 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-amber-300 disabled:opacity-50"
          >
            {loading ? 'กำลังค้นหา...' : 'ค้นหา'}
          </button>
        </div>

        {/* Customer Detail Modal */}
        {selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-ink-700 bg-ink-900 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-ink-100">{selectedCustomer.fullName}</h2>
                <button onClick={() => setSelectedCustomer(null)} className="text-ink-400 hover:text-ink-200">
                  <XCircle size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-ink-400">อีเมล</p>
                    <p className="text-ink-100">{selectedCustomer.email}</p>
                  </div>
                  <div>
                    <p className="text-ink-400">โทรศัพท์</p>
                    <p className="text-ink-100">{selectedCustomer.phoneNumber ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-ink-400">สถานะ</p>
                    <p className={cn(
                      'font-medium',
                      selectedCustomer.status === 'blocked' ? 'text-crimson-400' : 'text-jade-400'
                    )}>
                      {selectedCustomer.status === 'blocked' ? 'บล็อค' : 'ใช้งาน'}
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-400">อีเมลยืนยัน</p>
                    <p className="text-ink-100">{selectedCustomer.emailVerified ? '✓ ยืนยันแล้ว' : '✗ ยังไม่ยืนยัน'}</p>
                  </div>
                  <div>
                    <p className="text-ink-400">คำสั่งซื้อทั้งหมด</p>
                    <p className="text-ink-100">{selectedCustomer.totalOrders}</p>
                  </div>
                  <div>
                    <p className="text-ink-400">ยอดซื้อรวม</p>
                    <p className="text-ink-100">{formatThb(selectedCustomer.totalSpendThb)}</p>
                  </div>
                </div>

                {/* Recent Orders */}
                {selectedCustomer.recentOrders.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-ink-300">คำสั่งซื้อล่าสุด</p>
                    {selectedCustomer.recentOrders.map((order, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded border border-ink-700 p-2 text-sm">
                        <div>
                          <p className="text-ink-200">{order.orderNumber}</p>
                          <p className="text-xs text-ink-400">
                            {order.createdAt.toLocaleDateString('th-TH')}
                          </p>
                        </div>
                        <p className="text-ink-200">{formatThb(order.totalAmountThb)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 border-t border-ink-700 pt-4">
                  <button
                    onClick={() => handleBlockToggle(selectedCustomer.id, selectedCustomer.status)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
                      selectedCustomer.status === 'blocked'
                        ? 'border-jade-700/50 text-jade-400 hover:bg-jade-900/20'
                        : 'border-crimson-700/50 text-crimson-400 hover:bg-crimson-900/20'
                    )}
                  >
                    {selectedCustomer.status === 'blocked' ? (
                      <><ShieldCheck size={14} /> ปลดบล็อค</>
                    ) : (
                      <><ShieldOff size={14} /> บล็อค</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Customers Table */}
        <div className="overflow-x-auto rounded-md border border-ink-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 bg-ink-800">
                <th className="px-4 py-3 text-left font-medium text-ink-300">อีเมล</th>
                <th className="px-4 py-3 text-left font-medium text-ink-300">ชื่อ</th>
                <th className="px-4 py-3 text-center font-medium text-ink-300">สถานะ</th>
                <th className="px-4 py-3 text-center font-medium text-ink-300">คำสั่งซื้อ</th>
                <th className="px-4 py-3 text-right font-medium text-ink-300">ยอดซื้อรวม</th>
                <th className="px-4 py-3 text-center font-medium text-ink-300">สมัครเมื่อ</th>
                <th className="px-4 py-3 text-right font-medium text-ink-300">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-500">
                    {loading ? 'กำลังโหลด...' : 'ไม่พบลูกค้า — กด "ค้นหา" เพื่อแสดงทั้งหมด'}
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="border-b border-ink-700/50 hover:bg-ink-850">
                    <td className="px-4 py-3 text-ink-200">{customer.email}</td>
                    <td className="px-4 py-3 text-ink-200">{customer.fullName}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        customer.status === 'blocked'
                          ? 'bg-crimson-900/30 text-crimson-400'
                          : 'bg-jade-900/30 text-jade-400'
                      )}>
                        {customer.status === 'blocked' ? 'บล็อค' : 'ใช้งาน'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-ink-300">{customer.totalOrders}</td>
                    <td className="px-4 py-3 text-right text-ink-200">{formatThb(customer.totalSpendThb)}</td>
                    <td className="px-4 py-3 text-center text-xs text-ink-400">
                      {customer.createdAt.toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleViewCustomer(customer.id)}
                        className="inline-flex items-center gap-1 rounded bg-ink-800 px-2 py-1 text-xs text-ink-300 hover:bg-ink-700 hover:text-ink-100"
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
