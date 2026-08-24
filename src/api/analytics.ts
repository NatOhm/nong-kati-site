/**
 * Analytics API — 11-admin.md §4-5, §9.
 * Sales, Revenue, and Customer analytics.
 * Uses mock data for M11 (Prisma in production).
 */

// ─── Types ──────────────────────────────────────────────

export type SalesDashboard = {
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

export type RevenueDashboard = {
  grossRevenue: number;
  netRevenue: number;
  vatCollected: number;
  refundAmount: number;
  discountAmount: number;
  averageOrderValue: number;
  revenueByDay: { date: string; revenue: number }[];
  revenueByPaymentMethod: { method: string; count: number; total: number }[];
};

export type CustomerAnalytics = {
  totalCustomers: number;
  activeCustomers: number;
  newCustomersThisMonth: number;
  averageOrdersPerCustomer: number;
  averageCustomerLifetimeValue: number;
  returningCustomerRate: number;
  topCustomers: {
    customerId: string;
    email: string;
    totalOrders: number;
    totalSpend: number;
  }[];
};

export type ProductAnalytics = {
  topProducts: {
    productId: string;
    name: string;
    totalSold: number;
    totalRevenue: number;
  }[];
  categoryPerformance: {
    categoryId: string;
    name: string;
    orderCount: number;
    revenue: number;
  }[];
};

// ─── Mock Data ──────────────────────────────────────────

export function getSalesDashboard(): SalesDashboard {
  return {
    todayOrders: 24,
    todayRevenue: 2630.0,
    todayCompleted: 22,
    todayFailed: 0,
    pendingManualFulfilment: 2,
    lowStockAlerts: 3,
    weekOrders: 156,
    weekRevenue: 16842.0,
    monthOrders: 624,
    monthRevenue: 67368.0,
  };
}

export function getRevenueDashboard(): RevenueDashboard {
  return {
    grossRevenue: 67368.0,
    netRevenue: 65200.0,
    vatCollected: 4368.0,
    refundAmount: 214.0,
    discountAmount: 1954.0,
    averageOrderValue: 107.96,
    revenueByDay: [
      { date: '2026-08-18', revenue: 4280 },
      { date: '2026-08-19', revenue: 5350 },
      { date: '2026-08-20', revenue: 6420 },
      { date: '2026-08-21', revenue: 3210 },
      { date: '2026-08-22', revenue: 7490 },
      { date: '2026-08-23', revenue: 8560 },
      { date: '2026-08-24', revenue: 2630 },
    ],
    revenueByPaymentMethod: [
      { method: 'promptpay', count: 420, total: 45360 },
      { method: 'card', count: 204, total: 22008 },
    ],
  };
}

export function getCustomerAnalytics(): CustomerAnalytics {
  return {
    totalCustomers: 1248,
    activeCustomers: 892,
    newCustomersThisMonth: 156,
    averageOrdersPerCustomer: 2.4,
    averageCustomerLifetimeValue: 856.0,
    returningCustomerRate: 34.2,
    topCustomers: [
      { customerId: 'cust-001', email: 'kaem@example.com', totalOrders: 12, totalSpend: 1284 },
      { customerId: 'cust-002', email: 'somchai@example.com', totalOrders: 3, totalSpend: 321 },
    ],
  };
}

export function getProductAnalytics(): ProductAnalytics {
  return {
    topProducts: [
      { productId: 'prod-001', name: 'Steam Wallet ฿100', totalSold: 245, totalRevenue: 26215 },
      { productId: 'prod-002', name: 'Steam Wallet ฿500', totalSold: 89, totalRevenue: 47615 },
      { productId: 'prod-003', name: 'Netflix ฿350', totalSold: 67, totalRevenue: 23450 },
    ],
    categoryPerformance: [
      { categoryId: 'cat-001', name: 'เกม', orderCount: 320, revenue: 34240 },
      { categoryId: 'cat-002', name: 'สตรีมมิ่ง', orderCount: 180, revenue: 19260 },
      { categoryId: 'cat-003', name: 'ช็อปปิ้ง', orderCount: 124, revenue: 13268 },
    ],
  };
}
