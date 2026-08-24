'use client';

import { useState } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopBar } from './AdminTopBar';
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
  staffName,
  staffRole,
  notificationCount = 0,
  breadcrumbs,
  className,
}: AdminShellProps): React.JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950">
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
        <main className={cn('flex-1 overflow-y-auto p-6', className)}>
          {children}
        </main>
      </div>
    </div>
  );
}

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
