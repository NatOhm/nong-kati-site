'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Eye, ShieldOff, ShieldCheck, XCircle, Tag, Wallet } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminFetch } from '@/lib/adminSession';
import { TIER_LABELS, type PriceTier } from '@/lib/pricing';
import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';

/**
 * Admin Customers — real DB-backed list + detail + price-tier management
 * (ราคาปลีก/สมาชิก/ตัวแทนจำหน่าย). Tiers change what the customer pays on
 * the storefront; changes are audited server-side.
 */

type CustomerListItem = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  tier: PriceTier;
  emailVerified: boolean;
  totalOrders: number;
  totalSpendThb: number;
  walletBalanceThb: number;
  createdAt: string;
  lastLoginAt: string | null;
};

type CustomerDetail = Omit<CustomerListItem, 'createdAt' | 'lastLoginAt'> & {
  phoneNumber: string | null;
  walletBalanceThb: number;
  marketingOptIn: boolean;
  failedLoginAttempts: number;
  recentOrders: {
    orderNumber: string;
    status: string;
    totalAmountThb: number;
    createdAt: string;
  }[];
};

const TIER_BADGE: Record<PriceTier, string> = {
  retail: 'bg-clay-500/15 text-clay-700',
  member: 'bg-peach-500/15 text-peach-700',
  dealer: 'bg-jade-500/15 text-jade-700',
};

const TIER_OPTIONS: PriceTier[] = ['retail', 'member', 'dealer'];

export default function AdminCustomersPage(): React.JSX.Element {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (statusFilter) params.set('status', statusFilter);
      const res = await adminFetch(`/api/v1/admin/customers?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const result = (await res.json()) as { data: CustomerListItem[] };
      setCustomers(result.data);
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : 'โหลดลูกค้าไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  // Load the full list once on mount.
  useEffect(() => {
    setLoading(true);
    adminFetch('/api/v1/admin/customers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d: { data?: CustomerListItem[] }) => setCustomers(d.data ?? []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, []);

  const handleViewCustomer = async (customerId: string) => {
    const res = await adminFetch(`/api/v1/admin/customers/${customerId}`, { cache: 'no-store' });
    if (res.ok) setSelectedCustomer((await res.json()) as CustomerDetail);
  };

  const handleBlockToggle = async (customerId: string, currentStatus: string) => {
    // Block toggling goes through the same PATCH endpoint family; the block
    // action lives on its own route and needs customers:block permission.
    const block = currentStatus !== 'blocked';
    const res = await adminFetch(`/api/v1/admin/customers/${customerId}/block`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocked: block }),
    });
    if (res.ok) {
      setActionMessage(block ? 'บล็อคลูกค้าสำเร็จ' : 'ปลดบล็อคสำเร็จ');
      setSelectedCustomer(null);
      void handleSearch();
    }
  };

  /** Wallet credit — signed amount; positive = add, negative = deduct. */
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [creditBusy, setCreditBusy] = useState(false);

  const handleCredit = async (customerId: string) => {
    const amount = Number(creditAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      setActionMessage('ระบุจำนวนเงิน (ใส่เครื่องหมาย - หน้าตัวเลขเพื่อหักเครดิต)');
      return;
    }
    if (amount < 0 && !window.confirm(`ยืนยันหักเครดิต ${formatThb(Math.abs(amount))}?`)) return;
    setCreditBusy(true);
    try {
      const res = await adminFetch(`/api/v1/admin/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'credit',
          amountThb: amount,
          note: creditNote || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; balanceThb?: number };
      if (!res.ok) {
        setActionMessage(
          data.error === 'INSUFFICIENT_BALANCE'
            ? 'ยอดเครดิตไม่พอสำหรับหัก'
            : (data.error ?? 'ทำรายการไม่สำเร็จ'),
        );
        return;
      }
      setActionMessage(
        `ปรับเครดิต ${formatThb(amount)} สำเร็จ — คงเหลือ ${formatThb(data.balanceThb ?? 0)}`,
      );
      setCreditAmount('');
      setCreditNote('');
      void handleSearch();
      void handleViewCustomer(customerId);
    } finally {
      setCreditBusy(false);
    }
  };

  const handleTierChange = async (customerId: string, tier: PriceTier) => {
    const res = await adminFetch(`/api/v1/admin/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setActionMessage(data.error ?? 'เปลี่ยนระดับราคาไม่สำเร็จ');
      return;
    }
    setActionMessage(`เปลี่ยนระดับราคาเป็น ${TIER_LABELS[tier]} สำเร็จ`);
    // Refresh both the row and the open detail view.
    void handleSearch();
    void handleViewCustomer(customerId);
  };

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'ลูกค้า' }]}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-fg">ลูกค้า</h1>

        {actionMessage && (
          <div className="rounded-md border border-jade-500/40 bg-jade-500/10 px-4 py-3 text-sm text-jade-700">
            {actionMessage}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 md:max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="ค้นหาอีเมล หรือชื่อ..."
              className="w-full rounded-md border border-line-subtle bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-clay-400 focus:border-line-brand"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-fg-secondary focus:border-line-brand"
          >
            <option value="">ทุกสถานะ</option>
            <option value="active">ใช้งาน</option>
            <option value="blocked">บล็อค</option>
          </select>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="rounded-md bg-peach-500 px-4 py-2 text-sm font-medium text-fg hover:bg-peach-400 disabled:opacity-50"
          >
            {loading ? 'กำลังค้นหา...' : 'ค้นหา'}
          </button>
        </div>

        {/* Customer Detail Modal */}
        {selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-line-subtle bg-surface-base p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-fg">
                  {selectedCustomer.fullName || selectedCustomer.email}
                </h2>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-fg-placeholder hover:text-fg"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-fg-placeholder">อีเมล</p>
                    <p className="text-fg">{selectedCustomer.email}</p>
                  </div>
                  <div>
                    <p className="text-fg-placeholder">โทรศัพท์</p>
                    <p className="text-fg">{selectedCustomer.phoneNumber ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-fg-placeholder">สถานะ</p>
                    <p
                      className={cn(
                        'font-medium',
                        selectedCustomer.status === 'blocked' ? 'text-coral-600' : 'text-jade-600',
                      )}
                    >
                      {selectedCustomer.status === 'blocked' ? 'บล็อค' : 'ใช้งาน'}
                    </p>
                  </div>
                  <div>
                    <p className="text-fg-placeholder">อีเมลยืนยัน</p>
                    <p className="text-fg">
                      {selectedCustomer.emailVerified ? '✓ ยืนยันแล้ว' : '✗ ยังไม่ยืนยัน'}
                    </p>
                  </div>
                  <div>
                    <p className="text-fg-placeholder">คำสั่งซื้อทั้งหมด</p>
                    <p className="text-fg">{selectedCustomer.totalOrders}</p>
                  </div>
                  <div>
                    <p className="text-fg-placeholder">ยอดซื้อรวม (สะสม)</p>
                    <p className="text-fg">{formatThb(selectedCustomer.totalSpendThb)}</p>
                  </div>
                </div>

                {/* Wallet credit — admin adds/deducts store credit; logged to
                    TopUpLog('admin_credit') so the customer's ประวัติการเติมเงิน
                    always reflects the adjustment */}
                <div className="rounded-md border border-line-subtle bg-surface p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-fg-muted">
                    <Wallet size={14} /> เครดิต/เงินในกระเป๋า
                  </p>
                  <p className="mb-2 text-lg font-bold text-fg">
                    {formatThb(selectedCustomer.walletBalanceThb)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(e.target.value)}
                      placeholder="+100 หรือ -50"
                      className="w-28 rounded-md border border-line-subtle bg-surface px-2 py-1.5 text-sm text-fg placeholder:text-clay-400 focus:border-line-brand"
                    />
                    <input
                      type="text"
                      value={creditNote}
                      onChange={(e) => setCreditNote(e.target.value)}
                      placeholder="หมายเหตุ (ไม่บังคับ)"
                      className="min-w-36 flex-1 rounded-md border border-line-subtle bg-surface px-2 py-1.5 text-sm text-fg placeholder:text-clay-400 focus:border-line-brand"
                    />
                    <button
                      onClick={() => handleCredit(selectedCustomer.id)}
                      disabled={creditBusy || creditAmount.trim() === ''}
                      className="rounded-md bg-peach-500 px-3 py-1.5 text-sm font-medium text-fg hover:bg-peach-400 disabled:opacity-50"
                    >
                      {creditBusy ? 'กำลังบันทึก...' : 'ปรับเครดิต'}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-fg-placeholder">
                    บวก = เพิ่มเครดิต, ติดลบ = หักเครดิต — บันทึกในประวัติเติมเงินของลูกค้าอัตโนมัติ
                  </p>
                </div>

                {/* Price tier — changes what this customer pays storewide */}
                <div className="rounded-md border border-line-subtle bg-surface p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-fg-muted">
                    <Tag size={14} /> ระดับราคา (สิทธิ์ราคาสมาชิก/ตัวแทน)
                  </p>
                  <div className="flex gap-2">
                    {TIER_OPTIONS.map((t) => (
                      <button
                        key={t}
                        onClick={() => handleTierChange(selectedCustomer.id, t)}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                          selectedCustomer.tier === t
                            ? 'bg-peach-500 text-fg'
                            : 'border border-line-subtle bg-surface-base text-fg-muted hover:bg-clay-300',
                        )}
                      >
                        {TIER_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recent Orders */}
                {selectedCustomer.recentOrders.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-fg-muted">คำสั่งซื้อล่าสุด</p>
                    {selectedCustomer.recentOrders.map((order, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded border border-line-subtle p-2 text-sm"
                      >
                        <div>
                          <p className="text-fg-secondary">{order.orderNumber}</p>
                          <p className="text-xs text-fg-placeholder">
                            {new Date(order.createdAt).toLocaleDateString('th-TH')}
                          </p>
                        </div>
                        <p className="text-fg-secondary">{formatThb(order.totalAmountThb)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 border-t border-line-subtle pt-4">
                  <button
                    onClick={() => handleBlockToggle(selectedCustomer.id, selectedCustomer.status)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
                      selectedCustomer.status === 'blocked'
                        ? 'text-jade-600 border-jade-500/40 hover:bg-jade-900/20'
                        : 'border-coral-300 text-coral-600 hover:bg-coral-50',
                    )}
                  >
                    {selectedCustomer.status === 'blocked' ? (
                      <>
                        <ShieldCheck size={14} /> ปลดบล็อค
                      </>
                    ) : (
                      <>
                        <ShieldOff size={14} /> บล็อค
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Customers Table */}
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface">
                <th className="px-4 py-3 text-left font-medium text-fg-muted">อีเมล</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">ชื่อ</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">สถานะ</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">ระดับราคา</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">คำสั่งซื้อ</th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">เครดิตคงเหลือ</th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-clay-400">
                    {loading ? 'กำลังโหลด...' : 'ไม่พบลูกค้า — กด "ค้นหา" เพื่อแสดงทั้งหมด'}
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="border-b border-line-subtle hover:bg-surface">
                    <td className="px-4 py-3 text-fg-secondary">{customer.email}</td>
                    <td className="px-4 py-3 text-fg-secondary">{customer.fullName || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          customer.status === 'blocked'
                            ? 'bg-coral-500/15 text-coral-700'
                            : 'text-jade-600 bg-jade-500/15',
                        )}
                      >
                        {customer.status === 'blocked' ? 'บล็อค' : 'ใช้งาน'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          TIER_BADGE[customer.tier],
                        )}
                      >
                        {TIER_LABELS[customer.tier]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-fg-muted">{customer.totalOrders}</td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right font-medium',
                        customer.walletBalanceThb > 0 ? 'text-jade-600' : 'text-fg-muted',
                      )}
                    >
                      {formatThb(customer.walletBalanceThb)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleViewCustomer(customer.id)}
                        className="inline-flex items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-fg-muted hover:bg-clay-300 hover:text-fg"
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
