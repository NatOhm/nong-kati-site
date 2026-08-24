'use client';

import Link from 'next/link';
import { cn } from '@/utils/cn';

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
  icon,
  productCount,
  className,
}: CategoryCardProps): React.JSX.Element {
  return (
    <Link
      href={`/category/${slug}`}
      className={cn(
        'group flex flex-col items-center justify-center gap-3 rounded-lg border border-ink-700 bg-ink-850 p-6 transition-all duration-fast ease-out-quart',
        'hover:border-amber-700/50 hover:bg-ink-800 hover:shadow-brand-glow',
        className,
      )}
      aria-label={`หมวดหมู่ ${name}`}
    >
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-900/30 text-3xl transition-transform duration-fast ease-out-quart group-hover:scale-110">
        {icon || '🎮'}
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
