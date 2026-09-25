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
  Tv,
  Gamepad2,
  Music,
  Scissors,
  X,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { HamsterFace } from '@/components/ui/ClayIcons';
import { useState, useEffect, useRef, useCallback, type MouseEventHandler } from 'react';

const NAV_ITEMS = [
  { icon: Home, href: '/', label: 'หน้าหลัก', color: 'text-fg-brand' },
  { icon: Grid3X3, href: '/search', label: 'สินค้าทั้งหมด', color: 'text-sapphire-400' },
  { icon: Tv, href: '/category/movie-series', label: 'ดูหนัง/ซีรีส์', color: 'text-coral-500' },
  { icon: Music, href: '/category/music', label: 'ดนตรี', color: 'text-pink-400' },
  { icon: Gamepad2, href: '/category/chinese-apps', label: 'แอปจีน', color: 'text-jade-500' },
  { icon: Scissors, href: '/category/editing', label: 'แอปตัดต่อ', color: 'text-purple-400' },
  { icon: ShoppingBag, href: '/orders/lookup', label: 'คำสั่งซื้อ', color: 'text-orange-400' },
  {
    icon: MessageCircle,
    href: '/orders/lookup',
    label: 'ติดตามคำสั่งซื้อ',
    color: 'text-teal-400',
  },
];

interface FacebookSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

function SidebarContent({ onClose }: { onClose?: (() => void) | undefined }) {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const visibleItems = showMore ? NAV_ITEMS : NAV_ITEMS.slice(0, 6);

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
        <nav className="space-y-1">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={linkClickHandler}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
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
                  <Icon
                    size={18}
                    className={isActive ? 'text-fg-brand' : item.color}
                    strokeWidth={1.5}
                  />
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* See more / See less */}
          <button
            onClick={() => setShowMore(!showMore)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-fg-muted transition-all duration-150 hover:bg-surface-sunken hover:text-fg"
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
