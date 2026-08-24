/**
 * Customer Dashboard Layout — 12-dashboard.md §4.
 * Shell with sidebar navigation for all /account/* routes.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ShoppingBag, Key, Download, FileText,
  Star, Headphones, Settings, LogOut,
} from 'lucide-react';
import { cn } from '@/utils/cn';

const NAV_ITEMS = [
  { label: 'ภาพรวม', href: '/account/dashboard', icon: LayoutDashboard },
  { label: 'คำสั่งซื้อ', href: '/account/orders', icon: ShoppingBag },
  { label: 'โค้ดที่ซื้อ', href: '/account/codes', icon: Key },
  { label: 'ใบเสร็จ', href: '/account/downloads', icon: Download },
  { label: 'ใบกำกับภาษี', href: '/account/invoices', icon: FileText },
  { label: 'รีวิวของฉัน', href: '/account/reviews', icon: Star },
  { label: 'สนับสนุน', href: '/account/support', icon: Headphones },
  { label: 'ตั้งค่า', href: '/account/settings', icon: Settings },
];

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-6 md:flex-row">
        {/* Sidebar */}
        <aside className="w-full shrink-0 md:w-56">
          <nav className="sticky top-4">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname?.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-amber-900/30 text-amber-300'
                          : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
                      )}
                    >
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 border-t border-ink-700 pt-4">
              <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-ink-400 transition-colors hover:bg-ink-800 hover:text-crimson-400">
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
