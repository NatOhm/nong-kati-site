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
        'flex animate-pulse flex-col overflow-hidden rounded-lg border border-clay-200 bg-white',
        className,
      )}
    >
      {/* Image skeleton */}
      <div className="aspect-square bg-clay-100" />

      {/* Content skeleton */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="h-3 w-16 rounded bg-clay-300" />
        <div className="h-4 w-3/4 rounded bg-clay-300" />
        <div className="h-3 w-full rounded bg-clay-300" />
        <div className="mt-auto h-5 w-20 rounded bg-clay-300 pt-2" />
      </div>
    </div>
  );
}
