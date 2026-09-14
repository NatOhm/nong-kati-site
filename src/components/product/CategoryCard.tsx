'use client';

import Link from 'next/link';
import { cn } from '@/utils/cn';
import {
  Tv, Film, Music, Headphones, Monitor, Gamepad2,
  Scissors, MonitorPlay, Globe, PlayCircle, Clapperboard, Smartphone,
} from 'lucide-react';

// Map category slugs to Lucide icons
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'hbo-max': <Clapperboard size={28} />,
  'iqiyi': <Film size={28} />,
  'wetv': <Tv size={28} />,
  'youku': <PlayCircle size={28} />,
  'prime-video': <Monitor size={28} />,
  'oned': <MonitorPlay size={28} />,
  'monomax': <Film size={28} />,
  'bilibili': <Music size={28} />,
  'spotify': <Headphones size={28} />,
  'youtube-premium': <PlayCircle size={28} />,
  'microsoft-365': <Monitor size={28} />,
  'capcut': <Scissors size={28} />,
  'netflix': <Tv size={28} />,
  'streaming': <Tv size={28} />,
  'games': <Gamepad2 size={28} />,
  'gaming': <Gamepad2 size={28} />,
  'music': <Music size={28} />,
  'mobile-games': <Smartphone size={28} />,
  'pc-games': <Monitor size={28} />,
  'console': <Gamepad2 size={28} />,
  'video': <Film size={28} />,
  'shopping': <Globe size={28} />,
  'app-stores': <Smartphone size={28} />,
};

const DEFAULT_ICON = <Globe size={28} />;

export interface CategoryCardProps {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  productCount?: number;
  className?: string;
}

/**
 * 05-components.md §3.2 — Category Grid Card.
 * Glass card with icon, name, and optional product count.
 * Links to /category/[slug] — per 03-information-architecture.md §4.
 */
export function CategoryCard({
  name,
  slug,
  productCount,
  className,
}: CategoryCardProps): React.JSX.Element {
  const IconComponent = CATEGORY_ICONS[slug] || DEFAULT_ICON;

  return (
    <Link
      href={`/category/${slug}`}
      className={cn(
        'group flex flex-col items-center justify-center gap-3 rounded-lg border border-ink-700 bg-ink-850 p-6 transition-all duration-fast ease-out-quart cursor-pointer',
        'hover:border-amber-700/50 hover:bg-ink-800 hover:shadow-brand-glow',
        className,
      )}
      aria-label={`หมวดหมู่ ${name}`}
    >
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-900/30 text-amber-400 transition-transform duration-fast ease-out-quart group-hover:scale-110">
        {IconComponent}
      </div>

      {/* Name */}
      <h3 className="text-sm font-semibold text-ink-100 transition-colors group-hover:text-amber-300">
        {name}
      </h3>

      {/* Product count */}
      {productCount !== undefined && (
        <span className="text-xs text-ink-400">
          {productCount} สินค้า
        </span>
      )}
    </Link>
  );
}
