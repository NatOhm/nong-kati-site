'use client';

import Link from 'next/link';
import { cn } from '@/utils/cn';

export interface AppTileProps {
  name: string;
  slug: string;
  icon?: string | null | undefined;
  imageUrl?: string | null | undefined;
  /** Representative product slug — links straight to the package page. */
  productSlug?: string | null | undefined;
  productCount?: number | undefined;
  className?: string;
}

/**
 * Dark "app tile" from the client's mockup: game/app artwork on a near-black
 * clay panel, name underneath, and a จำนวน pill showing the product count.
 * The whole tile links to the category page (or straight to the product when
 * the category holds exactly one). Falls back to the category emoji on a clay
 * badge when no artwork exists yet.
 */
export function AppTile({
  name,
  slug,
  icon,
  imageUrl,
  productSlug,
  productCount = 0,
  className,
}: AppTileProps): React.JSX.Element {
  const href = productCount === 1 && productSlug ? `/product/${productSlug}` : `/category/${slug}`;
  return (
    <Link
      href={href}
      aria-label={`${name} — ${productCount} รายการ`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl bg-clay-950 text-left',
        'shadow-clay-md transition-transform duration-fast ease-out-quart',
        'hover:-translate-y-1 hover:shadow-clay-lg active:scale-[0.97] active:shadow-clay-press',
        className,
      )}
    >
      {/* Artwork — fixed ratio keeps the grid aligned like the mockup */}
      <div className="relative aspect-square w-full overflow-hidden bg-clay-900">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-moderate ease-out-quart group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl" aria-hidden>
            {icon ?? '🎮'}
          </div>
        )}
        {/* จำนวน pill — bottom-right of the artwork, mockup style */}
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-clay-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {productCount > 0 ? `จำนวน ${productCount}` : 'เร็วๆ นี้'}
        </span>
      </div>

      {/* Name strip */}
      <div className="px-2.5 py-2">
        <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-white">{name}</h3>
      </div>
    </Link>
  );
}
