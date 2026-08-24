'use client';

import Link from 'next/link';
import { cn } from '@/utils/cn';
import { formatThb } from '@/utils/format';
import { StockBadge } from './StockBadge';

export interface ProductCardProps {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string | null;
  imageUrl?: string | null;
  categoryName: string;
  categorySlug: string;
  price: number;
  stock: number;
  className?: string;
}

/**
 * 05-components.md §3.1 — Product Grid Card.
 * Dark glass card with hover glow, price display, stock badge.
 * Links to /product/[slug] — per 03-information-architecture.md §4.
 */
export function ProductCard({
  name,
  slug,
  shortDescription,
  imageUrl,
  categoryName,
  categorySlug,
  price,
  stock,
  className,
}: ProductCardProps): React.JSX.Element {
  return (
    <Link
      href={`/product/${slug}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-850 transition-all duration-fast ease-out-quart',
        'hover:border-amber-700/50 hover:shadow-brand-glow',
        className,
      )}
      aria-label={`${name} — ${formatThb(price)}`}
    >
      {/* Image placeholder */}
      <div className="relative aspect-square overflow-hidden bg-ink-800">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-moderate ease-out-quart group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-900/30 to-ink-800">
            <span className="text-4xl opacity-30">🎮</span>
          </div>
        )}
        {/* Stock badge overlay */}
        <div className="absolute right-2 top-2">
          <StockBadge stock={stock} />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {/* Category tag */}
        <span className="text-xs font-medium text-amber-400">
          {categoryName}
        </span>

        {/* Product name */}
        <h3 className="line-clamp-2 text-sm font-semibold text-ink-50 transition-colors group-hover:text-amber-300">
          {name}
        </h3>

        {/* Short description */}
        {shortDescription && (
          <p className="line-clamp-2 text-xs text-ink-300">
            {shortDescription}
          </p>
        )}

        {/* Price */}
        <div className="mt-auto pt-2">
          <span className="text-lg font-bold text-amber-300">
            {formatThb(price)}
          </span>
        </div>
      </div>
    </Link>
  );
}
