/**
 * Site-level motion preference — single owner for "should the site animate?".
 *
 * Precedence (first match wins):
 *   1. nk-motion in localStorage: 'on' | 'off' — the user's explicit choice,
 *      remembered across visits and overriding the OS.
 *   2. The OS setting (prefers-reduced-motion) — default, unchanged behavior.
 *
 * The choice is applied as <html data-motion="on|off"> (see globals.css and the
 * init script in app/layout.tsx); absence of the attribute means "follow OS".
 * JS consumers (autoplay timers etc.) use prefersReducedMotion().
 */

export type MotionChoice = 'on' | 'off';

const STORAGE_KEY = 'nk-motion';
const ATTR = 'data-motion';

export function readStoredMotionChoice(): MotionChoice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

export function applyMotionAttribute(choice: MotionChoice | null): void {
  const root = document.documentElement;
  if (choice) root.setAttribute(ATTR, choice);
  else root.removeAttribute(ATTR);
}

/** Persist the choice (or clear it to follow the OS again) and apply it now. */
export function setMotionChoice(choice: MotionChoice | null): void {
  try {
    if (choice) localStorage.setItem(STORAGE_KEY, choice);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode etc. — attribute still applied for this page view */
  }
  applyMotionAttribute(choice);
}

/**
 * Effective answer for JS behavior: true when motion should be suppressed.
 * An explicit site choice always wins over the OS media query.
 */
export function prefersReducedMotion(): boolean {
  const stored = readStoredMotionChoice();
  if (stored) return stored === 'off';
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** React to changes from any tab — keeps the attribute in sync. */
export function subscribeMotion(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener('nk-motion-change', handler);
  return () => window.removeEventListener('nk-motion-change', handler);
}

/** Internal: fire the cross-tab/event signal after any change. */
export function notifyMotionChanged(): void {
  window.dispatchEvent(new Event('nk-motion-change'));
}
