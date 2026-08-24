/**
 * Brute-Force Lockout — 08-auth.md §9.1.
 * Tracks failed login attempts per email, locks after 5 failures.
 *
 * Customer: 5 fails → 15min lock
 * Admin: 5 fails → 30min lock + audit log
 * Admin TOTP: 5 fails → 30min lock + Super Admin alert
 */

// ─── Lockout Thresholds ─────────────────────────────────

export type LockoutConfig = {
  maxAttempts: number;
  lockDurationMs: number;
};

export const LOCKOUT_CONFIGS: Record<string, LockoutConfig> = {
  customer_login: { maxAttempts: 5, lockDurationMs: 15 * 60 * 1000 },      // 15 minutes
  admin_login: { maxAttempts: 5, lockDurationMs: 30 * 60 * 1000 },        // 30 minutes
  admin_totp: { maxAttempts: 5, lockDurationMs: 30 * 60 * 1000 },         // 30 minutes
};

// ─── In-Memory Mock Store ────────────────────────────────

type AttemptEntry = {
  count: number;
  lockedUntil: number | null;
};

const store = new Map<string, AttemptEntry>();

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.lockedUntil && entry.lockedUntil <= now) {
        store.delete(key);
      }
    }
  }, 300_000);
}

// ─── Core Functions ──────────────────────────────────────

/**
 * Check if an account is currently locked out.
 */
export function isLockedOut(
  email: string,
  context: string = 'customer_login'
): { locked: boolean; retryAfterMs: number } {
  const key = `${context}:${email.toLowerCase()}`;
  const entry = store.get(key);

  if (!entry) {
    return { locked: false, retryAfterMs: 0 };
  }

  if (entry.lockedUntil) {
    const now = Date.now();
    if (entry.lockedUntil > now) {
      return { locked: true, retryAfterMs: entry.lockedUntil - now };
    }
    // Lock expired — clear entry
    store.delete(key);
    return { locked: false, retryAfterMs: 0 };
  }

  return { locked: false, retryAfterMs: 0 };
}

/**
 * Record a failed login attempt.
 * Returns whether the account is now locked.
 */
export function recordFailedAttempt(
  email: string,
  context: string = 'customer_login'
): { locked: boolean; attemptsRemaining: number; shouldAlert: boolean } {
  const defaultConfig: LockoutConfig = { maxAttempts: 5, lockDurationMs: 900_000 };
  const config: LockoutConfig = LOCKOUT_CONFIGS[context] ?? defaultConfig;
  const key = `${context}:${email.toLowerCase()}`;
  const entry = store.get(key) ?? { count: 0, lockedUntil: null };

  entry.count++;
  let shouldAlert = false;

  if (entry.count >= config.maxAttempts) {
    entry.lockedUntil = Date.now() + config.lockDurationMs;
    shouldAlert = true; // For admin contexts, this triggers alert
  }

  store.set(key, entry);

  return {
    locked: entry.lockedUntil !== null,
    attemptsRemaining: Math.max(0, config.maxAttempts - entry.count),
    shouldAlert,
  };
}

/**
 * Record a successful login — clears failed attempts.
 */
export function recordSuccessfulLogin(
  email: string,
  context: string = 'customer_login'
): void {
  const key = `${context}:${email.toLowerCase()}`;
  store.delete(key);
}

/**
 * Get the current attempt count for an email.
 */
export function getAttemptCount(
  email: string,
  context: string = 'customer_login'
): number {
  const key = `${context}:${email.toLowerCase()}`;
  const entry = store.get(key);
  return entry?.count ?? 0;
}

/**
 * Manually clear lockout (e.g., Super Admin resets 2FA).
 */
export function clearLockout(
  email: string,
  context?: string
): void {
  if (context) {
    store.delete(`${context}:${email.toLowerCase()}`);
  } else {
    // Clear all contexts for this email
    for (const key of store.keys()) {
      if (key.endsWith(`:${email.toLowerCase()}`)) {
        store.delete(key);
      }
    }
  }
}
