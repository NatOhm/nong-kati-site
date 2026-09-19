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
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import {
  useCustomerSession,
  type CustomerSessionState,
} from '@/components/layout/useCustomerSession';

const NAV_ITEMS: {
  label: string;
  href: string;
  /** Path prefix tested for the active highlight (defaults to href). */
  match?: string;
  icon: LucideIcon;
}[] = [
  { label: 'โปรไฟล์', href: '/account/dashboard', icon: LayoutDashboard },
  { label: 'ภาพรวม', href: '/account/overview', icon: LayoutDashboard },
  { label: 'กระเป๋าเงิน', href: '/account/wallet', icon: Wallet },
  {
    label: 'สินค้าทั้งหมด',
    href: '/account/dashboard?view=all',
    match: '/account/dashboard',
    icon: ShoppingBag,
  },
  {
    label: 'แนะนำ',
    href: '/account/dashboard?view=featured',
    match: '/account/dashboard',
    icon: Star,
  },
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
 * Customer auth guard: checks the real session cookie via /api/v1/auth/me.
 * Guests browsing any /account/* page (except login/register) are redirected
 * to login with a ?next= param so they land back where they started.
 */
function useRequireCustomer(isPublicPage: boolean): CustomerSessionState {
  const router = useRouter();
  const pathname = usePathname();
  const state = useCustomerSession();

  useEffect(() => {
    if (state === 'guest' && !isPublicPage) {
      router.replace(`/account/login?next=${encodeURIComponent(pathname ?? '/account/dashboard')}`);
    }
  }, [state, router, pathname, isPublicPage]);

  return state;
}

// Pages that should NOT show the sidebar (auth pages)
const PUBLIC_ACCOUNT_ROUTES = ['/account/login', '/account/register'];

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const isPublicPage = PUBLIC_ACCOUNT_ROUTES.some((r) => pathname?.startsWith(r));
  const authState = useRequireCustomer(isPublicPage);

  const handleLogout = async (): Promise<void> => {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    router.replace('/');
    router.refresh();
  };

  // Auth pages (login, register) render without sidebar or guard
  if (isPublicPage) {
    return <>{children}</>;
  }

  // Private pages: block render until the session check resolves so a guest
  // never sees dashboard content flash (and crawlers/no-JS get nothing private).
  if (authState !== 'authed') {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        role="status"
        aria-label="กำลังตรวจสอบการเข้าสู่ระบบ"
      >
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-peach-200 border-t-peach-500" />
      </div>
    );
  }

  return (
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
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
