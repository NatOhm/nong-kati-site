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
        <h1 className="text-2xl font-bold text-clay-900">Analytics</h1>

        {/* Sales Overview */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-md border border-clay-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-peach-100 text-peach-600">
                <ShoppingBag size={20} />
              </div>
              <div>
                <p className="text-xs text-clay-500">คำสั่งซื้อเดือนนี้</p>
                <p className="text-xl font-bold text-clay-900">{sales.monthOrders}</p>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-clay-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="text-jade-600 flex h-10 w-10 items-center justify-center rounded-md bg-jade-500/15">
                <DollarSign size={20} />
              </div>
              <div>
                <p className="text-xs text-clay-500">รายได้เดือนนี้</p>
                <p className="text-xl font-bold text-clay-900">{formatThb(sales.monthRevenue)}</p>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-clay-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-900/30 text-sky-400">
                <TrendingUp size={20} />
              </div>
              <div>
                <p className="text-xs text-clay-500">มูลค่าเฉลี่ย</p>
                <p className="text-xl font-bold text-clay-900">
                  {formatThb(revenue.averageOrderValue)}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-clay-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-violet-900/30 text-violet-400">
                <Users size={20} />
              </div>
              <div>
                <p className="text-xs text-clay-500">ลูกค้าทั้งหมด</p>
                <p className="text-xl font-bold text-clay-900">{customers.totalCustomers}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Revenue Breakdown */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-clay-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-clay-900">รายได้</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-clay-500">รายได้รวม</span>
                <span className="text-clay-900">{formatThb(revenue.grossRevenue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-clay-500"> VAT ที่จัดเก็บ</span>
                <span className="text-clay-900">{formatThb(revenue.vatCollected)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-clay-500">ส่วนลด</span>
                <span className="text-coral-600">-{formatThb(revenue.discountAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-clay-500">คืนเงิน</span>
                <span className="text-coral-600">-{formatThb(revenue.refundAmount)}</span>
              </div>
              <div className="border-t border-clay-200 pt-3">
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-clay-700">รายได้สุทธิ</span>
                  <span className="text-jade-600">{formatThb(revenue.netRevenue)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-clay-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-clay-900">ชำระเงินผ่าน</h2>
            <div className="space-y-3">
              {revenue.revenueByPaymentMethod.map((method) => (
                <div key={method.method} className="flex justify-between text-sm">
                  <span className="text-clay-500">
                    {method.method === 'promptpay' ? 'PromptPay' : 'บัตรเครดิต'}
                  </span>
                  <span className="text-clay-900">
                    {method.count} รายการ · {formatThb(method.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Customer Analytics */}
        <div className="rounded-md border border-clay-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-clay-900">ลูกค้า</h2>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-clay-500">ลูกค้าใหม่เดือนนี้</p>
              <p className="text-lg font-bold text-clay-900">{customers.newCustomersThisMonth}</p>
            </div>
            <div>
              <p className="text-xs text-clay-500">อัตราลูกค้ากลับมา</p>
              <p className="text-lg font-bold text-clay-900">{customers.returningCustomerRate}%</p>
            </div>
            <div>
              <p className="text-xs text-clay-500">คำสั่งซื้อเฉลี่ย/ลูกค้า</p>
              <p className="text-lg font-bold text-clay-900">
                {customers.averageOrdersPerCustomer}
              </p>
            </div>
            <div>
              <p className="text-xs text-clay-500">มูลค่าเฉลี่ย/ลูกค้า</p>
              <p className="text-lg font-bold text-clay-900">
                {formatThb(customers.averageCustomerLifetimeValue)}
              </p>
            </div>
          </div>
        </div>

        {/* Top Products */}
        <div className="rounded-md border border-clay-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-clay-900">สินค้ายอดนิยม</h2>
          <div className="space-y-3">
            {products.topProducts.map((product, idx) => (
              <div key={product.productId} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-clay-400">{idx + 1}.</span>
                  <span className="text-clay-700">{product.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-clay-500">{product.totalSold} ขาย</span>
                  <span className="text-clay-900">{formatThb(product.totalRevenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
