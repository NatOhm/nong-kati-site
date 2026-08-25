'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ShoppingCart,
  DollarSign,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  CreditCard,
  QrCode,
  BarChart3,
  Zap,
  Eye,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import { formatThb } from '@/lib/pricing';
import {
  getSalesDashboard,
  getRevenueDashboard,
  getProductAnalytics,
  getCustomerAnalytics,
} from '@/api/analytics';
import { cn } from '@/utils/cn';

// ─── Status Badge ─────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  completed: { label: 'สำเร็จ', color: 'bg-jade-900/40 text-jade-300 border-jade-700/50' },
  pending_manual_fulfilment: { label: 'รอส่งโค้ด', color: 'bg-amber-900/40 text-amber-300 border-amber-700/50' },
  pending_payment: { label: 'รอชำระเงิน', color: 'bg-sapphire-900/40 text-sapphire-200 border-sapphire-700/50' },
  refunded: { label: 'คืนเงิน', color: 'bg-crimson-900/40 text-crimson-200 border-crimson-700/50' },
  expired: { label: 'หมดอายุ', color: 'bg-ink-800 text-ink-400 border-ink-700' },
  cancelled: { label: 'ยกเลิก', color: 'bg-ink-800 text-ink-500 border-ink-700' },
  payment_failed: { label: 'ชำระล้มเหลว', color: 'bg-crimson-900/40 text-crimson-200 border-crimson-700/50' },
  paid: { label: 'ชำระแล้ว', color: 'bg-jade-900/40 text-jade-300 border-jade-700/50' },
  delivering: { label: 'กำลังส่ง', color: 'bg-amber-900/40 text-amber-300 border-amber-700/50' },
};

const PAYMENT_ICONS: Record<string, typeof QrCode> = {
  promptpay: QrCode,
  card: CreditCard,
};

// ─── Mini Bar Chart (pure CSS) ────────────────────────────
function MiniBarChart({ data, maxHeight = 80 }: { data: { date: string; revenue: number }[]; maxHeight?: number }) {
  const max = Math.max(...data.map((d) => d.revenue));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex items-end gap-1.5" style={{ height: maxHeight }}>
      {data.map((d) => {
        const height = max > 0 ? (d.revenue / max) * 100 : 0;
        const isToday = d.date === today;
        return (
          <div key={d.date} className="group relative flex flex-1 items-end">
            <div
              className={cn(
                'w-full rounded-t-sm transition-all duration-200 group-hover:opacity-80',
                isToday ? 'bg-amber-400' : 'bg-ink-600 group-hover:bg-ink-500',
              )}
              style={{ height: `${height}%`, minHeight: d.revenue > 0 ? 4 : 0 }}
            />
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-800 px-2 py-1 text-xs text-ink-100 shadow-lg group-hover:block">
              {formatThb(d.revenue)}
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-ink-800" />
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
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-800">
      <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Sparkline (mini SVG) ─────────────────────────────────
function Sparkline({ values, color = '#F0A020' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const h = 32;
  const w = 80;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');

  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

// ─── Main Dashboard ───────────────────────────────────────
export default function AdminDashboardPage(): React.JSX.Element {
  const sales = getSalesDashboard();
  const revenue = getRevenueDashboard();
  const products = getProductAnalytics();
  const customers = getCustomerAnalytics();
  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'month'>('today');

  // Mock recent orders
  const recentOrders = [
    { id: 'NK-2026-000024', customer: 'kaem@ex...', product: 'Steam Wallet ฿100', amount: 107, status: 'completed', time: '14:22', payment: 'promptpay' },
    { id: 'NK-2026-000023', customer: 'pim@ex...', product: 'Netflix ฿350', amount: 374.5, status: 'completed', time: '14:18', payment: 'card' },
    { id: 'NK-2026-000022', customer: 'som@ex...', product: 'Steam Wallet ฿500', amount: 535, status: 'pending_manual_fulfilment', time: '14:05', payment: 'promptpay' },
    { id: 'NK-2026-000021', customer: 'nisa@ex...', product: 'Google Play ฿200', amount: 214, status: 'completed', time: '13:58', payment: 'promptpay' },
    { id: 'NK-2026-000020', customer: 'art@ex...', product: 'Apple Gift ฿500', amount: 535, status: 'pending_payment', time: '13:42', payment: 'card' },
  ];

  // Low stock alerts
  const lowStockItems = [
    { name: 'Steam Wallet ฿100', sku: 'STEAM-100', stock: 3, threshold: 10 },
    { name: 'Netflix ฿350', sku: 'NETFLIX-350', stock: 5, threshold: 10 },
    { name: 'Google Play ฿200', sku: 'GP-200', stock: 4, threshold: 8 },
  ];

  // Customer activity (live feed)
  const activityFeed = [
    { type: 'order', text: 'kaem@example.com สั่งซื้อ Steam Wallet ฿100', time: '2 นาทีที่แล้ว', icon: ShoppingCart, color: 'text-jade-400' },
    { type: 'payment', text: 'pim@example.com ชำระเงิน Netflix ฿350 สำเร็จ', time: '5 นาทีที่แล้ว', icon: CheckCircle2, color: 'text-jade-400' },
    { type: 'alert', text: 'Stock STEAM-100 ต่ำกว่าเกณฑ์ (3 เหลือ)', time: '12 นาทีที่แล้ว', icon: AlertTriangle, color: 'text-amber-400' },
    { type: 'refund', text: 'คืนเงิน NK-000019 จำนวน ฿214', time: '28 นาทีที่แล้ว', icon: RotateCcw, color: 'text-crimson-400' },
    { type: 'signup', text: 'somchai@example.com สมัครสมาชิกใหม่', time: '35 นาทีที่แล้ว', icon: Users, color: 'text-sapphire-400' },
  ];

  const tabData = {
    today: { orders: sales.todayOrders, revenue: sales.todayRevenue, label: 'วันนี้' },
    week: { orders: sales.weekOrders, revenue: sales.weekRevenue, label: 'สัปดาห์นี้' },
    month: { orders: sales.monthOrders, revenue: sales.monthRevenue, label: 'เดือนนี้' },
  };
  const current = tabData[activeTab];

  const paymentMax = Math.max(...revenue.revenueByPaymentMethod.map((p) => p.count));

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      notificationCount={sales.lowStockAlerts + sales.pendingManualFulfilment}
      breadcrumbs={[{ label: 'แดชบอร์ด' }]}
    >
      <div className="space-y-6">
        {/* ── Time Filter Tabs ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink-100">แดชบอร์ด</h1>
            <p className="mt-1 text-sm text-ink-400">ภาพรวมระบบ Nong-Kati · อัปเดตล่าสุด เมื่อสักครู่</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
            {(['today', 'week', 'month'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  activeTab === tab
                    ? 'bg-amber-400 text-ink-900'
                    : 'text-ink-400 hover:text-ink-200',
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
            change={activeTab === 'today' ? 12 : activeTab === 'week' ? 8 : 15}
            sparkline={[18, 22, 19, 24, 21, 26, current.orders]}
            subtitle={`${sales.todayCompleted} สำเร็จ · ${sales.todayFailed} ล้มเหลว`}
            iconBg="bg-sapphire-900/50 text-sapphire-400"
          />
          <KPICard
            icon={DollarSign}
            label="รายได้"
            value={formatThb(current.revenue)}
            change={activeTab === 'today' ? -5 : activeTab === 'week' ? 10 : 18}
            sparkline={[4280, 5350, 6420, 3210, 7490, 8560, current.revenue]}
            subtitle={`เฉลี่ย ${formatThb(revenue.averageOrderValue)}/ออเดอร์`}
            iconBg="bg-jade-900/50 text-jade-400"
          />
          <KPICard
            icon={Package}
            label="รอส่งโค้ด"
            value={sales.pendingManualFulfilment.toString()}
            change={0}
            subtitle="ต้องดำเนินการด่วน"
            iconBg="bg-amber-900/50 text-amber-400"
            alert={sales.pendingManualFulfilment > 0}
          />
          <KPICard
            icon={Users}
            label="ลูกค้าทั้งหมด"
            value={customers.totalCustomers.toLocaleString()}
            change={12.5}
            sparkline={[980, 1020, 1080, 1150, 1200, 1230, customers.totalCustomers]}
            subtitle={`+${customers.newCustomersThisMonth} เดือนนี้ · ${customers.returningCustomerRate}% กลับมาซื้อ`}
            iconBg="bg-ink-800 text-ink-300"
          />
        </div>

        {/* ── Revenue Breakdown Bar ── */}
        <div className="rounded-xl border border-ink-700 bg-ink-850 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-200">รายได้เดือนนี้</h2>
            <span className="text-xs text-ink-400">กรกฎาคม 2026</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <MiniStat label="รายได้รวม" value={formatThb(revenue.grossRevenue)} icon={DollarSign} color="text-jade-400" />
            <MiniStat label="รายได้สุทธิ" value={formatThb(revenue.netRevenue)} icon={TrendingUp} color="text-amber-400" />
            <MiniStat label=" VAT" value={formatThb(revenue.vatCollected)} icon={BarChart3} color="text-ink-300" />
            <MiniStat label="ส่วนลด" value={formatThb(revenue.discountAmount)} icon={Zap} color="text-sapphire-400" />
            <MiniStat label="คืนเงิน" value={formatThb(revenue.refundAmount)} icon={RotateCcw} color="text-crimson-400" />
          </div>
        </div>

        {/* ── Charts Row ── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Revenue Chart */}
          <div className="rounded-xl border border-ink-700 bg-ink-850 p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-200">รายได้ 7 วันล่าสุด</h2>
              <Link href="/management/analytics" className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
                ดูทั้งหมด <ArrowUpRight size={12} />
              </Link>
            </div>
            <MiniBarChart data={revenue.revenueByDay} maxHeight={120} />
            <div className="mt-2 flex justify-between text-[10px] text-ink-500">
              {revenue.revenueByDay.map((d) => (
                <span key={d.date}>{d.date.slice(5)}</span>
              ))}
            </div>
          </div>

          {/* Payment Methods */}
          <div className="rounded-xl border border-ink-700 bg-ink-850 p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink-200">วิธีชำระเงิน</h2>
            <div className="space-y-4">
              {revenue.revenueByPaymentMethod.map((pm) => {
                const Icon = PAYMENT_ICONS[pm.method] ?? CreditCard;
                return (
                  <div key={pm.method}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon size={14} className="text-ink-400" />
                        <span className="text-xs font-medium text-ink-200">
                          {pm.method === 'promptpay' ? 'PromptPay' : 'บัตรเครดิต'}
                        </span>
                      </div>
                      <span className="text-xs text-ink-400">{pm.count} ออเดอร์</span>
                    </div>
                    <HBar value={pm.count} max={paymentMax} color={pm.method === 'promptpay' ? 'bg-amber-400' : 'bg-sapphire-400'} />
                    <p className="mt-1 text-right text-xs text-ink-500">{formatThb(pm.total)}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-lg bg-ink-800 p-3 text-center">
              <p className="text-xs text-ink-400">PromptPay คิดเป็น</p>
              <p className="text-lg font-bold text-amber-300">
                {Math.round((revenue.revenueByPaymentMethod[0]?.total ?? 0) / revenue.grossRevenue * 100)}%
              </p>
              <p className="text-[10px] text-ink-500">ของรายได้ทั้งหมด</p>
            </div>
          </div>
        </div>

        {/* ── Orders Table + Activity Feed ── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Recent Orders */}
          <div className="rounded-xl border border-ink-700 bg-ink-850 lg:col-span-2">
            <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
              <h2 className="text-sm font-semibold text-ink-200">ออเดอร์ล่าสุด</h2>
              <Link href="/management/orders" className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
                ดูทั้งหมด <ArrowUpRight size={12} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-700/50">
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-ink-500">ออเดอร์</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-ink-500">ลูกค้า</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-ink-500">สินค้า</th>
                    <th className="px-5 py-2.5 text-right text-xs font-medium text-ink-500">จำนวน</th>
                    <th className="px-5 py-2.5 text-center text-xs font-medium text-ink-500">สถานะ</th>
                    <th className="px-5 py-2.5 text-right text-xs font-medium text-ink-500">เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => {
                    const statusInfo = STATUS_MAP[order.status] ?? { label: order.status, color: 'bg-ink-800 text-ink-400 border-ink-700' };
                    const PayIcon = PAYMENT_ICONS[order.payment] ?? CreditCard;
                    return (
                      <tr key={order.id} className="border-b border-ink-700/30 hover:bg-ink-800/50 transition-colors">
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-ink-300">{order.id}</span>
                        </td>
                        <td className="px-5 py-3 text-xs text-ink-300">{order.customer}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <PayIcon size={12} className="text-ink-500" />
                            <span className="text-xs text-ink-200">{order.product}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-ink-200">{formatThb(order.amount)}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', statusInfo.color)}>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-ink-500">
                          <Clock size={10} className="mr-1 inline" />
                          {order.time}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="rounded-xl border border-ink-700 bg-ink-850">
            <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-200">
                <Activity size={14} className="text-amber-400" />
                กิจกรรมล่าสุด
              </h2>
              <span className="flex h-2 w-2 rounded-full bg-jade-400 animate-pulse" />
            </div>
            <div className="divide-y divide-ink-700/50">
              {activityFeed.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex gap-3 px-5 py-3 transition-colors hover:bg-ink-800/30">
                    <div className={cn('mt-0.5 flex-shrink-0', item.color)}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-relaxed text-ink-200">{item.text}</p>
                      <p className="mt-0.5 text-[10px] text-ink-500">{item.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Bottom Row: Top Products + Customer Metrics + Low Stock ── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Top Products */}
          <div className="rounded-xl border border-ink-700 bg-ink-850 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-200">สินค้าขายดี</h2>
              <Link href="/management/products" className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
                ดูทั้งหมด <ArrowUpRight size={12} />
              </Link>
            </div>
            <div className="space-y-3">
              {products.topProducts.map((p, i) => {
                const maxRevenue = products.topProducts[0]?.totalRevenue ?? 1;
                return (
                  <div key={p.productId}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold',
                          i === 0 ? 'bg-amber-400 text-ink-900' : i === 1 ? 'bg-ink-600 text-ink-200' : 'bg-ink-700 text-ink-400',
                        )}>
                          {i + 1}
                        </span>
                        <span className="text-xs text-ink-200">{p.name}</span>
                      </div>
                      <span className="font-mono text-xs text-ink-400">{p.totalSold} ชิ้น</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <HBar value={p.totalRevenue} max={maxRevenue} color="bg-amber-400" />
                      <span className="flex-shrink-0 text-right text-[10px] text-ink-500">{formatThb(p.totalRevenue)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Customer Metrics */}
          <div className="rounded-xl border border-ink-700 bg-ink-850 p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink-200">เมตริกลูกค้า</h2>
            <div className="space-y-4">
              <MetricRow label="ลูกค้าทั้งหมด" value={customers.totalCustomers.toLocaleString()} sub="" />
              <MetricRow label="ลูกค้า ACTIVE" value={customers.activeCustomers.toLocaleString()} sub={`${Math.round(customers.activeCustomers / customers.totalCustomers * 100)}%`} />
              <MetricRow label="ลูกค้าใหม่เดือนนี้" value={`+${customers.newCustomersThisMonth}`} sub="" highlight />
              <MetricRow label="ออเดอร์เฉลี่ย/คน" value={customers.averageOrdersPerCustomer.toString()} sub="" />
              <MetricRow label="LTV เฉลี่ย" value={formatThb(customers.averageCustomerLifetimeValue)} sub="" />
              <MetricRow label="อัตราซื้อซ้ำ" value={`${customers.returningCustomerRate}%`} sub="" />
            </div>
          </div>

          {/* Low Stock Alerts */}
          <div className="rounded-xl border border-ink-700 bg-ink-850">
            <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-200">
                <AlertTriangle size={14} className="text-amber-400" />
                สินค้าใกล้หมด
              </h2>
              <Link href="/management/inventory" className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
                ดูทั้งหมด <ArrowUpRight size={12} />
              </Link>
            </div>
            <div className="divide-y divide-ink-700/50">
              {lowStockItems.map((item) => {
                const pct = Math.round((item.stock / item.threshold) * 100);
                return (
                  <div key={item.sku} className="px-5 py-3 transition-colors hover:bg-ink-800/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-ink-200">{item.name}</p>
                        <p className="font-mono text-[10px] text-ink-500">{item.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          'text-sm font-bold',
                          item.stock <= 3 ? 'text-crimson-400' : 'text-amber-400',
                        )}>
                          {item.stock}
                        </p>
                        <p className="text-[10px] text-ink-500">/{item.threshold}</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <HBar
                        value={item.stock}
                        max={item.threshold}
                        color={item.stock <= 3 ? 'bg-crimson-400' : 'bg-amber-400'}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div className="rounded-xl border border-ink-700 bg-ink-850 p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink-200">ดำเนินการด่วน</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QuickAction href="/management/orders" icon={ShoppingCart} label="จัดการคำสั่งซื้อ" {...(sales.pendingManualFulfilment > 0 ? { badge: sales.pendingManualFulfilment } : {})} />
            <QuickAction href="/management/inventory" icon={Package} label="จัดการคลังสินค้า" {...(sales.lowStockAlerts > 0 ? { badge: sales.lowStockAlerts } : {})} />
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
  change,
  sparkline,
  subtitle,
  iconBg,
  alert = false,
}: {
  icon: React.ComponentType<Record<string, unknown>>;
  label: string;
  value: string;
  change?: number;
  sparkline?: number[];
  subtitle: string;
  iconBg: string;
  alert?: boolean;
}) {
  const isPositive = (change ?? 0) >= 0;
  return (
    <div className={cn(
      'group rounded-xl border bg-ink-850 p-4 transition-all duration-200 hover:border-ink-600',
      alert ? 'border-amber-700/50 shadow-brand-glow' : 'border-ink-700',
    )}>
      <div className="mb-3 flex items-center justify-between">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', iconBg)}>
          <Icon size={18} strokeWidth={1.5} />
        </div>
        {sparkline && <Sparkline values={sparkline} color={isPositive ? '#22C76E' : '#E8203C'} />}
      </div>
      <p className="text-xs font-medium text-ink-400">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-bold text-ink-100">{value}</p>
        {change !== undefined && change !== 0 && (
          <span className={cn(
            'flex items-center gap-0.5 text-xs font-medium',
            isPositive ? 'text-jade-400' : 'text-crimson-400',
          )}>
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isPositive ? '+' : ''}{change}%
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-ink-500">{subtitle}</p>
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
    <div className="rounded-lg bg-ink-800/50 p-3">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={color} />
        <span className="text-[10px] text-ink-400">{label}</span>
      </div>
      <p className={cn('mt-1 font-mono text-sm font-bold', color)}>{value}</p>
    </div>
  );
}

function MetricRow({ label, value, sub, highlight = false }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-ink-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={cn('font-mono text-sm font-semibold', highlight ? 'text-jade-400' : 'text-ink-200')}>
          {value}
        </span>
        {sub && <span className="text-[10px] text-ink-500">({sub})</span>}
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
      className="group flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-800/50 px-4 py-3 transition-all duration-200 hover:border-amber-700/50 hover:bg-ink-800"
    >
      <Icon size={16} className="text-ink-400 transition-colors group-hover:text-amber-400" />
      <span className="flex-1 text-sm font-medium text-ink-200 transition-colors group-hover:text-ink-100">
        {label}
      </span>
      {badge !== undefined && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-400/20 px-1.5 text-[10px] font-bold text-amber-400">
          {badge}
        </span>
      )}
      <ChevronRight size={14} className="text-ink-600 transition-colors group-hover:text-amber-400" />
    </Link>
  );
}
