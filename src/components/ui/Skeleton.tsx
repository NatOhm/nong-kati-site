import { cn } from '@/utils/cn';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-ink-800',
        className
      )}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-850">
      <Skeleton className="aspect-square w-full" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-6 w-20 mt-auto" />
      </div>
    </div>
  );
}

export function CategoryCardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-ink-700 bg-ink-850 p-6">
      <Skeleton className="h-16 w-16 rounded-full" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-3 w-12" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
