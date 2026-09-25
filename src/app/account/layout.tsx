/**
 * Customer Dashboard Layout — 12-dashboard.md §4.
 * Shell with sidebar navigation for all /account/* routes.
 */

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Key,
  Download,
  FileText,
  Star,
  Heart,
  Headphones,
  Settings,
  LogOut,
  Wallet,
  Home,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useCustomerProfile } from '@/components/layout/CustomerProfileProvider';

const NAV_ITEMS: {
  label: string;
  href: string;
  /** Path prefix tested for the active highlight (defaults to href). */
  match?: string;
  icon: LucideIcon;
}[] = [
  { label: 'โปรไฟล์', href: '/account/dashboard', icon: LayoutDashboard },
  { label: 'กระเป๋าเงิน', href: '/account/wallet', icon: Wallet },
  { label: 'รายการโปรด', href: '/account/wishlist', icon: Heart },
  { label: 'คำสั่งซื้อ', href: '/account/orders', icon: ShoppingBag },
  { label: 'โค้ดที่ซื้อ', href: '/account/codes', icon: Key },
  { label: 'ใบเสร็จ', href: '/account/downloads', icon: Download },
  { label: 'ใบกำกับภาษี', href: '/account/invoices', icon: FileText },
  { label: 'รีวิวของฉัน', href: '/account/reviews', icon: Star },
  { label: 'สนับสนุน', href: '/account/support', icon: Headphones },
  { label: 'ตั้งค่า', href: '/account/settings', icon: Settings },
];

/**
 * Customer auth guard driven by the shared profile context (single /me fetch
 * for the whole layout — pages consume the same data, no duplicate requests).
 * Guests browsing any /account/* page (except login/register) are redirected
 * to login with a ?next= param so they land back where they started.
 */
function AccountLayoutInner({
  children,
  isPublicPage,
}: {
  children: React.ReactNode;
  isPublicPage: boolean;
}): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const { state, reload } = useCustomerProfile();

  useEffect(() => {
    if (state === 'guest' && !isPublicPage) {
      router.replace(`/account/login?next=${encodeURIComponent(pathname ?? '/account/dashboard')}`);
    }
  }, [state, router, pathname, isPublicPage]);

  const handleLogout = async (): Promise<void> => {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    // Clear the shared profile so a same-tab re-login refetches fresh data.
    await reload();
    router.replace('/');
    router.refresh();
  };

  // Auth pages (login, register, magic-link) render without sidebar or
  // guard — but still meet the landmark spec: a skip link as the first
  // focusable element and a single <main id="main-content"> target
  // (children provide the page heading).
  if (isPublicPage) {
    return (
      <>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-peach-700 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:shadow-clay"
        >
          ข้ามไปยังเนื้อหาหลัก
        </a>
        <main id="main-content">{children}</main>
      </>
    );
  }

  // Private pages: block render until the session check resolves so a guest
  // never sees dashboard content flash (and crawlers/no-JS get nothing private).
  if (state !== 'authed') {
    // Even the transient loading state owns the main landmark so the
    // "exactly one main per page" invariant holds in every branch.
    return (
      <main id="main-content" className="flex min-h-[60vh] items-center justify-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-peach-200 border-t-peach-500"
          role="status"
          aria-label="กำลังตรวจสอบการเข้าสู่ระบบ"
        />
      </main>
    );
  }

  return (
    <>
      {/* Skip link — first focusable element (same spec as the storefront). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-peach-700 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:shadow-clay"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Sidebar */}
          <aside className="w-full shrink-0 md:w-56">
            <nav className="sticky top-4">
              <ul className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const isActive = pathname?.startsWith(item.match ?? item.href);
                  const Icon = item.icon;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-peach-100 text-peach-800'
                            : 'text-fg-muted hover:bg-surface hover:text-fg',
                        )}
                      >
                        <Icon size={16} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 border-t border-line-subtle pt-4">
                {/* Client ask: explicit back-to-storefront button on the profile. */}
                <Link
                  href="/"
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg"
                >
                  <Home size={16} />
                  กลับหน้าแรก
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void handleLogout();
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-fg-placeholder transition-colors hover:bg-surface hover:text-coral-600"
                >
                  <LogOut size={16} />
                  ออกจากระบบ
                </button>
              </div>
            </nav>
          </aside>

          {/* Main Content */}
          <main id="main-content" className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

// Pages that should NOT show the sidebar (auth pages). magic-link is public
// too: it is the passwordless sign-in surface and consumes ?token= links
// opened straight from email (guests must never be redirected away from it).
const PUBLIC_ACCOUNT_ROUTES = ['/account/login', '/account/register', '/account/magic-link'];

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_ACCOUNT_ROUTES.some((r) => pathname?.startsWith(r));

  // The provider lives in the ROOT layout (one /me for the whole app —
  // storefront chrome and account pages share it); this layout only consumes it.
  return <AccountLayoutInner isPublicPage={isPublicPage}>{children}</AccountLayoutInner>;
}
