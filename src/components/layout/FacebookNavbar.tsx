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
import { ThemeToggle } from './ThemeToggle';
import { useCustomerSession } from './useCustomerSession';
import { AcornIcon } from '@/components/ui/ClayIcons';
import { MascotImage } from '@/components/ui/MascotImage';
import { useCart } from '@/hooks/useCart';

interface FacebookNavbarProps {
  onMenuToggle?: () => void;
}

const NAV_ITEMS = [
  { icon: AcornIcon, href: '/', label: 'หน้าหลัก' },
  { icon: Grid3X3, href: '/search', label: 'สินค้าทั้งหมด' },
  { icon: Gamepad2, href: '/category/streaming', label: 'สตรีมมิ่ง' },
  { icon: Tv, href: '/category/asian-streaming', label: 'เอเชีย' },
  { icon: Music, href: '/category/music', label: 'เพลง' },
];

export function FacebookNavbar({ onMenuToggle }: FacebookNavbarProps) {
  const pathname = usePathname();
  // Real session state — the support desk and profile links depend on it
  const sessionState = useCustomerSession();
  const isAuthenticated = sessionState === 'authed';
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
      {/* Slightly darker than the page base — anchors the chrome without going dark */}
      <nav className="sticky top-0 z-50 border-b border-line bg-surface-nav shadow-clay-sm backdrop-blur-md">
        <div className="mx-auto flex h-14 items-center justify-between px-4 md:h-16 md:px-6">
          {/* Left: Logo + Search */}
          <div className="flex items-center gap-3">
            {/* Mobile menu button - opens sidebar drawer */}
            <button
              onClick={onMenuToggle}
              className="clay-btn cursor-pointer rounded-lg p-2 text-fg-muted transition-all duration-interactive ease-ease-out hover:-translate-y-0.5 hover:text-fg-brand active:translate-y-0 active:scale-95 active:shadow-clay-press lg:hidden"
              aria-label="เปิดเมนู"
            >
              <Menu size={22} />
            </button>

            {/* Logo — the Nong-Kati hamster mascot */}
            <Link
              href="/"
              aria-label="Nong-Kati หน้าหลัก"
              className="group flex items-center gap-2"
            >
              <MascotImage
                size={40}
                className="shadow-clay-sm transition-transform duration-interactive ease-spring group-hover:scale-110 group-active:scale-95"
              />
            </Link>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="hidden md:block">
              {' '}
              <div
                className={cn(
                  'shadow-inset-sm flex items-center gap-2 rounded-full border bg-surface-elevated px-3 py-2 transition-all duration-interactive ease-ease-out',
                  searchFocused
                    ? 'border-peach-500 shadow-clay-sm'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <Search size={16} className="text-fg-placeholder" />
                <input
                  type="text"
                  aria-label="ค้นหาสินค้า"
                  placeholder="ค้นหาสินค้า…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  className="placeholder:text-clay-9000 w-48 bg-transparent text-sm text-fg focus:outline-none lg:w-64"
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
                    'group relative flex h-12 w-24 items-center justify-center rounded-xl transition-all duration-interactive ease-ease-out',
                    isActive
                      ? 'text-fg-brand'
                      : 'text-fg-placeholder hover:-translate-y-0.5 hover:bg-surface-sunken hover:text-fg-secondary active:translate-y-0 active:scale-95',
                  )}
                  title={item.label}
                  aria-label={item.label}
                >
                  <Icon
                    size={item.icon === AcornIcon ? 24 : 22}
                    strokeWidth={isActive ? 2.5 : 1.5}
                  />
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

            {/* Messenger — support contact. The support desk lives inside the
                logged-in area; guests are sent to login first and land back
                on the support form after signing in. */}
            <Link
              href={
                isAuthenticated ? '/account/support' : '/account/login?next=%2Faccount%2Fsupport'
              }
              aria-label="ฝ่ายสนับสนุน"
              title="ฝ่ายสนับสนุน"
              className="clay-btn flex h-10 w-10 items-center justify-center rounded-full text-fg-muted transition-all duration-interactive ease-ease-out hover:-translate-y-0.5 hover:text-fg-brand active:translate-y-0 active:scale-95 active:shadow-clay-press"
            >
              <MessageCircle size={20} strokeWidth={1.5} />
            </Link>

            {/* Profile */}
            <Link
              href={isAuthenticated ? '/account/dashboard' : '/account/login'}
              aria-label={isAuthenticated ? 'บัญชีของฉัน' : 'เข้าสู่ระบบ'}
              title={isAuthenticated ? 'บัญชีของฉัน' : 'เข้าสู่ระบบ'}
              className="clay-btn flex h-10 w-10 items-center justify-center rounded-full text-fg-muted transition-all duration-interactive ease-ease-out hover:-translate-y-0.5 hover:text-fg-brand active:translate-y-0 active:scale-95 active:shadow-clay-press"
            >
              <User size={20} />
            </Link>

            {/* Light/dark */}
            <ThemeToggle />
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
