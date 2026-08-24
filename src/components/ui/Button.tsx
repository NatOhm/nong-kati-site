import { forwardRef } from 'react';

import { cn } from '@/utils/cn';

import { Spinner } from '../loading/Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-amber-400 text-ink-900 border border-amber-300/30 shadow-brand-glow hover:bg-amber-300 hover:shadow-brand-glow-hover disabled:bg-ink-700 disabled:text-ink-400 disabled:shadow-none disabled:cursor-not-allowed',
  secondary:
    'bg-transparent text-amber-300 border border-amber-500 hover:bg-amber-900/40 disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:
    'bg-transparent text-ink-200 border border-transparent hover:bg-ink-800 hover:border-ink-700 disabled:opacity-50 disabled:cursor-not-allowed',
  destructive:
    'bg-crimson-500 text-white border border-crimson-700 hover:bg-crimson-400 disabled:opacity-50 disabled:cursor-not-allowed',
  link: 'bg-transparent text-amber-300 border-none underline-offset-2 hover:underline disabled:opacity-50 disabled:cursor-not-allowed p-0 h-auto',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm h-8',
  md: 'px-5 py-2.5 text-base h-10',
  lg: 'px-6 py-3 text-base h-12',
};

/**
 * Primary interactive control across the storefront + admin. Spec: 05-components.md §2.1.
 * `primary` carries the signature amber glow (04-design-system.md §5.2) — reserve it for
 * the single most important action per view (e.g. "ชำระเงิน").
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled ?? loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-ui font-semibold transition-colors transition-shadow duration-fast ease-out-quart active:scale-[0.97] active:duration-instant',
        variantClasses[variant],
        variant !== 'link' && sizeClasses[size],
        fullWidth && 'w-full',
        loading && 'cursor-wait',
        className,
      )}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" color={variant === 'primary' ? 'white' : 'brand'} />
      ) : (
        <>
          {leftIcon}
          {children}
          {rightIcon}
        </>
      )}
    </button>
  );
});
