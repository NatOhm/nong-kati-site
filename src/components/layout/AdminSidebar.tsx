'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  X,
  Store,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { type AdminRole } from '@/types/auth';
import { roleHasPermission } from '@/lib/rbac';

export interface AdminSidebarProps {
  role: AdminRole;
  collapsed: boolean;
  onToggle: () => void;
  /** Mobile drawer open state (below md). The desktop rail ignores it. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
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
    // Review: must match the API gate — the dashboard endpoint requires
    // reports:read, so the menu used to show for catalogue_manager (who
    // cannot load it) and hide for finance/marketing (who can).
    permission: 'reports:read',
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
  {
    label: 'ตั๋วสนับสนุน',
    href: '/management/tickets',
    icon: LifeBuoy,
    permission: 'tickets:read',
  },
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
  {
    label: 'Reconciliation',
    href: '/management/reconciliation',
    icon: RotateCcw,
    permission: 'orders:read',
  },
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

/** Brand header shared by the desktop rail and the mobile drawer. */
function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex h-14 shrink-0 items-center border-b border-line-subtle px-4">
      {!collapsed && (
        <Link href="/management/dashboard" className="text-lg font-bold text-fg-brand">
          Nong-Kati
        </Link>
      )}
    </div>
  );
}

interface SidebarNavProps {
  role: AdminRole;
  collapsed: boolean;
  /** Present = mobile drawer context → clicking a link closes the drawer. */
  onNavigate?: () => void;
}

/** Role-aware nav list shared by both presentation modes. */
function SidebarNav({ role, collapsed, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => roleHasPermission(role, item.permission));

  return (
    <nav className="flex-1 overflow-y-auto py-4" aria-label="เมนูแอดมิน">
      <ul className="space-y-1 px-2">
        {visibleItems.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                {...(onNavigate ? { onClick: onNavigate } : {})}
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
  );
}

/** Back-to-storefront link shared by both presentation modes. */
function StorefrontLink({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="shrink-0 px-2 pt-3">
      <Link
        href="/"
        {...(onNavigate ? { onClick: onNavigate } : {})}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg',
          collapsed && 'justify-center px-2',
        )}
        title={collapsed ? 'กลับหน้าร้าน' : undefined}
      >
        <Store size={20} strokeWidth={1.5} />
        {!collapsed && <span>กลับหน้าร้าน</span>}
      </Link>
    </div>
  );
}

/** Collapse toggle — desktop rail only (the drawer has its own close button). */
function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="shrink-0 border-t border-line-subtle p-2">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-center rounded-md p-2 text-fg-placeholder hover:bg-surface hover:text-fg"
        aria-label={collapsed ? 'ขยาย sidebar' : 'ย่อ sidebar'}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </div>
  );
}

/**
 * 05-components.md §1.8 — Admin Sidebar.
 *
 * Two presentation modes of the same role-aware nav:
 *  - md+  : always-visible rail, collapsible to icons (desktop, as before).
 *  - < md : off-canvas drawer over a backdrop (visual audit 2026-09-28: the
 *           fixed 256px rail used to pin itself over a 390px phone, leaving
 *           the page content a ~134px sliver). Drawer closes on link tap,
 *           backdrop tap, or Escape, and returns focus to the opener — the
 *           same accessible-modal pattern as FacebookSidebar.
 */
export function AdminSidebar({
  role,
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
  className,
}: AdminSidebarProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  const prevOpenRef = useRef(mobileOpen);
  const shown = mobileOpen || closing;

  // Focus management + body scroll lock while the drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      openerRef.current?.focus?.();
    };
  }, [mobileOpen]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  // Play the exit animation when the drawer closes, then unmount.
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = mobileOpen;
    if (!wasOpen || mobileOpen) return;
    setClosing(true);
    const t = setTimeout(() => setClosing(false), 700);
    return () => clearTimeout(t);
  }, [mobileOpen]);

  useEffect(() => {
    if (mobileOpen) setClosing(false);
  }, [mobileOpen]);

  // Close automatically when navigating via a drawer link.
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (mobileOpen && prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      onCloseMobile();
    }
  }, [pathname, mobileOpen, onCloseMobile]);

  return (
    <>
      {/* md+ — the classic collapsible rail, unchanged */}
      <aside
        className={cn(
          'transition-smart hidden h-full flex-col border-r border-line-subtle bg-surface-base duration-200 md:flex',
          collapsed ? 'w-16' : 'w-64',
          className,
        )}
      >
        <SidebarBrand collapsed={collapsed} />
        <StorefrontLink collapsed={collapsed} />
        <SidebarNav role={role} collapsed={collapsed} />
        <CollapseToggle collapsed={collapsed} onToggle={onToggle} />
      </aside>

      {/* < md — off-canvas drawer (the hamburger in AdminTopBar opens it).
          Reuses the storefront's drawer animations (globals.css) so exit
          plays before unmount — the same motion language, no new keyframes. */}
      {shown && (
        <>
          <div
            className={cn(
              'fixed inset-0 z-40 bg-clay-950/50 backdrop-blur-sm md:hidden',
              closing ? 'drawer-backdrop-out' : 'drawer-backdrop',
            )}
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="เมนูแอดมิน"
            tabIndex={-1}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && e.animationName === 'drawer-slide-out') {
                setClosing(false);
              }
            }}
            className={cn(
              'fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-line-subtle bg-surface-base shadow-clay-lg outline-none md:hidden',
              closing ? 'drawer-panel-out' : 'drawer-panel',
            )}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line-subtle px-4">
              <span className="text-lg font-bold text-fg-brand">Nong-Kati</span>
              <button
                onClick={onCloseMobile}
                className="rounded p-2 text-fg-placeholder hover:bg-surface hover:text-fg"
                aria-label="ปิดเมนู"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <StorefrontLink collapsed={false} onNavigate={onCloseMobile} />
            <SidebarNav role={role} collapsed={false} onNavigate={onCloseMobile} />
            {/* Footer keeps the rail's bottom border height so both modes
                look identical; the collapse control is desktop-only. */}
            <div className="shrink-0 border-t border-line-subtle p-2" />
          </div>
        </>
      )}
    </>
  );
}
