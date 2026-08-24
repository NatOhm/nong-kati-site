'use client';

import { cn } from '@/utils/cn';

export interface ProductGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

/**
 * Responsive product grid container.
 * Mobile: 2 columns. Tablet: 3 columns. Desktop: configurable (default 4).
 */
export function ProductGrid({
  children,
  columns = 4,
  className,
}: ProductGridProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'grid gap-3',
        'grid-cols-2',
        columns >= 3 && 'md:grid-cols-3',
        columns >= 4 && 'lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
