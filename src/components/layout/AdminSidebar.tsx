'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Package, Tags, ShoppingCart, Users, BarChart3,
  Settings, Shield, FileText, ChevronLeft, ChevronRight, LogOut,
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
  { label: 'แดชบอร์ด', href: '/management/dashboard', icon: LayoutDashboard, permission: 'products:read' },
  { label: 'สินค้า', href: '/management/products', icon: Package, permission: 'products:read' },
  { label: 'หมวดหมู่', href: '/management/categories', icon: Tags, permission: 'categories:read' },
  { label: 'คลังสินค้า', href: '/management/inventory', icon: Warehouse, permission: 'inventory:read' },
  { label: 'คำสั่งซื้อ', href: '/management/orders', icon: ShoppingCart, permission: 'orders:read' },
  { label: 'ลูกค้า', href: '/management/customers', icon: Users, permission: 'customers:read' },
  { label: 'รายงาน', href: '/management/reports', icon: BarChart3, permission: 'reports:read' },
  { label: 'พนักงาน', href: '/management/staff', icon: Shield, permission: 'staff:read' },
  { label: 'Audit Log', href: '/management/audit', icon: FileText, permission: 'audit:read' },
  { label: 'ตั้งค่า', href: '/management/settings', icon: Settings, permission: 'settings:read' },
];

// Simple Warehouse icon replacement (lucide-react may not have it)
function Warehouse({ size = 20, strokeWidth = 1.5 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
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

  const visibleItems = NAV_ITEMS.filter((item) =>
    roleHasPermission(role, item.permission),
  );

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-ink-700 bg-ink-900 transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
        className,
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-ink-700 px-4">
        {!collapsed && (
          <Link href="/management/dashboard" className="text-lg font-bold text-amber-300">
            Nong-Kati
          </Link>
        )}
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
                      ? 'bg-amber-900/30 text-amber-300'
                      : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
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
      <div className="border-t border-ink-700 p-2">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-md p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-200"
          aria-label={collapsed ? 'ขยาย sidebar' : 'ย่อ sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </aside>
  );
}
