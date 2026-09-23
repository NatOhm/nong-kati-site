'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, ShoppingCart } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useCart } from '@/hooks/useCart';
import { useCustomerSession } from '@/components/layout/useCustomerSession';
import { hasAdminSession } from '@/lib/adminSession';
import { AcornIcon, SeedIcon, WheelIcon, PawIcon } from '@/components/ui/ClayIcons';

const NAV_ITEMS = [
  { icon: AcornIcon, href: '/', label: 'หน้าหลัก', clay: true },
  { icon: Search, href: '/search', label: 'ค้นหา', clay: false },
  { icon: ShoppingCart, href: '/checkout', label: 'ตะกร้า', clay: false },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const sessionState = useCustomerSession();
  const isAuthenticated = sessionState === 'authed';
  // Admin session present → the บัญชี button routes into the admin panel
  // (client ask). The management layout handles expiry/redirect itself.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => setIsAdmin(hasAdminSession()), []);

  // Sitewide taskbar except the admin panel (which has its own chrome).
  if (pathname?.startsWith('/management')) return null;

  const accountItem = {
    icon: PawIcon,
    href: isAdmin ? '/management/dashboard' : isAuthenticated ? '/account/dashboard' : '/account/login',
    label: isAdmin ? 'แอดมิน' : isAuthenticated ? 'บัญชี' : 'เข้าสู่ระบบ',
    clay: true as const,
  };
  const allItems = [...NAV_ITEMS, accountItem];

  return (
    <nav className="bg-surface-base/95 fixed bottom-0 left-0 right-0 z-50 border-t border-line-subtle backdrop-blur-md lg:hidden">
      <div className="flex items-center justify-around px-2 py-1">
        {allItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
          const Icon = item.icon;
          const isCart = item.label === 'ตะกร้า';

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-w-[60px] flex-col items-center gap-0.5 rounded-lg px-3 py-2 transition-colors',
                isActive ? 'text-fg-brand' : 'text-fg-placeholder hover:text-fg-secondary',
              )}
            >
              <div
                className={cn(
                  'relative transition-transform duration-interactive ease-spring',
                  isActive && 'scale-110',
                )}
              >
                {item.clay ? (
                  <Icon size={24} />
                ) : (
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
                )}
                {isCart && itemCount > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {itemCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
