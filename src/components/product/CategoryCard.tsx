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
 * 05-components.md §3.2 — Category Grid Card (clay tile).
 * Links to /category/[slug]. The client asked to drop the round icon bubble
 * ("เอาไอ้กลมๆออก") and show a plain number instead — the card now leads
 * with the product count.
 */
export function CategoryCard({
  name,
  slug,
  productCount,
  className,
}: CategoryCardProps): React.JSX.Element {
  return (
    <Link
      href={`/category/${slug}`}
      className={cn(
        'clay-card group flex flex-col items-center justify-center gap-3 rounded-xl p-6',
        'cursor-pointer transition-transform duration-fast ease-out-quart',
        'hover:-translate-y-0.5 active:scale-[0.98] active:shadow-clay-press',
        className,
      )}
      aria-label={`หมวดหมู่ ${name}`}
    >
      {/* Big plain number — subtree product count */}
      <div className="text-3xl font-bold text-fg-brand transition-transform duration-fast ease-out-quart group-hover:scale-110">
        {productCount ?? 0}
      </div>

      {/* Name */}
      <h3 className="text-sm font-semibold text-fg transition-colors group-hover:text-fg-brand">
        {name}
      </h3>
    </Link>
  );
}
