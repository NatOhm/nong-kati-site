'use client';

import { useEffect, useState } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopBar } from './AdminTopBar';
import { adminFetch } from '@/lib/adminSession';
import type { AdminRole } from '@/types/auth';

export interface AdminShellProps {
  children: React.ReactNode;
  staffName: string;
  staffRole: AdminRole;
  notificationCount?: number;
  breadcrumbs?: { label: string; href?: string }[];
  className?: string;
}

/**
 * 05-components.md §1.7 — Admin Shell.
 * Wraps admin pages with sidebar + top bar.
 */
export function AdminShell({
  children,
  staffName: staffNameProp,
  staffRole: staffRoleProp,
  notificationCount = 0,
  breadcrumbs,
  className,
}: AdminShellProps): React.JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Pages may pass static props; the signed-in admin's real identity (from
  // the DB via /me) wins once loaded. Keeps role-gated sidebar/nav accurate
  // for limited accounts without every page fetching its own profile.
  const [profile, setProfile] = useState<{ fullName: string; role: AdminRole } | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/v1/auth/admin/me')
      .then(async (r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.role) {
          setProfile({ fullName: data.fullName ?? data.email, role: data.role as AdminRole });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const staffName = profile?.fullName ?? staffNameProp;
  const staffRole = profile?.role ?? staffRoleProp;

  return (
    <div className="nk-admin-theme flex h-screen overflow-hidden bg-surface-base">
      {/* Sidebar */}
      <AdminSidebar
        role={staffRole}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <AdminTopBar
          staffName={staffName}
          staffRole={staffRole}
          notificationCount={notificationCount}
          breadcrumbs={breadcrumbs ?? []}
          onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Page content */}
        <main className={cn('flex-1 overflow-y-auto p-6', className)}>{children}</main>
      </div>
    </div>
  );
}

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
