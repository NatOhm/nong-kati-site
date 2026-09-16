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

/* Claymorphism buttons: puffy dual shadows (white inner highlight + cocoa drop),
   squish-press on active, spring lift on hover. Colors stay semantic so dark
   mode inherits automatically. */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'clay-btn bg-surface-brand text-fg-inverse border border-peach-600/30 shadow-clay-brand rounded-xl hover:bg-surface-brand-hover hover:shadow-clay-lg hover:-translate-y-0.5 active:shadow-clay-press active:translate-y-0 disabled:bg-surface-sunken disabled:text-fg-placeholder disabled:shadow-none disabled:cursor-not-allowed',
  secondary:
    'clay-btn bg-surface-elevated text-fg-brand border border-line-brand shadow-clay-sm rounded-xl hover:shadow-clay hover:-translate-y-0.5 active:shadow-clay-press active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:
    'clay-btn bg-transparent text-fg-secondary border border-transparent rounded-xl shadow-none hover:bg-surface-sunken hover:border-line hover:shadow-clay-xs active:shadow-clay-press disabled:opacity-50 disabled:cursor-not-allowed',
  destructive:
    'clay-btn bg-crimson-500 text-white border border-crimson-700/40 shadow-clay-sm rounded-xl hover:shadow-clay hover:-translate-y-0.5 active:shadow-clay-press active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed',
  link: 'bg-transparent text-fg-brand border-none underline-offset-2 hover:underline disabled:opacity-50 disabled:cursor-not-allowed p-0 h-auto',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm h-9',
  md: 'px-5 py-2.5 text-base h-11',
  lg: 'px-6 py-3 text-base h-12',
};

/**
 * Primary interactive control across the storefront + admin. Spec: 05-components.md §2.1.
 * Claymorphism style: puffy shadows, squish press, spring lift (04-design-system.md §5.2).
 * `primary` is the peach clay CTA — reserve it for the single most important action per view.
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
        'inline-flex items-center justify-center gap-2 whitespace-nowrap font-ui font-semibold transition-all duration-interactive ease-ease-out active:scale-[0.97] active:duration-instant',
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
