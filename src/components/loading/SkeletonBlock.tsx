import { cn } from '@/utils/cn';

export interface SkeletonBlockProps {
  /** Width/height via Tailwind utility classes, e.g. "h-4 w-3/4". */
  className?: string;
  rounded?: boolean;
}

/** 05-components.md §9.2 — shimmer placeholder, bg-surface → bg-elevated gradient. */
export function SkeletonBlock({ className, rounded = true }: SkeletonBlockProps): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer bg-[length:800px_100%] bg-gradient-to-r from-ink-850 via-ink-800 to-ink-850',
        rounded && 'rounded-sm',
        className,
      )}
    />
  );
}
