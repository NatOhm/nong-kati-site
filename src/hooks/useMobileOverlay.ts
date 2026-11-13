'use client';

import { useEffect, useRef } from 'react';

/**
 * Mobile overlay behaviour: hardware back / swipe-back dismissal and an
 * iOS-safe scroll lock.
 *
 * Both live here because they must agree on one thing — the overlay is open
 * from the moment it paints until its close animation unmounts, and neither
 * may leave history or scroll in a state the user can feel afterwards.
 */

const OVERLAY_STATE_KEY = '__nkOverlay';
let overlaySeq = 0;

interface OverlayHistoryState {
  [OVERLAY_STATE_KEY]?: number;
}

function overlayIdInHistory(): number | undefined {
  return (window.history.state as OverlayHistoryState | null)?.[OVERLAY_STATE_KEY];
}

/**
 * Back button / edge-swipe closes the overlay instead of leaving the page.
 *
 * Opening pushes one history entry that carries marker `id` (and copies the
 * router's own state, so popping returns to exactly the entry Next wrote).
 * A `popstate` only dismisses this overlay when the entry it landed on is NOT
 * ours — that is what makes stacked overlays peel off in reverse order
 * instead of collapsing both at once.
 *
 * Closing from the UI pops our entry so the next back press does ordinary
 * route navigation; a navigation-driven unmount leaves it alone because Next
 * has already replaced the state.
 */
export function useOverlayDismiss(open: boolean, onDismiss: () => void): void {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;

    const id = ++overlaySeq;
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    window.history.pushState({ ...state, [OVERLAY_STATE_KEY]: id }, '');

    const onPop = (): void => {
      // Landing on our own entry means a *newer* overlay was popped above us.
      if (overlayIdInHistory() === id) return;
      dismissRef.current();
    };

    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // UI dismissal: drop the entry we added. If the state is no longer ours
      // (a route change happened, or another overlay sits above), leave the
      // history alone — calling back() there would skip a real page.
      if (overlayIdInHistory() === id) {
        window.history.back();
      }
    };
  }, [open]);
}

interface SavedBodyStyle {
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
  paddingRight: string;
}

let lockCount = 0;
let savedScrollY = 0;
let savedPath = '';
let savedStyle: SavedBodyStyle | null = null;

/**
 * iOS Safari ignores `body { overflow: hidden }`, so the page behind an
 * overlay still rubber-bands. The portable lock is to freeze the body at the
 * current offset (`position: fixed; top: -scrollY`) and put the offset back on
 * close. Android Chrome honours it the same way; the overlays' own scroll areas
 * keep `overscroll-contain`, so the lock does not fight native momentum.
 *
 * Shared across every overlay: the first lock captures, the last release
 * restores, and nested overlays never double-apply.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    lockCount += 1;
    if (lockCount === 1) {
      const body = document.body;
      savedScrollY = window.scrollY;
      savedPath = window.location.pathname + window.location.search;
      savedStyle = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
      };

      // Keep the layout from jumping when the desktop scrollbar disappears.
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      body.style.position = 'fixed';
      body.style.top = `-${savedScrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    }

    return () => {
      lockCount -= 1;
      if (lockCount > 0 || !savedStyle) return;

      const body = document.body;
      body.style.position = savedStyle.position;
      body.style.top = savedStyle.top;
      body.style.left = savedStyle.left;
      body.style.right = savedStyle.right;
      body.style.width = savedStyle.width;
      body.style.overflow = savedStyle.overflow;
      body.style.paddingRight = savedStyle.paddingRight;
      savedStyle = null;

      // A close that happened because the user navigated away must not drag
      // the previous page's offset onto the new route.
      const here = window.location.pathname + window.location.search;
      if (here === savedPath) {
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [active]);
}
