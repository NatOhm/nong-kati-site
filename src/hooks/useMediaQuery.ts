'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query. Used for breakpoint-aware conditional rendering
 * (04-design-system.md §9.1 breakpoint scale) where CSS alone can't drive a JS branch,
 * e.g. swapping MegaMenu (desktop) for MobileDrawer (mobile) trigger logic.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const listener = (e: MediaQueryListEvent): void => setMatches(e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
