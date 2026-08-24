import { cn } from '@/utils/cn';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'brand';

export interface BadgeProps {
  variant: BadgeVariant;
  label: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-jade-900 text-jade-200 border-jade-700',
  error: 'bg-crimson-900 text-crimson-200 border-crimson-700',
  warning: 'bg-topaz-900 text-topaz-200 border-topaz-400',
  info: 'bg-sapphire-900 text-sapphire-200 border-sapphire-700',
  neutral: 'bg-ink-800 text-ink-300 border-ink-700',
  brand: 'bg-amber-900 text-amber-300 border-amber-500',
};

/** 05-components.md §2.9 — status/state pill. Variant → semantic token mapping per 04-design-system.md §10.5. */
export function Badge({ variant, label, icon, size = 'md' }: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-xs border font-ui font-semibold tracking-[0.03em]',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-[3px] text-xs',
        variantClasses[variant],
      )}
    >
      {icon}
      {label}
    </span>
  );
}
