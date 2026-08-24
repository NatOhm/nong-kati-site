import { cn } from '@/utils/cn';

export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerColor = 'brand' | 'white' | 'muted';

export interface SpinnerProps {
  size?: SpinnerSize;
  color?: SpinnerColor;
  className?: string;
}

const sizePx: Record<SpinnerSize, number> = { sm: 16, md: 24, lg: 40 };
const colorClass: Record<SpinnerColor, string> = {
  brand: 'text-amber-400',
  white: 'text-white',
  muted: 'text-ink-300',
};

/** 05-components.md §9.1 — role="status" spinner, Thai aria-label. */
export function Spinner({ size = 'md', color = 'brand', className }: SpinnerProps): React.JSX.Element {
  const px = sizePx[size];
  return (
    <svg
      role="status"
      aria-label="กำลังโหลด"
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin', colorClass[color], className)}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
