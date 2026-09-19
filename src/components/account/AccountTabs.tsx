'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/utils/cn';

/**
 * AccountTabs — the profile page's section tabs (client ask: show
 * สินค้าทั้งหมด / แนะนำ / รายการโปรด / คำสั่งซื้อ as a proper profile page
 * with tabs instead of only sidebar links). Clay pill tabs: the active tab
 * gets the brand surface + spring squish, inactive ones stay quiet.
 * Active state uses pathname + ?sort= so สินค้าทั้งหมด and แนะนำ can share
 * the same destination route while staying distinct tabs.
 */

export interface AccountTab {
  label: string;
  href: string;
  /** Exact match against `pathname?sort=` — active test below. */
  match: { path: string; sort?: string | null };
}

export const ACCOUNT_TABS: AccountTab[] = [
  {
    label: 'สินค้าทั้งหมด',
    href: '/account/dashboard?view=all',
    match: { path: '/account/dashboard', sort: null },
  },
  {
    label: 'แนะนำ',
    href: '/account/dashboard?view=featured',
    match: { path: '/account/dashboard', sort: 'featured' },
  },
  { label: 'รายการโปรด', href: '/account/wishlist', match: { path: '/account/wishlist' } },
  { label: 'คำสั่งซื้อ', href: '/account/orders', match: { path: '/account/orders' } },
];

/** Suspense wrapper: useSearchParams must not run during static prerender. */
export function AccountTabs({ className }: { className?: string | undefined }): React.JSX.Element {
  return (
    <Suspense fallback={<div className="h-9" aria-hidden />}>
      <AccountTabsInner className={className} />
    </Suspense>
  );
}

function AccountTabsInner({ className }: { className?: string | undefined }): React.JSX.Element {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSort = searchParams.get('sort') ?? searchParams.get('view');
  const activeSortKey = activeSort === 'featured' ? 'featured' : null;

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
        const isActive = tab.match.path === pathname && (tab.match.sort ?? null) === activeSortKey;
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
