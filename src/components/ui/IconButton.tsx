import { forwardRef } from 'react';

import { cn } from '@/utils/cn';

export type IconButtonVariant = 'ghost' | 'subtle' | 'primary';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  /** Required — rendered as aria-label. Descriptive Thai string, never visually hidden. */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Shows a count badge, e.g. cart item count. */
  badge?: number;
}

const sizeClasses: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
};

const variantClasses: Record<IconButtonVariant, string> = {
  ghost: 'bg-transparent text-clay-700 hover:bg-clay-200 hover:text-peach-700',
  subtle: 'bg-clay-100 text-clay-700 hover:bg-clay-200',
  primary: 'bg-peach-500 text-white hover:bg-peach-400 shadow-clay-brand',
};

/** 05-components.md §2.2 — icon-only button with a required aria-label and optional count badge. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', badge, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      className={cn(
        'relative inline-flex items-center justify-center rounded-md transition-colors duration-fast ease-out-quart active:scale-95',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {icon}
      {typeof badge === 'number' && badge > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-500 px-1 text-xs font-bold leading-none text-white"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
});
