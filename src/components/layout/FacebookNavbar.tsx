'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, MessageCircle, Menu } from 'lucide-react';
import { cn } from '@/utils/cn';
import { AnchoredPopover } from '@/components/ui/AnchoredPopover';
import { CartIcon } from '@/components/cart/CartIcon';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { NotificationsDropdown } from './NotificationsDropdown';
import { ThemeToggle } from './ThemeToggle';
import { MotionToggle } from './MotionToggle';
import { ProfileMenu } from './ProfileMenu';
import { useCustomerSession } from './useCustomerSession';
import { AcornIcon, HamsterFace } from '@/components/ui/ClayIcons';
import { useCart } from '@/hooks/useCart';
import { useComboboxKeyboard } from '@/hooks/useComboboxKeyboard';

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
  { href: '/recommended', label: 'สินค้าแนะนำ' },
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
  /* a11y gate (duplicate-ID): listbox id is per-instance (useId). */
  const suggestListId = useId();
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  /* Anchor for the portaled suggestion list (see AnchoredPopover). */
  const searchAnchorRef = useRef<HTMLFormElement>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  /* Close the suggestion list. Wired into the popover's outside-click/Escape
     handling AND the combobox keyboard, so both dismissal paths reset it. */
  const closeSuggestions = useCallback(() => setSuggestions([]), []);

  const goToProduct = useCallback((slug: string) => {
    window.location.href = `/product/${slug}`;
  }, []);

  /* Per-option ids for aria-activedescendant. Scoped to this instance's
     useId, so the navbar box and the /search box never collide even though
     /search renders both DOM trees. */
  const searchOptionIds = suggestions.map((_, i) => `${suggestListId}-opt-${i}`);

  // Arrow keys + Enter. This box previously accepted only Escape and the
  // mouse, so there was no keyboard path to a suggestion at all.
  const {
    activeIndex: searchActiveIndex,
    activeDescendantId: searchActiveDescendantId,
    onKeyDown: onSearchKeyDown,
  } = useComboboxKeyboard({
    optionIds: searchOptionIds,
    onSelect: (i) => goToProduct(suggestions[i]?.slug ?? ''),
    onCommit: () => {
      if (searchQuery.trim()) {
        window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
      }
    },
    onClose: closeSuggestions,
    resetKey: searchQuery,
  });

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
        {/* overflow-hidden is the reflow safety net (WCAG 1.4.10 audit): the
            justify-between row must never push the document wider than the
            viewport — the widest cluster still fits from lg up. */}
        <div className="mx-auto flex h-14 items-center justify-between overflow-hidden px-4 md:h-16 md:px-6">
          {/* Left: Logo + Search */}
          <div className="flex min-w-0 items-center gap-3">
            {/* Mobile menu button - opens sidebar drawer.
                Audit #8: ≥44×44 hit area (icon stays 22px). */}
            <button
              onClick={onMenuToggle}
              className="clay-btn transition-smart flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-fg-muted duration-interactive ease-ease-out hover:-translate-y-0.5 hover:text-fg-brand active:translate-y-0 active:scale-95 active:shadow-clay-press xl:hidden"
              aria-label="เปิดเมนู"
            >
              <Menu size={22} />
            </button>

            {/* Logo — clay hamster mark + text wordmark (audit #7: the mark
                alone built no brand recall; the name must be readable
                above the fold on desktop AND mobile). */}
            <Link
              href="/"
              aria-label="Nong-Kati หน้าหลัก"
              className="group flex min-h-[44px] shrink-0 items-center gap-2"
            >
              <span className="block rounded-full shadow-clay-sm transition-transform duration-interactive ease-spring group-hover:scale-110 group-active:scale-95">
                <HamsterFace size={40} />
              </span>
              <span className="font-display text-base font-bold leading-none text-fg-brand-strong sm:text-lg">
                Nong-Kati
              </span>
            </Link>

            {/* Search bar — suggestions slide down Google-style as you type.
                Hidden on /search itself, where the page-level field replaces
                it (audit #9: one search control per viewport). */}
            <form
              onSubmit={handleSearch}
              ref={searchAnchorRef}
              className={cn(
                'relative hidden min-w-0 md:block',
                pathname?.startsWith('/search') && 'md:hidden',
              )}
            >
              <div
                className={cn(
                  'shadow-inset-sm group/search transition-smart relative flex min-w-0 items-center gap-2 rounded-full border bg-surface-elevated px-3 py-2 duration-interactive ease-ease-out',
                  searchFocused
                    ? 'border-peach-500 shadow-clay-sm'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    'transition-smart pointer-events-none absolute -top-7 right-3 origin-bottom duration-interactive ease-spring',
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
                  aria-controls={suggestListId}
                  aria-activedescendant={searchActiveDescendantId}
                  aria-autocomplete="list"
                  aria-label="ค้นหาสินค้า"
                  placeholder="ค้นหาสินค้า…"
                  autoComplete="off"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onKeyDown={onSearchKeyDown}
                  className="w-48 min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-muted lg:w-64 xl:w-56"
                />
              </div>

              {/* Suggestion dropdown — mousedown navigates before the input's
                  blur can hide the list. Portaled: as an `absolute top-full`
                  child of this row it lost 55/70px to the row's
                  overflow-hidden. */}
              <AnchoredPopover
                open={searchFocused && suggestions.length > 0}
                onClose={closeSuggestions}
                anchorRef={searchAnchorRef}
                align="start"
                role="listbox"
                ariaLabel="คำค้นแนะนำ"
                id={suggestListId}
                className="clay-card suggest-drop w-80 overflow-hidden rounded-2xl p-1.5"
              >
                  {suggestions.map((s, i) => (
                    <button
                      key={s.slug}
                      id={searchOptionIds[i]}
                      type="button"
                      role="option"
                      aria-selected={searchActiveIndex === i}
                      onMouseDown={() => {
                        window.location.href = `/product/${s.slug}`;
                      }}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-fast',
                        searchActiveIndex === i
                          ? 'bg-surface-sunken'
                          : 'hover:bg-surface-sunken',
                      )}
                    >
                      <Search size={14} className="shrink-0 text-fg-placeholder" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{s.name}</span>
                        <span className="block text-xs text-fg-muted">{s.categoryName}</span>
                      </span>
                    </button>
                  ))}
              </AnchoredPopover>
            </form>
          </div>

          {/* Center: Navigation text links — client ask (ข้อความแทนไอคอน).
              xl, not md: measured, the three clusters need ~1180px to coexist
              without squeezing. Below that a shrinking flex child crushed these
              Thai labels to one glyph per line (audit 2026-10-03). Between md
              and xl the drawer (hamburger above) carries the same links.
              shrink-0 + whitespace-nowrap keep every label on one line. */}
          <nav
            className="hidden shrink-0 items-center gap-1 xl:flex"
            aria-label="เมนูหลัก"
          >
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
                    'transition-smart relative shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold duration-interactive ease-ease-out',
                    isActive
                      ? // Same active treatment as the sidebar: the fixed peach-100
                        // needs dark overrides — text-fg-brand-strong flips light in
                        // dark mode and lands ~1.2:1 on the unchanged light chip.
                        'bg-peach-100 text-peach-800 dark:bg-peach-900/40 dark:text-peach-200'
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
              so the bar doesn't crowd. From md up everything fits. shrink-0 so
              the action cluster never gives up width to the nav (see above). */}
          <div className="flex shrink-0 items-center gap-1">
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
              className="clay-btn transition-smart hidden h-10 w-10 items-center justify-center rounded-full text-fg-muted duration-interactive ease-ease-out hover:-translate-y-0.5 hover:text-fg-brand active:translate-y-0 active:scale-95 active:shadow-clay-press md:flex"
            >
              <MessageCircle size={20} strokeWidth={1.5} />
            </Link>

            {/* Profile popover — identity, credit, top-up, settings, history,
                logout (client ask). Phones use the taskbar บัญชี button. */}
            <ProfileMenu />

            {/* Light/dark (lg+) — phone/tablet users switch via device/system
                theme. lg, not md: with the md navbar just opened (768–1023px)
                this cluster overflowed the bar and forced a horizontal scroll
                (WCAG 1.4.10 audit, 2026-09-28). */}
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>

            {/* Motion on/off (lg+) — overrides the OS reduce-motion setting;
                same 768–1023px squeeze as the theme toggle above. */}
            <div className="hidden lg:block">
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
