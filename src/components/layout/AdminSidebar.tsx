'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Tags,
  Hash,
  ShoppingCart,
  Ticket,
  LifeBuoy,
  Users,
  BarChart3,
  Settings,
  Shield,
  FileText,
  Wallet,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Home,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { type AdminRole } from '@/types/auth';
import { roleHasPermission } from '@/lib/rbac';

export interface AdminSidebarProps {
  role: AdminRole;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<Record<string, unknown>>;
  permission: Parameters<typeof roleHasPermission>[1];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'แดชบอร์ด',
    href: '/management/dashboard',
    icon: LayoutDashboard,
    permission: 'products:read',
  },
  { label: 'สินค้า', href: '/management/products', icon: Package, permission: 'products:read' },
  { label: 'หมวดหมู่', href: '/management/categories', icon: Tags, permission: 'categories:read' },
  { label: 'แท็ก', href: '/management/tags', icon: Hash, permission: 'products:read' },
  {
    label: 'คลังสินค้า',
    href: '/management/inventory',
    icon: Warehouse,
    permission: 'inventory:read',
  },
  {
    label: 'คำสั่งซื้อ',
    href: '/management/orders',
    icon: ShoppingCart,
    permission: 'orders:read',
  },
  {
    label: 'คูปองส่วนลด',
    href: '/management/coupons',
    icon: Ticket,
    permission: 'coupons:read',
  },
  { label: 'ลูกค้า', href: '/management/customers', icon: Users, permission: 'customers:read' },
  { label: 'ประวัติเติมเงิน', href: '/management/topups', icon: Wallet, permission: 'topups:read' },
  { label: 'ตั๋วสนับสนุน', href: '/management/tickets', icon: LifeBuoy, permission: 'tickets:read' },
  { label: 'รายงาน', href: '/management/reports', icon: BarChart3, permission: 'reports:read' },
  {
    label: 'ยอดซื้อรายคน',
    href: '/management/reports/customer-sales',
    icon: BarChart3,
    permission: 'reports:read',
  },
  {
    label: 'สินค้าค้างสต๊อก',
    href: '/management/reports/slow-stock',
    icon: BarChart3,
    permission: 'reports:read',
  },
  { label: 'พนักงาน', href: '/management/staff', icon: Shield, permission: 'staff:read' },
  { label: 'Audit Log', href: '/management/audit', icon: FileText, permission: 'audit:read' },
  { label: 'ตั้งค่า', href: '/management/settings', icon: Settings, permission: 'settings:read' },
];

// Simple Warehouse icon replacement (lucide-react may not have it)
function Warehouse({ size = 20, strokeWidth = 1.5 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z" />
      <path d="M6 18h12" />
      <path d="M6 14h12" />
      <rect x="6" y="10" width="12" height="12" />
    </svg>
  );
}

/**
 * 05-components.md §1.8 — Admin Sidebar.
 * Role-aware navigation — shows only items the role has permission for.
 */
export function AdminSidebar({
  role,
  collapsed,
  onToggle,
  className,
}: AdminSidebarProps): React.JSX.Element {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter((item) => roleHasPermission(role, item.permission));

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-line-subtle bg-surface-base transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
        className,
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-line-subtle px-4">
        {!collapsed && (
          <Link href="/management/dashboard" className="text-lg font-bold text-fg-brand">
            Nong-Kati
          </Link>
        )}
      </div>

      {/* Client ask: explicit back-to-storefront button above the admin nav. */}
      <div className="px-2 pt-3">
        <Link
          href="/"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg',
            collapsed && 'justify-center px-2',
          )}
          title={collapsed ? 'กลับหน้าแรก' : undefined}
        >
          <Home size={20} strokeWidth={1.5} />
          {!collapsed && <span>กลับหน้าแรก</span>}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {visibleItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-surface-brand-subtle text-fg-brand'
                      : 'text-fg-muted hover:bg-surface hover:text-fg',
                    collapsed && 'justify-center px-2',
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={20} strokeWidth={1.5} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-line-subtle p-2">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-md p-2 text-fg-placeholder hover:bg-surface hover:text-fg"
          aria-label={collapsed ? 'ขยาย sidebar' : 'ย่อ sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </aside>
  );
}
