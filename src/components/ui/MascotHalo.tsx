import { cn } from '@/utils/cn';

/**
 * Round polka halo behind a mascot render (hero, notice board). Decoration
 * only: `aria-hidden`, no pointer events, no layout height of its own — the
 * caller positions it with `absolute` inside a `relative` wrapper. Size and
 * position belong to the caller; the underlay colour is one of the theme's
 * `bg-*` utilities.
 */
export function MascotHalo({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn('polka polka-sm pointer-events-none absolute', className)}
    />
  );
}
