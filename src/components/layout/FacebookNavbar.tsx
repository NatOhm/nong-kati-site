'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, MessageCircle, Menu } from 'lucide-react';
import { cn } from '@/utils/cn';
import { CartIcon } from '@/components/cart/CartIcon';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { NotificationsDropdown } from './NotificationsDropdown';
import { ThemeToggle } from './ThemeToggle';
import { MotionToggle } from './MotionToggle';
import { ProfileMenu } from './ProfileMenu';
import { useCustomerSession } from './useCustomerSession';
import { AcornIcon, HamsterFace } from '@/components/ui/ClayIcons';
import { useCart } from '@/hooks/useCart';

interface FacebookNavbarProps {
  onMenuToggle?: () => void;
}

interface SearchSuggestion {
  name: string;
  slug: string;
  categoryName: string;
}

// Client ask: ข้อความแทนไอคอน — 4 ลิงก์หลัก (หน้าแรกอยู่ที่โลโก้)
const NAV_ITEMS = [
  { href: '/search', label: 'สินค้าทั้งหมด' },
  { href: '/search?sort=featured', label: 'แนะนำ' },
  { href: '/account/wishlist', label: 'รายการโปรด' },
  { href: '/account/orders', label: 'คำสั่งซื้อ' },
];

export function FacebookNavbar({ onMenuToggle }: FacebookNavbarProps) {
  const pathname = usePathname();
  // Real session state — the support desk and profile links depend on it
  const sessionState = useCustomerSession();
  const isAuthenticated = sessionState === 'authed';
  const { cart, updateQuantity, removeItem, itemCount } = useCart();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  // Google-style suggestions: debounced live lookups as you type.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/v1/search/suggest?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((d: { suggestions?: SearchSuggestion[] }) => setSuggestions(d.suggestions ?? []))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

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

            {/* Logo — the Nong-Kati clay hamster */}
            <Link
              href="/"
              aria-label="Nong-Kati หน้าหลัก"
              className="group flex items-center gap-2"
            >
              <span className="block rounded-full shadow-clay-sm transition-transform duration-interactive ease-spring group-hover:scale-110 group-active:scale-95">
                <HamsterFace size={40} />
              </span>
            </Link>

            {/* Search bar — suggestions slide down Google-style as you type.
                Hidden on /search itself, where the page-level field replaces
                it (audit #9: one search control per viewport). */}
            <form
              onSubmit={handleSearch}
              className={cn('relative hidden md:block', pathname?.startsWith('/search') && 'md:hidden')}
            >
              <div
                className={cn(
                  'shadow-inset-sm group/search relative flex items-center gap-2 rounded-full border bg-surface-elevated px-3 py-2 transition-all duration-interactive ease-ease-out',
                  searchFocused
                    ? 'border-peach-500 shadow-clay-sm'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute -top-7 right-3 origin-bottom transition-all duration-interactive ease-spring',
                    searchFocused
                      ? 'translate-y-0 scale-100 opacity-100'
                      : 'translate-y-4 scale-75 opacity-0',
                  )}
                >
                  <HamsterFace size={36} className="drop-shadow-[0_3px_4px_rgba(147,107,73,0.3)]" />
                </div>
                <Search size={16} className="text-fg-placeholder" />
                <input
                  type="text"
                  role="combobox"
                  aria-expanded={searchFocused && suggestions.length > 0}
                  aria-controls="nav-search-suggest"
                  aria-label="ค้นหาสินค้า"
                  placeholder="ค้นหาสินค้า…"
                  autoComplete="off"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setSuggestions([]);
                  }}
                  className="placeholder:text-clay-9000 w-48 bg-transparent text-sm text-fg focus:outline-none lg:w-64"
                />
              </div>

              {/* Suggestion dropdown — mousedown navigates before the input's
                  blur can hide the list */}
              {searchFocused && suggestions.length > 0 && (
                <div
                  id="nav-search-suggest"
                  role="listbox"
                  aria-label="คำค้นแนะนำ"
                  className="clay-card suggest-drop absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl p-1.5"
                >
                  {suggestions.map((s) => (
                    <button
                      key={s.slug}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onMouseDown={() => {
                        window.location.href = `/product/${s.slug}`;
                      }}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-fast hover:bg-surface-sunken"
                    >
                      <Search size={14} className="shrink-0 text-fg-placeholder" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{s.name}</span>
                        <span className="block text-xs text-fg-muted">{s.categoryName}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </form>
          </div>

          {/* Center: Navigation text links — client ask (ข้อความแทนไอคอน) */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="เมนูหลัก">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === '/search'
                  ? pathname === '/search' || pathname?.startsWith('/category/')
                  : pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-interactive ease-ease-out',
                    isActive
                      ? 'bg-peach-100 text-fg-brand-strong'
                      : 'text-fg-secondary hover:-translate-y-0.5 hover:bg-surface-sunken hover:text-fg active:translate-y-0 active:scale-95',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right: Actions — on phones only the cart stays here; account,
              notifications and support live in the sidebar + bottom taskbar,
              so the bar doesn't crowd. From md up everything fits. */}
          <div className="flex items-center gap-1">
            {/* Cart — opens cart drawer */}
            <CartIcon count={itemCount} onClick={() => setCartOpen(true)} />

            {/* Notifications — popover (md+) */}
            <div className="hidden md:block">
              <NotificationsDropdown />
            </div>

            {/* Messenger — support contact (md+). The support desk lives inside
                the logged-in area; guests are sent to login first and land back
                on the support form after signing in. */}
            <Link
              href={
                isAuthenticated ? '/account/support' : '/account/login?next=%2Faccount%2Fsupport'
              }
              aria-label="ฝ่ายสนับสนุน"
              title="ฝ่ายสนับสนุน"
              className="clay-btn hidden h-10 w-10 items-center justify-center rounded-full text-fg-muted transition-all duration-interactive ease-ease-out hover:-translate-y-0.5 hover:text-fg-brand active:translate-y-0 active:scale-95 active:shadow-clay-press md:flex"
            >
              <MessageCircle size={20} strokeWidth={1.5} />
            </Link>

            {/* Profile popover — identity, credit, top-up, settings, history,
                logout (client ask). Phones use the taskbar บัญชี button. */}
            <ProfileMenu />

            {/* Light/dark (md+) — phone users switch via device/system theme */}
            <div className="hidden md:block">
              <ThemeToggle />
            </div>

            {/* Motion on/off (md+) — overrides the OS reduce-motion setting */}
            <div className="hidden md:block">
              <MotionToggle />
            </div>
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
