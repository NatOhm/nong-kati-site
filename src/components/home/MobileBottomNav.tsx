'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, ShoppingCart, User } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useCart } from '@/hooks/useCart';

const NAV_ITEMS = [
  { icon: Home, href: '/', label: 'หน้าหลัก' },
  { icon: Search, href: '/search', label: 'ค้นหา' },
  { icon: ShoppingCart, href: '/checkout', label: 'ตะกร้า' },
  { icon: User, href: '/account/login', label: 'บัญชี' },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { itemCount } = useCart();

  return (
    <nav className="bg-surface-base/95 fixed bottom-0 left-0 right-0 z-50 border-t border-line-subtle backdrop-blur-md lg:hidden">
      <div className="flex items-center justify-around px-2 py-1">
        {NAV_ITEMS.map((item) => {
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
                isActive ? 'text-fg-brand' : 'text-fg-placeholder hover:text-clay-800',
              )}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
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
