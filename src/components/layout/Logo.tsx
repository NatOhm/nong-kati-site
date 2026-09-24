import Link from 'next/link';

import { cn } from '@/utils/cn';

export interface LogoProps {
  href?: string | null;
  className?: string;
}

/** Wordmark. Non-clickable (href=null) on checkout payment step per 05-components.md §1.6. */
export function Logo({ href = '/', className }: LogoProps): React.JSX.Element {
  const mark = (
    // brand-strong: the plain fg-brand (peach-600) is 3.05:1 on the warm
    // navbar fill in light mode — 20px bold wordmark needs >=4.5 (audit #3).
    <span className={cn('font-display text-xl font-bold text-fg-brand-strong', className)}>Nong-Kati</span>
  );

  if (href === null) return mark;

  return (
    <Link href={href} aria-label="Nong-Kati — หน้าหลัก">
      {mark}
    </Link>
  );
}
