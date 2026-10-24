'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShoppingCart,
  DollarSign,
  Package,
  AlertTriangle,
  TrendingUp,
  Users,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  CreditCard,
  QrCode,
  Banknote,
  Wallet,
  BarChart3,
  Zap,
  Eye,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import { formatThb } from '@/lib/pricing';
import { paymentMethodLabel } from '@/lib/paymentMethods';
import { adminJson } from '@/lib/adminSession';
import { withStatusColors } from '@/lib/orderStatus';
import { cn } from '@/utils/cn';

// ─── Status Badge ─────────────────────────────────────────
// Labels come from the shared map (src/lib/orderStatus.ts); this page owns
// only the badge color classes. `paid`/`delivering` cover the activity
// feed's legacy status names.
const STATUS_MAP = withStatusColors({
  completed: 'bg-jade-500/15 text-jade-700 border-jade-500/40',
  pending_manual_fulfilment: 'bg-topaz-400/20 text-peach-800 border-topaz-400',
  pending_payment: 'bg-sapphire-400/15 text-sapphire-200 border-sapphire-700/50',
  payment_confirmed: 'bg-jade-500/15 text-jade-700 border-jade-500/40',
  code_delivered: 'bg-jade-500/15 text-jade-700 border-jade-500/40',
  refunded: 'bg-coral-500/15 text-fg-error border-coral-300',
  expired: 'bg-surface text-fg-placeholder border-line-subtle',
  cancelled: 'bg-surface text-clay-400 border-line-subtle',
  payment_failed: 'bg-coral-500/15 text-fg-error border-coral-300',
  paid: 'bg-jade-500/15 text-jade-700 border-jade-500/40',
  delivering: 'bg-topaz-400/20 text-peach-800 border-topaz-400',
});

const PAYMENT_ICONS: Record<string, typeof QrCode> = {
  promptpay: QrCode,
  card: CreditCard,
  credit_card: CreditCard,
  wallet: Wallet,
  manual_transfer: Banknote,
};

/** One local formatter for every relative timestamp on this page (review
 * 2026-10-24: the orders table used to print the raw ISO string beside the
 * feed's nicely formatted copy of the same value). */
function formatOrderTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Mini Bar Chart (pure CSS) ────────────────────────────
function MiniBarChart({
  data,
  maxHeight = 80,
}: {
  data: { date: string; revenue: number; isToday?: boolean }[];
  maxHeight?: number;
}) {
  const max = Math.max(...data.map((d) => d.revenue));

  return (
    <div className="flex items-end gap-1.5" style={{ height: maxHeight }}>
      {data.map((d, i) => {
        const height = max > 0 ? (d.revenue / max) * 100 : 0;
        // isToday comes from the SERVER (local date keys) — the client clock
        // used to compute a UTC key that never matched in ICT (review 2026-10-24).
        const isToday = d.isToday ?? false;
        return (
          // EMPTY-loading rows share date:'' — fall back to the index so the
          // first paint doesn't log 7 duplicate-key errors.
          <div key={d.date || `day-${i}`} className="group relative flex flex-1 items-end">
            <div
              className={cn(
                'transition-smart w-full rounded-t-sm duration-200 group-hover:opacity-80',
                isToday ? 'bg-peach-500' : 'bg-clay-300 group-hover:bg-clay-400',
              )}
              style={{ height: `${height}%`, minHeight: d.revenue > 0 ? 4 : 0 }}
            />
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-surface px-2 py-1 text-xs text-fg shadow-clay-sm group-hover:block">
              {formatThb(d.revenue)}
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-clay-300" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Horizontal Bar ───────────────────────────────────────
function HBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
      <div
        className={cn('transition-smart h-full rounded-full duration-500', color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────
interface DashboardData {
  sales: {
    todayOrders: number;
    todayRevenue: number;
    todayCompleted: number;
    todayFailed: number;
    pendingManualFulfilment: number;
    lowStockAlerts: number;
    weekOrders: number;
    weekRevenue: number;
    monthOrders: number;
    monthRevenue: number;
  };
  revenue: {
    grossRevenue: number;
    netRevenue: number;
    vatCollected: number;
    refundAmount: number;
    discountAmount: number;
    revenueByDay: { date: string; revenue: number; isToday: boolean }[];
    revenueByPaymentMethod: { method: string; count: number; total: number }[];
    promptpaySharePct: number;
    revenueThisMonth: {
      grossRevenue: number;
      netRevenue: number;
      vatCollected: number;
      discountAmount: number;
      refundAmount: number;
    };
  };
  products: {
    topProducts: { productId: string; name: string; totalSold: number; totalRevenue: number }[];
  };
  customers: {
    totalCustomers: number;
    activeCustomers: number;
    newCustomersThisMonth: number;
    averageOrdersPerCustomer: number;
    averageCustomerLifetimeValue: number;
    returningCustomerRate: number;
  };
  stock: {
    totalUnits: number;
    variantCount: number;
    lowStock: { id: string; sku: string; name: string; stock: number; threshold: number }[];
  };
  recentOrders: {
    id: string;
    customer: string;
    product: string;
    amount: number;
    status: string;
    time: string;
    payment: string;
  }[];
}

/** Zero-filled shape so the first render never crashes while loading. */
const EMPTY: DashboardData = {
  sales: {
    todayOrders: 0,
    todayRevenue: 0,
    todayCompleted: 0,
    todayFailed: 0,
    pendingManualFulfilment: 0,
    lowStockAlerts: 0,
    weekOrders: 0,
    weekRevenue: 0,
    monthOrders: 0,
    monthRevenue: 0,
  },
  revenue: {
    grossRevenue: 0,
    netRevenue: 0,
    vatCollected: 0,
    refundAmount: 0,
    discountAmount: 0,
    revenueByDay: Array.from({ length: 7 }, () => ({ date: '', revenue: 0, isToday: false })),
    revenueByPaymentMethod: [],
    promptpaySharePct: 0,
    revenueThisMonth: {
      grossRevenue: 0,
      netRevenue: 0,
      vatCollected: 0,
      discountAmount: 0,
      refundAmount: 0,
    },
  },
  products: { topProducts: [] },
  customers: {
    totalCustomers: 0,
    activeCustomers: 0,
    newCustomersThisMonth: 0,
    averageOrdersPerCustomer: 0,
    averageCustomerLifetimeValue: 0,
    returningCustomerRate: 0,
  },
  stock: { totalUnits: 0, variantCount: 0, lowStock: [] },
  recentOrders: [],
};

export default function AdminDashboardPage(): React.JSX.Element {
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'month'>('today');

  const load = useCallback(async () => {
    try {
      const d = await adminJson<DashboardData>('/api/v1/admin/dashboard');
      setData(d);
    } catch {
      // keep zeros on failure — page still renders
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sales = data.sales;
  const revenue = data.revenue;
  const products = data.products;
  const customers = data.customers;

  const recentOrders = data.recentOrders;
  const lowStockItems = data.stock.lowStock;

  const tabData = {
    today: { orders: sales.todayOrders, revenue: sales.todayRevenue, label: 'วันนี้' },
    week: { orders: sales.weekOrders, revenue: sales.weekRevenue, label: 'สัปดาห์นี้' },
    month: { orders: sales.monthOrders, revenue: sales.monthRevenue, label: 'เดือนนี้' },
  };
  const current = tabData[activeTab];

  const paymentMax = Math.max(...revenue.revenueByPaymentMethod.map((p) => p.count));

  return (
    <AdminShell
      staffRole="super_admin"
      notificationCount={sales.lowStockAlerts + sales.pendingManualFulfilment}
      breadcrumbs={[{ label: 'แดชบอร์ด' }]}
    >
      <div className="space-y-6">
        {/* ── Time Filter Tabs ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg">แดชบอร์ด</h1>
            <p className="mt-1 text-sm text-fg-placeholder">
              ภาพรวมระบบ Nong-Kati · อัปเดตล่าสุด เมื่อสักครู่
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-line-subtle bg-surface p-1">
            {(['today', 'week', 'month'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'transition-smart rounded-md px-3 py-1.5 text-xs font-medium',
                  activeTab === tab
                    ? 'bg-peach-500 text-white'
                    : 'text-fg-placeholder hover:text-fg',
                )}
              >
                {tabData[tab].label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Primary KPI Cards ── */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KPICard
            icon={ShoppingCart}
            label="คำสั่งซื้อ"
            value={current.orders.toString()}
            subtitle={`วันนี้: ${sales.todayCompleted} สำเร็จ · ${sales.todayFailed} ล้มเหลว`}
            iconBg="bg-sapphire-400/15 text-sapphire-700"
          />
          <KPICard
            icon={DollarSign}
            label="รายได้"
            value={formatThb(current.revenue)}
            subtitle={`เฉลี่ย ${formatThb(current.orders > 0 ? current.revenue / current.orders : 0)}/ออเดอร์`}
            iconBg="bg-jade-500/15 text-jade-700"
          />
          <KPICard
            icon={Package}
            label="รอส่งโค้ด"
            value={sales.pendingManualFulfilment.toString()}
            subtitle="ต้องดำเนินการด่วน"
            iconBg="bg-peach-200 text-peach-800"
            alert={sales.pendingManualFulfilment > 0}
          />
          <KPICard
            icon={Users}
            label="ลูกค้าทั้งหมด"
            value={customers.totalCustomers.toLocaleString()}
            subtitle={`+${customers.newCustomersThisMonth} เดือนนี้ · ${customers.returningCustomerRate}% กลับมาซื้อ`}
            iconBg="bg-surface text-fg-muted"
          />
        </div>

        {/* ── Revenue Breakdown Bar ── */}
        <div className="rounded-xl border border-line-subtle bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg-secondary">รายได้เดือนนี้</h2>
            <span className="text-xs text-fg-placeholder">
              {new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <MiniStat
              label="รายได้รวม"
              value={formatThb(revenue.revenueThisMonth.grossRevenue)}
              icon={DollarSign}
              color="text-jade-600"
            />
            <MiniStat
              label="รายได้สุทธิ"
              value={formatThb(revenue.revenueThisMonth.netRevenue)}
              icon={TrendingUp}
              color="text-fg-brand"
            />
            <MiniStat
              label=" VAT"
              value={formatThb(revenue.revenueThisMonth.vatCollected)}
              icon={BarChart3}
              color="text-fg-muted"
            />
            <MiniStat
              label="ส่วนลด"
              value={formatThb(revenue.revenueThisMonth.discountAmount)}
              icon={Zap}
              color="text-sapphire-700"
            />
            <MiniStat
              label="คืนเงิน"
              value={formatThb(revenue.revenueThisMonth.refundAmount)}
              icon={RotateCcw}
              color="text-fg-error"
            />
          </div>
        </div>

        {/* ── Charts Row ── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Revenue Chart */}
          <div className="rounded-xl border border-line-subtle bg-surface p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg-secondary">รายได้ 7 วันล่าสุด</h2>
              <Link
                href="/management/analytics"
                className="flex items-center gap-1 text-xs text-fg-brand hover:text-fg-brand"
              >
                ดูทั้งหมด <ArrowUpRight size={12} />
              </Link>
            </div>
            <MiniBarChart data={revenue.revenueByDay} maxHeight={120} />
            <div className="mt-2 flex justify-between text-[10px] text-clay-400">
              {revenue.revenueByDay.map((d, i) => (
                <span key={d.date || `label-${i}`}>{d.date.slice(5)}</span>
              ))}
            </div>
          </div>

          {/* Payment Methods */}
          <div className="rounded-xl border border-line-subtle bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-fg-secondary">วิธีชำระเงิน</h2>
            <div className="space-y-4">
              {revenue.revenueByPaymentMethod.map((pm) => {
                const Icon = PAYMENT_ICONS[pm.method] ?? CreditCard;
                return (
                  <div key={pm.method}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon size={14} className="text-fg-placeholder" />
                        <span className="text-xs font-medium text-fg-secondary">
                          {paymentMethodLabel(pm.method)}
                        </span>
                      </div>
                      <span className="text-xs text-fg-placeholder">{pm.count} ออเดอร์</span>
                    </div>
                    <HBar
                      value={pm.count}
                      max={paymentMax}
                      color={pm.method === 'promptpay' ? 'bg-peach-500' : 'bg-sapphire-400'}
                    />
                    <p className="mt-1 text-right text-xs text-clay-400">{formatThb(pm.total)}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-lg bg-surface p-3 text-center">
              <p className="text-xs text-fg-placeholder">PromptPay คิดเป็น</p>
              <p className="text-lg font-bold text-fg-brand">{revenue.promptpaySharePct}%</p>
              <p className="text-[10px] text-clay-400">ของรายได้ทั้งหมด</p>
            </div>
          </div>
        </div>

        {/* ── Orders Table + Activity Feed ── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Recent Orders */}
          <div className="rounded-xl border border-line-subtle bg-surface lg:col-span-2">
            <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
              <h2 className="text-sm font-semibold text-fg-secondary">ออเดอร์ล่าสุด</h2>
              <Link
                href="/management/orders"
                className="flex items-center gap-1 text-xs text-fg-brand hover:text-fg-brand"
              >
                ดูทั้งหมด <ArrowUpRight size={12} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle">
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-clay-400">
                      ออเดอร์
                    </th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-clay-400">
                      ลูกค้า
                    </th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-clay-400">
                      สินค้า
                    </th>
                    <th className="px-5 py-2.5 text-right text-xs font-medium text-clay-400">
                      จำนวน
                    </th>
                    <th className="px-5 py-2.5 text-center text-xs font-medium text-clay-400">
                      สถานะ
                    </th>
                    <th className="px-5 py-2.5 text-right text-xs font-medium text-clay-400">
                      เวลา
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => {
                    const statusInfo = STATUS_MAP[order.status] ?? {
                      label: order.status,
                      color: 'bg-surface text-fg-placeholder border-line-subtle',
                    };
                    const PayIcon = PAYMENT_ICONS[order.payment] ?? CreditCard;
                    return (
                      <tr
                        key={order.id}
                        className="border-line-subtle/30 border-b transition-colors hover:bg-surface"
                      >
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-fg-muted">{order.id}</span>
                        </td>
                        <td className="px-5 py-3 text-xs text-fg-muted">{order.customer}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <PayIcon size={12} className="text-clay-400" />
                            <span className="text-xs text-fg-secondary">{order.product}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-fg-secondary">
                          {formatThb(order.amount)}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                              statusInfo.color,
                            )}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-clay-400">
                          <Clock size={10} className="mr-1 inline" />
                          {formatOrderTime(order.time)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="rounded-xl border border-line-subtle bg-surface">
            <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-secondary">
                <Activity size={14} className="text-fg-brand" />
                กิจกรรมล่าสุด
              </h2>
              <span className="flex h-2 w-2 animate-pulse rounded-full bg-jade-500" />
            </div>
            <div className="divide-y divide-clay-200">
              {recentOrders.length === 0 ? (
                <p className="px-5 py-6 text-center text-xs text-fg-muted">ยังไม่มีกิจกรรม</p>
              ) : (
                recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="hover:bg-surface/30 flex gap-3 px-5 py-3 transition-colors"
                  >
                    <div className="text-jade-600 mt-0.5 flex-shrink-0">
                      <ShoppingCart size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-relaxed text-fg-secondary">
                        {order.customer} สั่งซื้อ {order.product}
                      </p>
                      <p className="mt-0.5 text-[10px] text-clay-400">{formatOrderTime(order.time)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom Row: Top Products + Customer Metrics + Low Stock ── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Top Products */}
          <div className="rounded-xl border border-line-subtle bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg-secondary">สินค้าขายดี</h2>
              <Link
                href="/management/products"
                className="flex items-center gap-1 text-xs text-fg-brand hover:text-fg-brand"
              >
                ดูทั้งหมด <ArrowUpRight size={12} />
              </Link>
            </div>
            <div className="space-y-3">
              {products.topProducts.map((p, i) => {
                const maxRevenue = products.topProducts[0]?.totalRevenue ?? 1;
                return (
                  // productId alone is NOT unique here: groupBy splits one
                  // variant into a row per historical productNameTh, so a
                  // renamed product showed up twice under the same variantId
                  // and React logged duplicate-key errors (live check
                  // 2026-10-24). The (variantId, name) pair is the group's
                  // own granularity — unique by construction.
                  <div key={`${p.productId}-${p.name}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold',
                            i === 0
                              ? 'bg-peach-500 text-white'
                              : i === 1
                                ? 'bg-clay-300 text-clay-800'
                                : 'bg-clay-200 text-fg-placeholder',
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="text-xs text-fg-secondary">{p.name}</span>
                      </div>
                      <span className="font-mono text-xs text-fg-placeholder">
                        {p.totalSold} ชิ้น
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <HBar value={p.totalRevenue} max={maxRevenue} color="bg-peach-500" />
                      <span className="flex-shrink-0 text-right text-[10px] text-clay-400">
                        {formatThb(p.totalRevenue)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Customer Metrics */}
          <div className="rounded-xl border border-line-subtle bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-fg-secondary">เมตริกลูกค้า</h2>
            <div className="space-y-4">
              <MetricRow
                label="ลูกค้าทั้งหมด"
                value={customers.totalCustomers.toLocaleString()}
                sub=""
              />
              <MetricRow
                label="ลูกค้า ACTIVE"
                value={customers.activeCustomers.toLocaleString()}
                sub={
                  customers.totalCustomers > 0
                    ? `${Math.round((customers.activeCustomers / customers.totalCustomers) * 100)}%`
                    : '0%'
                }
              />
              <MetricRow
                label="ลูกค้าใหม่เดือนนี้"
                value={`+${customers.newCustomersThisMonth}`}
                sub=""
                highlight
              />
              <MetricRow
                label="ออเดอร์เฉลี่ย/คน"
                value={customers.averageOrdersPerCustomer.toString()}
                sub=""
              />
              <MetricRow
                label="LTV เฉลี่ย"
                value={formatThb(customers.averageCustomerLifetimeValue)}
                sub=""
              />
              <MetricRow
                label="อัตราซื้อซ้ำ"
                value={`${customers.returningCustomerRate}%`}
                sub=""
              />
            </div>
          </div>

          {/* Low Stock Alerts */}
          <div className="rounded-xl border border-line-subtle bg-surface">
            <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-secondary">
                <AlertTriangle size={14} className="text-fg-brand" />
                สินค้าใกล้หมด
              </h2>
              <Link
                href="/management/inventory"
                className="flex items-center gap-1 text-xs text-fg-brand hover:text-fg-brand"
              >
                ดูทั้งหมด <ArrowUpRight size={12} />
              </Link>
            </div>
            <div className="divide-y divide-clay-200">
              {lowStockItems.map((item) => {
                const pct = Math.round((item.stock / item.threshold) * 100);
                return (
                  <div key={item.id} className="hover:bg-surface/30 px-5 py-3 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-fg-secondary">{item.name}</p>
                        <p className="font-mono text-[10px] text-clay-400">{item.sku}</p>
                      </div>
                      <div className="text-right">
                        <p
                          className={cn(
                            'text-sm font-bold',
                            item.stock <= 3 ? 'text-fg-error' : 'text-fg-brand',
                          )}
                        >
                          {item.stock}
                        </p>
                        <p className="text-[10px] text-clay-400">/{item.threshold}</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <HBar
                        value={item.stock}
                        max={item.threshold}
                        color={item.stock <= 3 ? 'bg-coral-500' : 'bg-peach-500'}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div className="rounded-xl border border-line-subtle bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold text-fg-secondary">ดำเนินการด่วน</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QuickAction
              href="/management/orders"
              icon={ShoppingCart}
              label="จัดการคำสั่งซื้อ"
              {...(sales.pendingManualFulfilment > 0
                ? { badge: sales.pendingManualFulfilment }
                : {})}
            />
            <QuickAction
              href="/management/inventory"
              icon={Package}
              label="จัดการคลังสินค้า"
              {...(sales.lowStockAlerts > 0 ? { badge: sales.lowStockAlerts } : {})}
            />
            <QuickAction href="/management/products" icon={Eye} label="ดูสินค้าทั้งหมด" />
            <QuickAction href="/management/customers" icon={Users} label="จัดการลูกค้า" />
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

// ─── Sub Components ───────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  subtitle,
  iconBg,
  alert = false,
}: {
  icon: React.ComponentType<Record<string, unknown>>;
  label: string;
  value: string;
  subtitle: string;
  iconBg: string;
  alert?: boolean;
}) {
  return (
    <div
      className={cn(
        'transition-smart group rounded-xl border bg-surface p-4 duration-200 hover:border-line',
        alert ? 'border-line-brand shadow-brand-glow' : 'border-line-subtle',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', iconBg)}>
          <Icon size={18} strokeWidth={1.5} />
        </div>
      </div>
      <p className="text-xs font-medium text-fg-placeholder">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        {/* tabular-nums: KPI digits must not reflow as values change */}
        <p className="text-2xl font-bold tabular-nums text-fg">{value}</p>
      </div>
      <p className="mt-1 text-[11px] text-clay-400">{subtitle}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<Record<string, unknown>>;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-surface p-3">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={color} />
        <span className="text-[10px] text-fg-placeholder">{label}</span>
      </div>
      <p className={cn('mt-1 font-mono text-sm font-bold', color)}>{value}</p>
    </div>
  );
}

function MetricRow({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-fg-placeholder">{label}</span>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'font-mono text-sm font-semibold',
            highlight ? 'text-jade-600' : 'text-fg-secondary',
          )}
        >
          {value}
        </span>
        {sub && <span className="text-[10px] text-clay-400">({sub})</span>}
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  badge,
}: {
  href: string;
  icon: React.ComponentType<Record<string, unknown>>;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="transition-smart group flex items-center gap-3 rounded-lg border border-line-subtle bg-surface px-4 py-3 duration-200 hover:border-line-brand hover:bg-surface"
    >
      <Icon size={16} className="text-fg-placeholder transition-colors group-hover:text-fg-brand" />
      <span className="flex-1 text-sm font-medium text-fg-secondary transition-colors group-hover:text-fg">
        {label}
      </span>
      {badge !== undefined && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-peach-500/20 px-1.5 text-[10px] font-bold text-fg-brand">
          {badge}
        </span>
      )}
      <ChevronRight
        size={14}
        className="text-fg-placeholder transition-colors group-hover:text-fg-brand"
      />
    </Link>
  );
}
