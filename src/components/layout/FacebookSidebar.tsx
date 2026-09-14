'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Grid3X3, Tag, ShoppingBag, MessageCircle,
  ChevronDown, ChevronUp, Tv, Gamepad2, Music,
  Headphones, MonitorPlay, Zap, X,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useState, useEffect, type MouseEventHandler } from 'react';

const NAV_ITEMS = [
  { icon: Home, href: '/', label: 'หน้าหลัก', color: 'text-amber-400' },
  { icon: Grid3X3, href: '/search', label: 'สินค้าทั้งหมด', color: 'text-blue-400' },
  { icon: Tv, href: '/category/streaming', label: 'สตรีมมิ่ง', color: 'text-purple-400' },
  { icon: Gamepad2, href: '/category/games', label: 'เกม', color: 'text-green-400' },
  { icon: Music, href: '/category/music', label: 'เพลง', color: 'text-pink-400' },
  { icon: Tag, href: '/search?q=promo', label: 'โปรโมชั่น', color: 'text-red-400' },
  { icon: ShoppingBag, href: '/orders/lookup', label: 'คำสั่งซื้อ', color: 'text-orange-400' },
  { icon: MessageCircle, href: '/legal/privacy-policy', label: 'ติดต่อเรา', color: 'text-teal-400' },
];

const SHORTCUTS = [
  { icon: MonitorPlay, label: 'HBO MAX', href: '/category/hbo-max', color: 'bg-purple-600' },
  { icon: Tv, label: 'Netflix', href: '/category/netflix', color: 'bg-red-600' },
  { icon: Headphones, label: 'Spotify', href: '/category/spotify', color: 'bg-green-600' },
  { icon: Zap, label: 'YouTube Premium', href: '/category/youtube', color: 'bg-red-500' },
  { icon: Gamepad2, label: 'Steam', href: '/category/games', color: 'bg-blue-600' },
];

interface FacebookSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

function SidebarContent({ onClose }: { onClose?: (() => void) | undefined }) {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const visibleItems = showMore ? NAV_ITEMS : NAV_ITEMS.slice(0, 6);

  // Close drawer on navigation (mobile)
  useEffect(() => {
    if (onClose) onClose();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkClickHandler: MouseEventHandler<HTMLAnchorElement> = () => {
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile close button */}
      {onClose && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700 lg:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400">
              <span className="text-lg font-bold text-ink-900">NK</span>
            </div>
            <span className="text-lg font-bold text-ink-100">Nong-Kati</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-300 hover:bg-ink-800"
          >
            <X size={22} />
          </button>
        </div>
      )}

      <div className="px-2 py-4">
        {/* Navigation Items */}
        <nav className="space-y-1">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={linkClickHandler}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-ink-800 text-amber-300'
                    : 'text-ink-200 hover:bg-ink-800/60 hover:text-ink-100'
                )}
              >
                <div className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full',
                  isActive ? 'bg-amber-900/40' : 'bg-ink-800'
                )}>
                  <Icon size={20} className={isActive ? 'text-amber-400' : item.color} strokeWidth={1.5} />
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* See more / See less */}
          <button
            onClick={() => setShowMore(!showMore)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-300 hover:bg-ink-800/60 hover:text-ink-100 transition-all duration-150"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-800">
              {showMore ? (
                <ChevronUp size={20} className="text-ink-400" />
              ) : (
                <ChevronDown size={20} className="text-ink-400" />
              )}
            </div>
            <span>{showMore ? 'แสดงน้อยลง' : 'ดูเพิ่มเติม'}</span>
          </button>
        </nav>

        {/* Divider */}
        <div className="my-4 mx-3 h-px bg-ink-700" />

        {/* Shortcuts */}
        <div>
          <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-ink-500">
            ทางลัดของคุณ
          </h3>
          <div className="space-y-0.5">
            {SHORTCUTS.map((shortcut) => {
              const Icon = shortcut.icon;
              return (
                <Link
                  key={shortcut.href}
                  href={shortcut.href}
                  onClick={linkClickHandler}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-200 hover:bg-ink-800/60 hover:text-ink-100 transition-all duration-150"
                >
                  <div className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg',
                    shortcut.color
                  )}>
                    <Icon size={18} className="text-white" strokeWidth={1.5} />
                  </div>
                  <span>{shortcut.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

export function FacebookSidebar({ isOpen = false, onClose }: FacebookSidebarProps): React.JSX.Element {
  return (
    <>
      {/* Desktop sidebar - fixed position */}
      <aside className="hidden lg:block w-[280px] shrink-0">
        <div className="fixed top-16 left-0 h-[calc(100vh-64px)] w-[280px] overflow-y-auto z-40 bg-ink-900 border-r border-ink-700/50">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile drawer - slide from left */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-50 lg:hidden"
            onClick={onClose}
          />
          {/* Drawer */}
          <div className="fixed top-0 left-0 h-full w-[280px] bg-ink-900 z-50 lg:hidden overflow-y-auto shadow-2xl">
            <SidebarContent onClose={onClose} />
          </div>
        </>
      )}
    </>
  );
}
