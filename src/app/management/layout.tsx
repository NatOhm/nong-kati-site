'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  ADMIN_SESSION_EXPIRED_EVENT,
  accessTokenTtlMs,
  ensureFreshAdminToken,
  getAdminRefreshToken,
  getAdminToken,
  installSessionScopeGuard,
} from '@/lib/adminSession';

const PUBLIC_MANAGEMENT_ROUTES = ['/management/login'];

/** How often the tab checks token freshness while a session exists. */
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

    // No tokens at all → not logged in.
    if (!getAdminToken() && !getAdminRefreshToken()) {
      redirectToLogin();
      return;
    }

    // Tokens exist → refresh if stale/expired, then admit. A dead refresh
    // triggers the expiry event below, which redirects.
    void ensureFreshAdminToken().then((token) => {
      if (token || getAdminRefreshToken()) {
        setIsAuthenticated(true);
      }
    });
  }, [isPublic, redirectToLogin]);

  // Proactive refresh: while the tab is open and a session exists, refresh
  // shortly before the access JWT expires so admin calls never see a 401.
  useEffect(() => {
    if (isPublic) return;

    const tick = setInterval(() => {
      const token = getAdminToken();
      // Only bother when a session exists and the token is stale or near expiry.
      if (getAdminRefreshToken() && (!token || accessTokenTtlMs(token) <= 0)) {
        void ensureFreshAdminToken();
      }
    }, REFRESH_TICK_MS);

    return () => clearInterval(tick);
  }, [isPublic]);

  // Any adminFetch whose refresh failed broadcasts this event → redirect.
  useEffect(() => {
    if (isPublic) return;
    const onExpired = () => redirectToLogin();
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, onExpired);
  }, [isPublic, redirectToLogin]);

  // Un-remembered sessions end with the browser: the guard clears the
  // tokens on pagehide (tab close). Remembered sessions persist.
  useEffect(() => {
    installSessionScopeGuard();
  }, []);

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
