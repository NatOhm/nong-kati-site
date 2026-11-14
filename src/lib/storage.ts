/**
 * localStorage that cannot throw.
 *
 * iOS Safari rejects storage access in Private Browsing (and any browser
 * throws on a full quota). The cart session key, the motion preference and the
 * recently-viewed list all read it during render/hydration, so one unguarded
 * `localStorage.getItem` is enough to blank the page — and an unguarded
 * `setItem` throws out of a click handler and takes the error boundary down
 * with it. Reads degrade to `null`, writes to a silent no-op; the callers all
 * keep working from in-memory state.
 */

function store(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    // Accessing the property itself can throw when storage is blocked.
    return null;
  }
}

export function safeGetItem(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** True when the value was persisted; false when storage is unavailable. */
export function safeSetItem(key: string, value: string): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    // Nothing to degrade — the key simply stays.
  }
}
