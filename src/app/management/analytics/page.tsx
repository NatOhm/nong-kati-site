'use client';

/**
 * Admin Analytics Dashboard — 11-admin.md §4-5, §9.
 * Live data from /api/v1/admin/dashboard (review 2026-09-26: the previous
 * page rendered synchronous mock figures — fabricated numbers that looked
 * authoritative). Explicit loading/error states; never falls back to sample
 * data on failure.
 */

import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, Users, ShoppingBag, DollarSign, RefreshCw } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminJson } from '@/lib/adminSession';
import { formatThb } from '@/lib/pricing';

type DashboardResponse = {
  sales: {
    monthOrders: number;
    monthRevenue: number;
    todayOrders: number;
    todayRevenue: number;
    pendingManualFulfilment: number;
    lowStockAlerts: number;
  };
  revenue: {
    grossRevenue: number;
    netRevenue: number;
    vatCollected: number;
    refundAmount: number;
    discountAmount: number;
    averageOrderValue: number;
    revenueByPaymentMethod: { method: string; count: number; total: number }[];
  };
  products: {
    topProducts: { productId: string; name: string; totalSold: number; totalRevenue: number }[];
  };
  customers: {
    totalCustomers: number;
    newCustomersThisMonth: number;
    averageOrdersPerCustomer: number;
    averageCustomerLifetimeValue: number;
    returningCustomerRate: number;
  };
};

const METHOD_LABELS: Record<string, string> = {
  promptpay: 'PromptPay',
  card: 'บัตรเครดิต',
  wallet: 'เงินในกระเป๋า',
  manual_transfer: 'โอนเงิน',
  credit_card: 'บัตรเครดิต',
};

export default function AdminAnalyticsPage(): React.JSX.Element {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminJson<DashboardResponse>('/api/v1/admin/dashboard', {
        cache: 'no-store',
      });
      setData(res);
    } catch {
      setError('โหลดข้อมูล analytics ไม่สำเร็จ — กดลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'Analytics' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg">Analytics</h1>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-line-brand px-4 text-sm font-semibold text-fg-brand transition-colors hover:bg-peach-500/10 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            ลองใหม่
          </button>
        </div>

        {error && (
          <div
            className="rounded-lg border border-coral-300 bg-coral-50 px-4 py-3 text-sm text-coral-700"
            role="alert"
          >
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-md border border-line-subtle bg-surface"
              />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* Sales Overview */}
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-md border border-line-subtle bg-surface p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-peach-100 text-fg-brand">
                    <ShoppingBag size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-fg-placeholder">คำสั่งซื้อเดือนนี้</p>
                    <p className="text-xl font-bold text-fg">{data.sales.monthOrders}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-line-subtle bg-surface p-4">
                <div className="flex items-center gap-3">
                  <div className="text-jade-600 flex h-10 w-10 items-center justify-center rounded-md bg-jade-500/15">
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-fg-placeholder">รายได้เดือนนี้</p>
                    <p className="text-xl font-bold text-fg">
                      {formatThb(data.sales.monthRevenue)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-line-subtle bg-surface p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sapphire-400/15 text-sapphire-700">
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-fg-placeholder">มูลค่าเฉลี่ย</p>
                    <p className="text-xl font-bold text-fg">
                      {formatThb(data.revenue.averageOrderValue)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-line-subtle bg-surface p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-topaz-400/20 text-peach-800">
                    <Users size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-fg-placeholder">ลูกค้าทั้งหมด</p>
                    <p className="text-xl font-bold text-fg">{data.customers.totalCustomers}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Revenue Breakdown */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-line-subtle bg-surface p-6">
                <h2 className="mb-4 text-lg font-semibold text-fg">รายได้</h2>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-fg-placeholder">รายได้รวม</span>
                    <span className="text-fg">{formatThb(data.revenue.grossRevenue)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-fg-placeholder"> VAT ที่จัดเก็บ</span>
                    <span className="text-fg">{formatThb(data.revenue.vatCollected)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-fg-placeholder">ส่วนลด</span>
                    <span className="text-coral-600">
                      -{formatThb(data.revenue.discountAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-fg-placeholder">คืนเงิน</span>
                    <span className="text-coral-600">-{formatThb(data.revenue.refundAmount)}</span>
                  </div>
                  <div className="border-t border-line-subtle pt-3">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-fg-secondary">รายได้สุทธิ</span>
                      <span className="text-jade-600">{formatThb(data.revenue.netRevenue)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-line-subtle bg-surface p-6">
                <h2 className="mb-4 text-lg font-semibold text-fg">ชำระเงินผ่าน</h2>
                <div className="space-y-3">
                  {data.revenue.revenueByPaymentMethod.length === 0 ? (
                    <p className="text-sm text-fg-placeholder">ยังไม่มีคำสั่งซื้อที่ชำระแล้ว</p>
                  ) : (
                    data.revenue.revenueByPaymentMethod.map((method) => (
                      <div key={method.method} className="flex justify-between text-sm">
                        <span className="text-fg-placeholder">
                          {METHOD_LABELS[method.method] ?? method.method}
                        </span>
                        <span className="text-fg">
                          {method.count} รายการ · {formatThb(method.total)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Customer Analytics */}
            <div className="rounded-md border border-line-subtle bg-surface p-6">
              <h2 className="mb-4 text-lg font-semibold text-fg">ลูกค้า</h2>
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <p className="text-xs text-fg-placeholder">ลูกค้าใหม่เดือนนี้</p>
                  <p className="text-lg font-bold text-fg">
                    {data.customers.newCustomersThisMonth}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fg-placeholder">อัตราลูกค้ากลับมา</p>
                  <p className="text-lg font-bold text-fg">
                    {data.customers.returningCustomerRate}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fg-placeholder">คำสั่งซื้อเฉลี่ย/ลูกค้า</p>
                  <p className="text-lg font-bold text-fg">
                    {data.customers.averageOrdersPerCustomer}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fg-placeholder">มูลค่าเฉลี่ย/ลูกค้า</p>
                  <p className="text-lg font-bold text-fg">
                    {formatThb(data.customers.averageCustomerLifetimeValue)}
                  </p>
                </div>
              </div>
            </div>

            {/* Top Products */}
            <div className="rounded-md border border-line-subtle bg-surface p-6">
              <h2 className="mb-4 text-lg font-semibold text-fg">สินค้ายอดนิยม</h2>
              <div className="space-y-3">
                {data.products.topProducts.length === 0 ? (
                  <p className="text-sm text-fg-placeholder">ยังไม่มีสถิติการขาย</p>
                ) : (
                  data.products.topProducts.map((product, idx) => (
                    <div
                      key={product.productId}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-clay-400">{idx + 1}.</span>
                        <span className="text-fg-secondary">{product.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-fg-placeholder">{product.totalSold} ขาย</span>
                        <span className="text-fg">{formatThb(product.totalRevenue)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
