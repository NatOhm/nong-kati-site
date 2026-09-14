'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Grid3X3, Tag, ShoppingBag, MessageCircle,
  ChevronDown, ChevronUp, Clock, Bookmark, Users, Tv,
  Gamepad2, Music, Zap, Headphones, MonitorPlay,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useState } from 'react';

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

export function FacebookSidebar() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  const visibleItems = showMore ? NAV_ITEMS : NAV_ITEMS.slice(0, 6);

  return (
    <aside className="hidden lg:block w-[280px] shrink-0">
      <div className="fixed top-16 left-0 h-[calc(100vh-64px)] w-[280px] overflow-y-auto px-2 py-4 scrollbar-thin scrollbar-thumb-ink-700 z-40">
        {/* Navigation Items */}
        <nav className="space-y-1">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
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
    </aside>
  );
}
