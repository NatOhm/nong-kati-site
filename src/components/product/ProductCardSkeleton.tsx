'use client';

import { cn } from '@/utils/cn';

export interface ProductCardSkeletonProps {
  className?: string;
}

/**
 * Loading skeleton for ProductCard — matches the same aspect ratio and layout.
 */
export function ProductCardSkeleton({ className }: ProductCardSkeletonProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-850 animate-pulse',
        className,
      )}
    >
      {/* Image skeleton */}
      <div className="aspect-square bg-ink-800" />

      {/* Content skeleton */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="h-3 w-16 rounded bg-ink-700" />
        <div className="h-4 w-3/4 rounded bg-ink-700" />
        <div className="h-3 w-full rounded bg-ink-700" />
        <div className="mt-auto h-5 w-20 rounded bg-ink-700 pt-2" />
      </div>
    </div>
  );
}
