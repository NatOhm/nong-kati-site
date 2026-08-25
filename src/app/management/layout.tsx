'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const PUBLIC_MANAGEMENT_ROUTES = ['/management/login'];

export default function ManagementLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Skip auth check for login page
    if (PUBLIC_MANAGEMENT_ROUTES.some((r) => pathname.startsWith(r))) {
      setIsAuthenticated(true);
      return;
    }

    // Check for admin token
    const token = localStorage.getItem('nk_admin_access_token');
    if (!token) {
      router.push('/management/login');
      return;
    }

    // Token exists — consider authenticated (mock mode)
    // In production, verify token expiry here
    setIsAuthenticated(true);
  }, [pathname, router]);

  // Loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          <p className="text-sm text-ink-400">กำลังตรวจสอบ...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
