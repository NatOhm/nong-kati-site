'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Sitewide top loading bar — gives feedback during slow App Router
 * navigations (server-component fetch + streaming) where the page would
 * otherwise look frozen on the old content.
 *
 * No new dependency: anchor clicks start a simulated creep to 90%,
 * the pathname change completes it to 100% and fades out. Back/forward
 * (popstate) starts it too. Respects the global reduced-motion CSS
 * (transitions collapse to ~0ms there).
 */
export function RouteProgress(): React.JSX.Element {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const creepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  function stopTimers(): void {
    if (creepTimer.current !== null) {
      clearInterval(creepTimer.current);
      creepTimer.current = null;
    }
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  function start(): void {
    stopTimers();
    setActive(true);
    setProgress((p) => (p > 0 && p < 90 ? p : 12));
    if (creepTimer.current !== null) return;
    creepTimer.current = setInterval(() => {
      setProgress((p) => Math.min(90, p + Math.max(2, (90 - p) * 0.18)));
    }, 200);
  }

  function finish(): void {
    if (creepTimer.current !== null) {
      clearInterval(creepTimer.current);
      creepTimer.current = null;
    }
    setProgress(100);
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setActive(false);
      setProgress(0);
      hideTimer.current = null;
    }, 300);
  }

  // Complete the bar whenever the route settles. Skip the very first
  // render — there is no "previous page" to transition from, so only
  // finish if a navigation actually started one.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish is stable by design
  }, [pathname]);

  // Internal link clicks + back/forward start the bar; the pathname
  // effect above finishes it when the new page lands.
  useEffect(() => {
    function onClick(e: MouseEvent): void {
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!anchor || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      if (anchor.getAttribute('target') === '_blank') return;
      if (anchor.hasAttribute('download')) return;
      // Internal navigations only — external links leave the app anyway.
      if (href.startsWith('/') && !href.startsWith('//')) start();
    }
    function onPopState(): void {
      start();
    }
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      stopTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start/stop are stable by design
  }, []);

  return (
    <div
      role="progressbar"
      aria-hidden={!active}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
    >
      <div
        className="h-full w-full origin-left"
        style={{
          transform: `scaleX(${(active ? progress : 0) / 100})`,
          opacity: active ? 1 : 0,
          transition: 'transform 200ms ease-out, opacity 300ms ease-out',
          background:
            'linear-gradient(90deg, rgb(var(--accent-ramp-400, 251 150 81)), rgb(var(--accent-ramp-600, 224 95 6)))',
          boxShadow: '0 0 8px rgb(var(--accent-ramp-500, 249 121 31) / 0.7)',
        }}
      />
    </div>
  );
}
