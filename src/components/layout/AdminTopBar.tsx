'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, Menu } from 'lucide-react';
import { cn } from '@/utils/cn';
import { type AdminRole } from '@/types/auth';

export interface AdminTopBarProps {
  staffName: string;
  staffRole: AdminRole;
  notificationCount?: number;
  breadcrumbs?: { label: string; href?: string }[];
  onSidebarToggle?: () => void;
  className?: string;
}

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  catalogue_manager: 'Catalogue Manager',
  order_manager: 'Order Manager',
  finance_viewer: 'Finance Viewer',
  support_agent: 'Support Agent',
  marketing_manager: 'Marketing Manager',
};

/**
 * 05-components.md §1.9 — Admin Top Bar.
 * Shows breadcrumbs, notifications, user info, and logout.
 */
export function AdminTopBar({
  staffName,
  staffRole,
  notificationCount = 0,
  breadcrumbs,
  onSidebarToggle,
  className,
}: AdminTopBarProps): React.JSX.Element {
  return (
    <header
      className={cn(
        'flex h-14 items-center justify-between border-b border-ink-700 bg-ink-900 px-4 md:px-6',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        {/* Mobile sidebar toggle */}
        <button
          onClick={onSidebarToggle}
          className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-200 md:hidden"
          aria-label="เปิดเมนู"
        >
          <Menu size={20} strokeWidth={1.5} />
        </button>

        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumbs" className="hidden md:block">
            <ol className="flex items-center gap-1 text-sm">
              {breadcrumbs.map((crumb, idx) => (
                <li key={idx} className="flex items-center gap-1">
                  {idx > 0 && <span className="text-ink-500">/</span>}
                  {crumb.href ? (
                    <a href={crumb.href} className="text-ink-400 hover:text-amber-300">
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="text-ink-200">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button
          className="relative rounded p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-200"
          aria-label={`การแจ้งเตือน (${notificationCount})`}
        >
          <Bell size={18} strokeWidth={1.5} />
          {notificationCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-crimson-500 text-[10px] font-bold text-white">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </button>

        {/* User info */}
        <div className="hidden items-center gap-2 md:flex">
          <div className="text-right">
            <p className="text-sm font-medium text-ink-100">{staffName}</p>
            <p className="text-xs text-ink-400">{ROLE_LABELS[staffRole]}</p>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => {
            localStorage.removeItem('nk_admin_access_token');
            localStorage.removeItem('nk_admin_refresh_token');
            localStorage.removeItem('nk_admin_email');
            window.location.href = '/management/login';
          }}
          className="rounded p-1.5 text-ink-400 hover:bg-ink-800 hover:text-crimson-400"
          aria-label="ออกจากระบบ"
        >
          <LogOut size={18} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
