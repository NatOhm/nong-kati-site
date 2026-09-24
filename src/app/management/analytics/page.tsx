'use client';

/**
 * Admin Analytics Dashboard — 11-admin.md §4-5, §9.
 * Sales, Revenue, Customer analytics.
 */

import { TrendingUp, Users, ShoppingBag, DollarSign } from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import { formatThb } from '@/lib/pricing';
import {
  getSalesDashboard,
  getRevenueDashboard,
  getCustomerAnalytics,
  getProductAnalytics,
} from '@/api/analytics';

export default function AdminAnalyticsPage(): React.JSX.Element {
  const sales = getSalesDashboard();
  const revenue = getRevenueDashboard();
  const customers = getCustomerAnalytics();
  const products = getProductAnalytics();

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'Analytics' }]}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-fg">Analytics</h1>

        {/* Sales Overview */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-md border border-line-subtle bg-surface p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-peach-100 text-fg-brand">
                <ShoppingBag size={20} />
              </div>
              <div>
                <p className="text-xs text-fg-placeholder">คำสั่งซื้อเดือนนี้</p>
                <p className="text-xl font-bold text-fg">{sales.monthOrders}</p>
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
                <p className="text-xl font-bold text-fg">{formatThb(sales.monthRevenue)}</p>
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
                <p className="text-xl font-bold text-fg">{formatThb(revenue.averageOrderValue)}</p>
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
                <p className="text-xl font-bold text-fg">{customers.totalCustomers}</p>
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
                <span className="text-fg">{formatThb(revenue.grossRevenue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-fg-placeholder"> VAT ที่จัดเก็บ</span>
                <span className="text-fg">{formatThb(revenue.vatCollected)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-fg-placeholder">ส่วนลด</span>
                <span className="text-coral-600">-{formatThb(revenue.discountAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-fg-placeholder">คืนเงิน</span>
                <span className="text-coral-600">-{formatThb(revenue.refundAmount)}</span>
              </div>
              <div className="border-t border-line-subtle pt-3">
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-fg-secondary">รายได้สุทธิ</span>
                  <span className="text-jade-600">{formatThb(revenue.netRevenue)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-line-subtle bg-surface p-6">
            <h2 className="mb-4 text-lg font-semibold text-fg">ชำระเงินผ่าน</h2>
            <div className="space-y-3">
              {revenue.revenueByPaymentMethod.map((method) => (
                <div key={method.method} className="flex justify-between text-sm">
                  <span className="text-fg-placeholder">
                    {method.method === 'promptpay' ? 'PromptPay' : 'บัตรเครดิต'}
                  </span>
                  <span className="text-fg">
                    {method.count} รายการ · {formatThb(method.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Customer Analytics */}
        <div className="rounded-md border border-line-subtle bg-surface p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg">ลูกค้า</h2>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-fg-placeholder">ลูกค้าใหม่เดือนนี้</p>
              <p className="text-lg font-bold text-fg">{customers.newCustomersThisMonth}</p>
            </div>
            <div>
              <p className="text-xs text-fg-placeholder">อัตราลูกค้ากลับมา</p>
              <p className="text-lg font-bold text-fg">{customers.returningCustomerRate}%</p>
            </div>
            <div>
              <p className="text-xs text-fg-placeholder">คำสั่งซื้อเฉลี่ย/ลูกค้า</p>
              <p className="text-lg font-bold text-fg">{customers.averageOrdersPerCustomer}</p>
            </div>
            <div>
              <p className="text-xs text-fg-placeholder">มูลค่าเฉลี่ย/ลูกค้า</p>
              <p className="text-lg font-bold text-fg">
                {formatThb(customers.averageCustomerLifetimeValue)}
              </p>
            </div>
          </div>
        </div>

        {/* Top Products */}
        <div className="rounded-md border border-line-subtle bg-surface p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg">สินค้ายอดนิยม</h2>
          <div className="space-y-3">
            {products.topProducts.map((product, idx) => (
              <div key={product.productId} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-clay-400">{idx + 1}.</span>
                  <span className="text-fg-secondary">{product.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-fg-placeholder">{product.totalSold} ขาย</span>
                  <span className="text-fg">{formatThb(product.totalRevenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
