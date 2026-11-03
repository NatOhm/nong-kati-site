'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Grid3X3,
  ShoppingBag,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Heart,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { HamsterFace } from '@/components/ui/ClayIcons';
import { CategoryIcon } from '@/components/product/CategoryIcon';
import { useState, useEffect, useRef, useCallback, type MouseEventHandler } from 'react';

interface NavItem {
  href: string;
  label: string;
  color: string;
  /** Static links ship their component; category links carry the DB icon name. */
  icon?: LucideIcon;
  iconName?: string | null;
}

const NAV_ITEMS: NavItem[] = [
  { icon: Home, href: '/', label: 'หน้าหลัก', color: 'text-fg-brand' },
  { icon: Grid3X3, href: '/search', label: 'สินค้าทั้งหมด', color: 'text-sapphire-400' },
  // Below xl the header text links are hidden (navbar width budget), so the
  // drawer has to carry them — otherwise these two pages are unreachable
  // on tablets and small laptops. Mirrors NAV_ITEMS in FacebookNavbar.tsx.
  { icon: Sparkles, href: '/recommended', label: 'สินค้าแนะนำ', color: 'text-peach-500' },
  { icon: Heart, href: '/account/wishlist', label: 'รายการโปรด', color: 'text-peach-600' },
  // Categories are NOT listed here: they are read from /api/v1/categories and
  // spliced in after รายการโปรด (see SidebarContent). They used to be four
  // hardcoded links — movie-series, music, chinese-apps, editing — slugs that
  // never existed, so every one 404'd and the drawer never followed the
  // catalogue (client report 2026-11-02: "3 ขีดไม่ซิงก์หมวดหมู่").
  { icon: ShoppingBag, href: '/orders/lookup', label: 'คำสั่งซื้อ', color: 'text-orange-400' },
  {
    icon: MessageCircle,
    href: '/orders/lookup',
    label: 'ติดตามคำสั่งซื้อ',
    color: 'text-teal-400',
  },
];

/** Root categories from GET /api/v1/categories (only what the drawer needs). */
interface SidebarCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
}

// One SUCCESSFUL fetch per browser session: the drawer remounts on every open,
// and the category tree changes when an admin edits it, not between taps.
// Failures are deliberately NOT cached — the drawer is remounted on each open,
// so a transient 500 retries itself the next time the menu is opened instead
// of leaving the menu category-less for the whole session (audit 2026-11-02).
let categoriesCache: SidebarCategory[] | null = null;

const CATEGORY_INSERT_AT = 4; // directly after รายการโปรด
const COLLAPSED_LIMIT = 10;
const SKELETON_ROWS = 3;

/** A nav row, or the placeholder that stands in for a category row while loading. */
type SidebarRow = NavItem | { skeleton: true };

interface FacebookSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

function SidebarContent({ onClose }: { onClose?: (() => void) | undefined }) {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  // null = not loaded yet (in flight or failed); [] = loaded, genuinely empty.
  const [categories, setCategories] = useState<SidebarCategory[] | null>(categoriesCache);
  const [failed, setFailed] = useState(false);

  // Load the real category list once per session. A failed request leaves the
  // cache untouched so the next open tries again — only a real answer is
  // remembered. (Caching the failure was the bug: one 500 hid every category
  // until a full page reload, with nothing on screen saying why.)
  useEffect(() => {
    // useState already seeded from the cache: nothing to do on a repeat open.
    if (categoriesCache !== null) return;
    let alive = true;
    fetch('/api/v1/categories')
      .then((r) => {
        if (!r.ok) throw new Error(`categories ${r.status}`);
        return r.json() as Promise<{ categories?: SidebarCategory[] }>;
      })
      .then((d) => {
        if (!alive) return;
        categoriesCache = d.categories ?? [];
        setCategories(categoriesCache);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const loading = categories === null && !failed;

  // Categories splice in where the hardcoded ones used to sit, so the drawer
  // order stays หน้าหลัก … รายการโปรด · categories … คำสั่งซื้อ. While they
  // are in flight the same slot holds placeholder rows, so a first open on a
  // slow phone never looks like a menu that lost its categories.
  const rows: SidebarRow[] = [
    ...NAV_ITEMS.slice(0, CATEGORY_INSERT_AT),
    ...(loading
      ? Array.from({ length: SKELETON_ROWS }, (): SidebarRow => ({ skeleton: true }))
      : (categories ?? []).map(
          (c): SidebarRow => ({
            // The listing page, not the category's tile page: a root category
            // renders sub-app tiles (grouped), and the client asked the drawer
            // to land on the product list with that category already selected
            // (2026-11-02). /search expands the whole subtree, exactly like
            // the chip row it opens onto.
            href: `/search?category=${encodeURIComponent(c.slug)}`,
            label: c.name,
            color: 'text-fg-brand',
            iconName: c.icon ?? null,
          }),
        )),
    ...NAV_ITEMS.slice(CATEGORY_INSERT_AT),
  ];
  // COLLAPSED_LIMIT keeps คำสั่งซื้อ visible on a phone even with several
  // root categories.
  const visibleRows = showMore ? rows : rows.slice(0, COLLAPSED_LIMIT);

  // Close drawer on navigation (mobile). Track the previous path so the
  // effect's mount-run is a no-op — otherwise the drawer closes itself the
  // instant it opens, because effects fire on mount too.
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (onClose && prevPath.current !== pathname) {
      prevPath.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  const linkClickHandler: MouseEventHandler<HTMLAnchorElement> = () => {
    if (onClose) onClose();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Mobile close button */}
      {onClose && (
        <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3 lg:hidden">
          <div className="flex items-center gap-3">
            <span className="block rounded-full shadow-[2px_3px_8px_rgba(124,45,18,0.25)]">
              <HamsterFace size={40} />
            </span>
            <span className="text-lg font-bold text-fg">Nong-Kati</span>
          </div>
          <button
            onClick={onClose}
            aria-label="ปิดเมนู"
            className="flex h-10 w-10 items-center justify-center rounded-full text-fg-muted transition-transform duration-150 hover:bg-surface-sunken active:scale-90"
          >
            <X size={22} />
          </button>
        </div>
      )}

      <div className="drawer-scroll flex-1 overflow-y-auto px-4 py-4">
        {/* Navigation Items */}
        <nav className="space-y-1" aria-busy={loading}>
          {loading && <span className="sr-only">กำลังโหลดหมวดหมู่</span>}
          {/* Failed: say so, keep the rest of the menu usable, and retry the
              next time the drawer opens (nothing was cached). */}
          {failed && (
            <p className="px-3 py-2 text-xs text-fg-placeholder">
              โหลดหมวดหมู่ไม่สำเร็จ — เปิดเมนูอีกครั้งเพื่อลองใหม่
            </p>
          )}
          {visibleRows.map((item, index) => {
            if ('skeleton' in item) {
              return (
                <div
                  key={`skeleton-${index}`}
                  aria-hidden="true"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                >
                  <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-sunken" />
                  <div className="h-3.5 w-24 animate-pulse rounded-full bg-surface-sunken" />
                </div>
              );
            }
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                // Two entries can share a href (คำสั่งซื้อ / ติดตามคำสั่งซื้อ).
                key={`${item.href}-${item.label}`}
                href={item.href}
                onClick={linkClickHandler}
                className={cn(
                  'transition-smart flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium duration-150',
                  isActive
                    ? 'bg-peach-100 text-peach-800 dark:bg-peach-900/40 dark:text-peach-200'
                    : 'text-fg-secondary hover:bg-surface-sunken hover:text-fg',
                )}
              >
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    isActive ? 'bg-peach-200' : 'bg-surface-sunken',
                  )}
                >
                  {Icon ? (
                    <Icon
                      size={18}
                      className={isActive ? 'text-fg-brand' : item.color}
                      strokeWidth={1.5}
                    />
                  ) : (
                    <CategoryIcon
                      name={item.iconName ?? null}
                      size={18}
                      className={isActive ? 'text-fg-brand' : item.color}
                    />
                  )}
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* See more / See less — only when something is actually hidden */}
          {rows.length > COLLAPSED_LIMIT && (
          <button
            onClick={() => setShowMore(!showMore)}
            className="transition-smart flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-fg-muted duration-150 hover:bg-surface-sunken hover:text-fg"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
              {showMore ? (
                <ChevronUp size={18} className="text-fg-placeholder" />
              ) : (
                <ChevronDown size={18} className="text-fg-placeholder" />
              )}
            </div>
            <span>{showMore ? 'แสดงน้อยลง' : 'ดูเพิ่มเติม'}</span>
          </button>
          )}
        </nav>
      </div>

      {/* Footer copyright */}
      <div className="border-t border-line-subtle px-4 py-3">
        <p className="text-xs text-fg-placeholder">© 2024 Nong-Kati Store</p>
      </div>
    </div>
  );
}

/**
 * Sidebar — desktop rail always visible, mobile drawer that slides in AND out
 * (550ms matching the site motion language). The drawer stays mounted while
 * closing so the exit animation can play, then unmounts on animationend.
 */
export function FacebookSidebar({
  isOpen = false,
  onClose,
}: FacebookSidebarProps): React.JSX.Element {
  // 'closing' keeps the drawer in the DOM through the slide-out animation.
  const [closing, setClosing] = useState(false);
  const prevOpenRef = useRef(isOpen);
  const shown = isOpen || closing;

  // Accessible-modal behavior (audit #3): focus lands on the dialog itself,
  // Tab is contained inside, Escape closes, background scroll is locked and
  // focus returns to the opener (the hamburger) on close.
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      openerRef.current?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Keep Tab cycling inside the drawer while it is open.
  const handleTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || active === panel) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Start the exit animation when isOpen flips true→false.
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = isOpen;
    if (!wasOpen || isOpen) return;
    setClosing(true);
    // Fallback: some embedded webviews suspend the CSS-animation clock, so
    // animationend never fires — unmount anyway after the animation budget.
    const t = setTimeout(() => setClosing(false), 650);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Re-opening during an exit cancels it.
  useEffect(() => {
    if (isOpen) setClosing(false);
  }, [isOpen]);

  const handleAnimationEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.animationName === 'drawer-slide-out') {
      setClosing(false);
    }
  };

  const close = () => onClose?.();

  return (
    <>
      {/* Client ask: "เอาด้านข้างออก เหลือไว้แค่ด้านบน" — the always-visible
          desktop rail is gone; the top navbar is the only nav on desktop.
          The mobile drawer stays (it IS the hamburger menu). */}
      {/* Mobile drawer - slide from left with matching slide-out */}
      {shown && (
        <>
          {/* Backdrop: warm clay-tinted scrim instead of harsh black.
              z-[60] keeps it above the sticky navbar (z-50). */}
          <div
            className={cn(
              'fixed inset-0 z-[60] bg-clay-900/55 lg:hidden',
              closing ? 'drawer-backdrop-out' : 'drawer-backdrop',
            )}
            onClick={close}
            aria-hidden="true"
          />
          {/* Drawer: squishy slide-in / slide-out, rounded clay edge, themed scrollbar.
              z-[70] paints the panel over the navbar icons, not beside them. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="เมนูนำทาง"
            ref={panelRef}
            tabIndex={-1}
            onKeyDown={handleTab}
            onAnimationEnd={handleAnimationEnd}
            className={cn(
              'drawer-scroll fixed left-0 top-0 z-[70] h-full w-[300px] overflow-y-auto rounded-r-[28px] bg-surface-base shadow-[6px_0_24px_rgba(78,56,32,0.35)] lg:hidden',
              closing ? 'drawer-panel-out' : 'drawer-panel',
            )}
          >
            <SidebarContent onClose={onClose} />
          </div>
        </>
      )}
    </>
  );
}
