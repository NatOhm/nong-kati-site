import { cn } from '@/utils/cn';

/**
 * Polka-dot texture layer (docs/design-system.md §2). Purely decorative:
 * `aria-hidden` and `pointer-events-none`, absolutely positioned so it adds
 * no layout height. The parent owns the underlay colour (`bg-peach-100`,
 * `bg-blush-50`, …) — `.polka` paints dots only.
 *
 * Never wrap content in this element: it must stay a sibling of the content
 * (the containing-block rule in the fixed-positioning guard).
 */
export function PolkaBackdrop({
  variant = 'lg',
  className,
}: {
  variant?: 'sm' | 'lg';
  className?: string;
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'polka pointer-events-none absolute inset-0',
        variant === 'sm' ? 'polka-sm' : 'polka-lg',
        className,
      )}
    />
  );
}
