'use client';

import Link from 'next/link';
import { cn } from '@/utils/cn';

export interface SearchResultCardProps {
  name: string;
  slug: string;
  categoryName: string;
  imageUrl?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}

/**
 * Individual search result item — links to product detail page.
 */
export function SearchResultCard({
  name,
  slug,
  categoryName,
  imageUrl,
  onClick,
  className,
}: SearchResultCardProps): React.JSX.Element {
  return (
    <Link
      href={`/product/${slug}`}
      {...(onClick ? { onClick } : {})}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-ink-800',
        className,
      )}
    >
      {/* Thumbnail */}
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-ink-800">
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-900/30 to-ink-800 text-lg opacity-40">
            🎮
          </div>
        )}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-100">{name}</p>
        <p className="truncate text-xs text-ink-400">{categoryName}</p>
      </div>
    </Link>
  );
}
