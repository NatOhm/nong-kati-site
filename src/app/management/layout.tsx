'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  ADMIN_SESSION_EXPIRED_EVENT,
  adminSessionTtlMs,
  ensureFreshAdminSession,
  hasAdminSession,
} from '@/lib/adminSession';

const PUBLIC_MANAGEMENT_ROUTES = ['/management/login'];

/** How often the tab checks session freshness while a session exists. */
const REFRESH_TICK_MS = 60 * 1000;

export default function ManagementLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const isPublic = PUBLIC_MANAGEMENT_ROUTES.some((r) => pathname.startsWith(r));

  const redirectToLogin = useCallback(() => {
    setIsAuthenticated(false);
    router.push('/management/login');
  }, [router]);

  useEffect(() => {
    if (isPublic) {
      setIsAuthenticated(true);
      return;
    }

    // No session marker → not logged in (the HttpOnly cookies, if any stale
    // leftovers, die on the next auth call).
    if (!hasAdminSession()) {
      redirectToLogin();
      return;
    }

    // Session exists → refresh if the expiry hint is stale, then admit. A
    // dead refresh triggers the expiry event below, which redirects.
    void ensureFreshAdminSession().then((ok) => {
      if (ok || hasAdminSession()) {
        setIsAuthenticated(true);
      }
    });
  }, [isPublic, redirectToLogin]);

  // Proactive refresh: while the tab is open and a session exists, refresh
  // when the expiry hint is near/past.
  useEffect(() => {
    if (isPublic) return;

    const tick = setInterval(() => {
      if (hasAdminSession() && adminSessionTtlMs() <= 0) {
        void ensureFreshAdminSession();
      }
    }, REFRESH_TICK_MS);

    return () => clearInterval(tick);
  }, [isPublic]);

  // Any adminFetch whose refresh failed broadcasts this event → redirect.
  useEffect(() => {
    if (isPublic) return;
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, redirectToLogin);
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, redirectToLogin);
  }, [isPublic, redirectToLogin]);

  // Loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-peach-500 border-t-transparent" />
          <p className="text-sm text-fg-placeholder">กำลังตรวจสอบ...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isPublic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <p className="text-sm text-fg-placeholder">กำลังพาไปหน้าเข้าสู่ระบบ...</p>
      </div>
    );
  }

  return <>{children}</>;
}
