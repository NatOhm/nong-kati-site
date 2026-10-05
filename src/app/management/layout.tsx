'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  ADMIN_SESSION_EXPIRED_EVENT,
  adminFetch,
  adminSessionTtlMs,
  ensureFreshAdminSession,
  hasAdminSession,
} from '@/lib/adminSession';

const PUBLIC_MANAGEMENT_ROUTES = ['/management/login'];

/**
 * Where an admin with a pending password change belongs (client report
 * 2026-10-05). The flag already empties the JWT perms, so every API call
 * 403s — but the sidebar is role-gated and keeps advertising every module,
 * so the operator was left on a full menu and a wall of permission errors
 * with no way to guess the real cause.
 */
const FORCED_PASSWORD_CHANGE_PATH = '/management/settings?tab=security';

/**
 * The one page a forced-change admin may stay on — it hosts the change
 * form. Tab switches are client state, not URL changes, so exempting the
 * whole pathname cannot loop with the redirect above.
 */
const FORCED_CHANGE_EXEMPT_PATH = '/management/settings';

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

  // Forced password change: server-enforced perms already block everything,
  // so make the redirect the FIRST thing they meet instead of a 403 page.
  // /auth/admin/me is auth-only (no permission gate) precisely so it can be
  // answered to an admin who holds no permissions at all.
  useEffect(() => {
    if (!isAuthenticated || isPublic) return;
    if (pathname === FORCED_CHANGE_EXEMPT_PATH) return;

    let cancelled = false;
    void adminFetch('/api/v1/auth/admin/me', { cache: 'no-store' })
      .then(async (r): Promise<{ mustChangePassword?: boolean } | null> =>
        r.ok ? await r.json() : null,
      )
      .then((data) => {
        if (cancelled || !data?.mustChangePassword) return;
        // replace, not push: Back must not walk into the page that bounced
        // them, which would just bounce again.
        router.replace(FORCED_PASSWORD_CHANGE_PATH);
      })
      .catch(() => {
        // A failed check must never be the reason an admin is locked out —
        // the per-route 403 remains the backstop.
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isPublic, pathname, router]);

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
