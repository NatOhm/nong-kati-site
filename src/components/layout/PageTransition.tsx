'use client';

import { usePathname } from 'next/navigation';

/**
 * State/page transition: remounts on route change so the 550ms ease-out
 * `page-enter` animation plays for every navigation.
 */
export function PageTransition({ children }: { children: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
