/**
 * Customer Dashboard Layout — 12-dashboard.md §4.
 * Shell with sidebar navigation for all /account/* routes.
 */

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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

  // Mobile: the sidebar is a 12-row list; leaving it open pushed every page's
  // own content below the fold, so a phone saw the account menu stacked on top
  // of the page (client report: "หน้าซ้อนกัน" at ดูประวัติคำสั่งซื้อ).
  const [navOpen, setNavOpen] = useState(false);

  // ใบกำกับภาษี is hidden while the store has it switched off (owner cannot
  // issue them yet) — a nav row to an empty page is worse than no row.
  const [taxInvoiceEnabled, setTaxInvoiceEnabled] = useState(true);

  useEffect(() => {
    if (state === 'guest' && !isPublicPage) {
      router.replace(`/account/login?next=${encodeURIComponent(pathname ?? '/account/dashboard')}`);
    }
  }, [state, router, pathname, isPublicPage]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/settings/tax-invoice', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ enabled?: boolean }>) : null))
      .then((d) => {
        if (!cancelled && d && typeof d.enabled === 'boolean') setTaxInvoiceEnabled(d.enabled);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Navigating away must not leave the menu covering the next page.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const navItems = taxInvoiceEnabled
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.href !== '/account/invoices');

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
        {/* focus-visible (not focus): touch/programmatic focus must not pop
            the pill out; keyboard Tab still reveals it, fixed so it is on
            screen at any scroll depth. */}
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-peach-700 focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-white focus-visible:shadow-clay"
        >
          ข้ามไปยังเนื้อหาหลัก
        </a>
        {/* tabIndex={-1}: fragment navigation from the skip link must move
            focus to the landmark (SPA jumps don't do it on their own). */}
        <main id="main-content" tabIndex={-1} className="outline-none">
          {children}
        </main>
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
      {/* Skip link — first focusable element (same spec as the storefront).
          focus-visible keeps touch/restored focus from popping it out. */}
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-peach-700 focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-white focus-visible:shadow-clay"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>
      {/* pb-24 on phones: the sitewide fixed taskbar is 56px tall and sits on
          top of whatever scrolls under it (last orders/codes were unreadable). */}
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 lg:pb-8">
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Sidebar */}
          <aside className="w-full shrink-0 md:w-56">
            <button
              type="button"
              onClick={() => setNavOpen((open) => !open)}
              aria-expanded={navOpen}
              aria-controls="account-nav"
              className="mb-2 flex w-full items-center justify-between rounded-md border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-fg-secondary md:hidden"
            >
              <span className="flex items-center gap-2">
                <LayoutDashboard size={16} /> เมนูบัญชี
              </span>
              <span aria-hidden>{navOpen ? '▲' : '▼'}</span>
            </button>
            <nav
              id="account-nav"
              className={cn('sticky top-4', navOpen ? 'block' : 'hidden md:block')}
            >
              <ul className="space-y-1">
                {navItems.map((item) => {
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
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-fg-placeholder transition-colors hover:bg-surface hover:text-fg-error"
                >
                  <LogOut size={16} />
                  ออกจากระบบ
                </button>
              </div>
            </nav>
          </aside>

          {/* Main Content — focusable skip-link target (same spec as above) */}
          <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
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
