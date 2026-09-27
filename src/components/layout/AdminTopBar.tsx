'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, Menu, Store } from 'lucide-react';
import { clearAdminSession, setAdminRemembered } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import { type AdminRole } from '@/types/auth';
import { ThemeToggle } from './ThemeToggle';

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
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  /**
   * Logout (production review, Medium): the old handler fired the revocation
   * fetch fire-and-forget and navigated immediately — a throttled/dropped
   * request left the stolen-or-copied refresh token server-valid while the
   * UI claimed success. Now the revocation is AWAITED (bounded) before any
   * local cleanup/navigation, with a keepalive fallback for unload races.
   */
  const handleLogout = useCallback(async (): Promise<void> => {
    setLoggingOut(true);
    const refreshToken = localStorage.getItem('nk_admin_refresh_token');
    if (refreshToken) {
      try {
        await Promise.race([
          fetch('/api/v1/auth/admin/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
            keepalive: true,
          }),
          // Bounded: never trap the admin on a hung request. On timeout the
          // best effort below still clears local state; the server-side
          // session expiry (and the revocation attempt queued via keepalive)
          // bounds the exposure.
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      } catch {
        // Revocation is idempotent server-side; if it truly failed the
        // session still expires server-side. Never block logout on it.
      }
    }
    clearAdminSession();
    setAdminRemembered(false);
    localStorage.removeItem('nk_admin_email');
    router.push('/management/login');
  }, [router]);

  return (
    <header
      className={cn(
        'flex h-14 items-center justify-between border-b border-line-subtle bg-surface-base px-4 md:px-6',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        {/* Mobile sidebar toggle */}
        <button
          onClick={onSidebarToggle}
          className="rounded p-1 text-fg-placeholder hover:bg-surface hover:text-fg md:hidden"
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
                  {idx > 0 && <span className="text-clay-400">/</span>}
                  {crumb.href ? (
                    <a href={crumb.href} className="text-fg-placeholder hover:text-fg-brand">
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="text-fg-secondary">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Client ask: quick jump back to the storefront. */}
        <Link
          href="/"
          className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-fg"
          aria-label="กลับหน้าร้าน"
          title="กลับหน้าร้าน"
        >
          <Store size={18} strokeWidth={1.5} />
        </Link>

        {/* Light/dark toggle — admin follows the sitewide theme */}
        <ThemeToggle />

        {/* Notifications */}
        <button
          className="relative rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-fg"
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
            <p className="text-sm font-medium text-fg">{staffName}</p>
            <p className="text-xs text-fg-placeholder">{ROLE_LABELS[staffRole]}</p>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded p-1.5 text-fg-placeholder hover:bg-surface hover:text-fg-error disabled:opacity-50"
          aria-label={loggingOut ? 'กำลังออกจากระบบ' : 'ออกจากระบบ'}
        >
          <LogOut size={18} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
