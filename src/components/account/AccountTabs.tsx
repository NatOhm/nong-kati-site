'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/utils/cn';

/**
 * AccountTabs — the profile page's section tabs (รายการโปรด / คำสั่งซื้อ).
 * The old สินค้าทั้งหมด/แนะนำ store tabs were removed (client ask): shopping
 * belongs on the storefront, not inside the profile.
 * Clay pill tabs: the active tab gets the brand surface + spring squish.
 */

export interface AccountTab {
  label: string;
  href: string;
  /** Path tested against the current pathname for the active state. */
  match: { path: string };
}

export const ACCOUNT_TABS: AccountTab[] = [
  { label: 'รายการโปรด', href: '/account/wishlist', match: { path: '/account/wishlist' } },
  { label: 'คำสั่งซื้อ', href: '/account/orders', match: { path: '/account/orders' } },
];

/** Tabs render inline — no useSearchParams, so no Suspense wrapper needed. */
export function AccountTabs({ className }: { className?: string | undefined }): React.JSX.Element {
  return <AccountTabsInner className={className} />;
}

function AccountTabsInner({ className }: { className?: string | undefined }): React.JSX.Element {
  const pathname = usePathname();

  return (
    <div
      role="tablist"
      aria-label="ส่วนต่างๆ ของโปรไฟล์"
      className={cn(
        'flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {ACCOUNT_TABS.map((tab) => {
        const isActive = tab.match.path === pathname;
        return (
          <Link
            key={tab.label}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              'clay-btn shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-interactive ease-spring hover:scale-[1.03] active:scale-[0.96]',
              isActive
                ? 'bg-surface-brand text-fg-inverse shadow-clay-brand'
                : 'bg-surface text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
