import Link from 'next/link';

import { cn } from '@/utils/cn';

export interface LogoProps {
  href?: string | null;
  className?: string;
}

/** Wordmark. Non-clickable (href=null) on checkout payment step per 05-components.md §1.6. */
export function Logo({ href = '/', className }: LogoProps): React.JSX.Element {
  const mark = (
    <span className={cn('font-display text-xl font-bold text-amber-300', className)}>Nong-Kati</span>
  );

  if (href === null) return mark;

  return (
    <Link href={href} aria-label="Nong-Kati — หน้าหลัก">
      {mark}
    </Link>
  );
}
