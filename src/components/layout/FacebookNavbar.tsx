'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Search,
  Grid3X3,
  User,
  MessageCircle,
  Menu,
  Gamepad2,
  Tv,
  Music,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { CartIcon } from '@/components/cart/CartIcon';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { NotificationsDropdown } from './NotificationsDropdown';
import { useCart } from '@/hooks/useCart';

interface FacebookNavbarProps {
  isAuthenticated?: boolean;
  customerName?: string;
  onMenuToggle?: () => void;
}

const NAV_ITEMS = [
  { icon: Home, href: '/', label: 'หน้าหลัก' },
  { icon: Grid3X3, href: '/search', label: 'สินค้าทั้งหมด' },
  { icon: Gamepad2, href: '/category/streaming', label: 'สตรีมมิ่ง' },
  { icon: Tv, href: '/category/asian-streaming', label: 'เอเชีย' },
  { icon: Music, href: '/category/music', label: 'เพลง' },
];

export function FacebookNavbar({
  isAuthenticated = false,
  customerName,
  onMenuToggle,
}: FacebookNavbarProps) {
  const pathname = usePathname();
  const { cart, updateQuantity, removeItem, itemCount } = useCart();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cartOpen, setCartOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-clay-200 bg-clay-50/95 shadow-clay-xs backdrop-blur-md">
        <div className="mx-auto flex h-14 items-center justify-between px-4 md:h-16 md:px-6">
          {/* Left: Logo + Search */}
          <div className="flex items-center gap-3">
            {/* Mobile menu button - opens sidebar drawer */}
            <button
              onClick={onMenuToggle}
              className="cursor-pointer rounded-lg p-2 text-clay-600 hover:bg-clay-200 hover:text-peach-700 lg:hidden"
              aria-label="เปิดเมนู"
            >
              <Menu size={22} />
            </button>

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-peach-400 shadow-clay-sm">
                <span className="text-lg font-bold text-peach-800">NK</span>
              </div>
            </Link>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="hidden md:block">
              <div
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-2 transition-colors',
                  searchFocused ? 'border-peach-500 bg-white' : 'border-clay-300 bg-white',
                )}
              >
                <Search size={16} className="text-clay-500" />
                <input
                  type="text"
                  aria-label="ค้นหาสินค้า"
                  placeholder="ค้นหาสินค้า…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  className="placeholder:text-clay-9000 w-48 bg-transparent text-sm text-clay-900 focus:outline-none lg:w-64"
                />
              </div>
            </form>
          </div>

          {/* Center: Navigation icons - desktop only */}
          <div className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'group relative flex h-12 w-24 items-center justify-center rounded-lg transition-colors',
                    isActive
                      ? 'text-peach-600'
                      : 'text-clay-500 hover:bg-clay-200 hover:text-clay-800',
                  )}
                  title={item.label}
                  aria-label={item.label}
                >
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
                  {isActive && (
                    <div className="absolute bottom-0 left-1/2 h-[3px] w-12 -translate-x-1/2 rounded-full bg-peach-500" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            {/* Cart — opens cart drawer */}
            <CartIcon count={itemCount} onClick={() => setCartOpen(true)} />

            {/* Notifications — popover */}
            <NotificationsDropdown />

            {/* Messenger — support contact */}
            <Link
              href="/account/support"
              aria-label="ฝ่ายสนับสนุน"
              title="ฝ่ายสนับสนุน"
              className="flex h-10 w-10 items-center justify-center rounded-full text-clay-600 transition-colors hover:bg-clay-200 hover:text-peach-700"
            >
              <MessageCircle size={20} strokeWidth={1.5} />
            </Link>

            {/* Profile */}
            <Link
              href={isAuthenticated ? '/account/dashboard' : '/account/login'}
              aria-label={isAuthenticated ? 'บัญชีของฉัน' : 'เข้าสู่ระบบ'}
              title={isAuthenticated ? 'บัญชีของฉัน' : 'เข้าสู่ระบบ'}
              className="flex h-10 w-10 items-center justify-center rounded-full text-clay-600 hover:bg-clay-200 hover:text-peach-700"
            >
              <User size={20} />
            </Link>
          </div>
        </div>
      </nav>

      {/* Cart drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart?.items ?? []}
        onUpdateQty={(variantId, qty) => updateQuantity(variantId, qty)}
        onRemoveItem={(variantId) => removeItem(variantId)}
      />
    </>
  );
}
