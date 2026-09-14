'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Search, Grid3X3, ShoppingBag, User,
  Bell, MessageCircle, Menu, X, ChevronDown,
  Gamepad2, Tv, Music, Settings, LogOut,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { CartIcon } from '@/components/cart/CartIcon';
import { useCart } from '@/hooks/useCart';

interface FacebookNavbarProps {
  isAuthenticated?: boolean;
  customerName?: string;
}

const NAV_ITEMS = [
  { icon: Home, href: '/', label: 'หน้าหลัก' },
  { icon: Grid3X3, href: '/search', label: 'สินค้าทั้งหมด' },
  { icon: Gamepad2, href: '/category/streaming', label: 'สตรีมมิ่ง' },
  { icon: Tv, href: '/category/asian-streaming', label: 'เอเชีย' },
  { icon: Music, href: '/category/music', label: 'เพลง' },
];

export function FacebookNavbar({ isAuthenticated = false, customerName }: FacebookNavbarProps) {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-ink-700 bg-ink-900/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 items-center justify-between px-4 md:h-16 md:px-6">
        {/* Left: Logo + Search */}
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg p-2 text-ink-300 hover:bg-ink-800 hover:text-amber-300 md:hidden"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400">
              <span className="text-lg font-bold text-ink-900">NK</span>
            </div>
          </Link>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="hidden md:block">
            <div className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-2 transition-all',
              searchFocused
                ? 'border-amber-500 bg-ink-800'
                : 'border-ink-700 bg-ink-800'
            )}>
              <Search size={16} className="text-ink-400" />
              <input
                type="text"
                placeholder="ค้นหาสินค้า..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="w-48 bg-transparent text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none lg:w-64"
              />
            </div>
          </form>
        </div>

        {/* Center: Navigation icons */}
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
                    ? 'text-amber-400'
                    : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200'
                )}
                title={item.label}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute bottom-0 left-1/2 h-[3px] w-12 -translate-x-1/2 rounded-full bg-amber-400" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {/* Cart */}
          <CartIcon count={itemCount} />

          {/* Notifications */}
          <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-300 hover:bg-ink-800 hover:text-amber-300">
            <Bell size={20} />
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              3
            </span>
          </button>

          {/* Messenger */}
          <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-300 hover:bg-ink-800 hover:text-amber-300">
            <MessageCircle size={20} />
          </button>

          {/* Profile */}
          <Link
            href={isAuthenticated ? '/account/dashboard' : '/account/login'}
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-300 hover:bg-ink-800 hover:text-amber-300"
          >
            <User size={20} />
          </Link>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="border-t border-ink-700 bg-ink-900 px-4 py-3 md:hidden">
          {/* Mobile search */}
          <form onSubmit={handleSearch} className="mb-3">
            <div className="flex items-center gap-2 rounded-full border border-ink-700 bg-ink-800 px-3 py-2">
              <Search size={16} className="text-ink-400" />
              <input
                type="text"
                placeholder="ค้นหาสินค้า..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none"
              />
            </div>
          </form>

          {/* Mobile nav links */}
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-amber-900/30 text-amber-300'
                      : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
