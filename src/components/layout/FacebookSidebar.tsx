'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Grid3X3,
  Tag,
  ShoppingBag,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Tv,
  Gamepad2,
  Music,
  Headphones,
  MonitorPlay,
  Zap,
  X,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { MascotImage } from '@/components/ui/MascotImage';
import { useState, useEffect, useRef, type MouseEventHandler } from 'react';

const NAV_ITEMS = [
  { icon: Home, href: '/', label: 'หน้าหลัก', color: 'text-fg-brand' },
  { icon: Grid3X3, href: '/search', label: 'สินค้าทั้งหมด', color: 'text-sapphire-400' },
  { icon: Tv, href: '/category/netflix', label: 'Netflix', color: 'text-coral-500' },
  { icon: Gamepad2, href: '/category/hbo-max', label: 'HBO Max', color: 'text-jade-500' },
  { icon: Music, href: '/category/spotify', label: 'Spotify', color: 'text-pink-400' },
  { icon: Tag, href: '/search', label: 'โปรโมชั่น', color: 'text-red-400' },
  { icon: ShoppingBag, href: '/orders/lookup', label: 'คำสั่งซื้อ', color: 'text-orange-400' },
  {
    icon: MessageCircle,
    href: '/orders/lookup',
    label: 'ติดตามคำสั่งซื้อ',
    color: 'text-teal-400',
  },
];

const SHORTCUTS = [
  { icon: MonitorPlay, label: 'HBO MAX', href: '/category/hbo-max', color: 'bg-purple-600' },
  { icon: Tv, label: 'Netflix', href: '/category/netflix', color: 'bg-red-600' },
  { icon: Headphones, label: 'Spotify', href: '/category/spotify', color: 'bg-green-600' },
  { icon: Zap, label: 'YouTube Premium', href: '/category/youtube-premium', color: 'bg-red-500' },
  { icon: Gamepad2, label: 'iQIYI', href: '/category/iqiyi', color: 'bg-blue-600' },
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
            <MascotImage
              size={40}
              className="bg-peach-200 shadow-[2px_3px_8px_rgba(124,45,18,0.25)]"
            />
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

        {/* Divider */}
        <div className="my-4 h-px bg-line" />

        {/* Shortcuts */}
        <div>
          <h3 className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-fg-placeholder">
            ทางลัดของคุณ
          </h3>
          <div className="space-y-1">
            {SHORTCUTS.map((shortcut) => {
              const Icon = shortcut.icon;
              return (
                <Link
                  key={shortcut.href}
                  href={shortcut.href}
                  onClick={linkClickHandler}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-secondary transition-all duration-150 hover:bg-surface-sunken hover:text-fg"
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      shortcut.color,
                    )}
                  >
                    <Icon size={18} className="text-white" strokeWidth={1.5} />
                  </div>
                  <span className="truncate">{shortcut.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer copyright */}
      <div className="border-t border-line-subtle px-4 py-3">
        <p className="text-xs text-fg-placeholder">© 2024 Nong-Kati Store</p>
      </div>
    </div>
  );
}

export function FacebookSidebar({
  isOpen = false,
  onClose,
}: FacebookSidebarProps): React.JSX.Element {
  return (
    <>
      {/* Desktop sidebar - scrollable within page flow */}
      <aside className="hidden w-[280px] shrink-0 lg:block">
        <div className="sticky top-16 z-40 h-[calc(100vh-64px)] w-[280px] overflow-y-auto border-r border-line-subtle bg-surface-base">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile drawer - slide from left */}
      {isOpen && (
        <>
          {/* Backdrop: warm clay-tinted scrim instead of harsh black */}
          <div
            className="drawer-backdrop fixed inset-0 z-50 bg-clay-900/55 lg:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer: squishy slide-in, rounded clay edge, themed scrollbar */}
          <div
            role="dialog"
            aria-label="เมนูนำทาง"
            className="drawer-panel drawer-scroll fixed left-0 top-0 z-50 h-full w-[300px] overflow-y-auto rounded-r-[28px] bg-surface-base shadow-[6px_0_24px_rgba(78,56,32,0.35)] lg:hidden"
          >
            <SidebarContent onClose={onClose} />
          </div>
        </>
      )}
    </>
  );
}
