/**
 * Same-origin redirect sanitizer — the ONE canonical rule for ?next=/
 * post-login targets across password, OTP, magic-link and OAuth flows
 * (audit [Low]: the old string-prefix check let `/\host` pass, and URL
 * normalisation treats backslashes as path separators, so the browser
 * could land on another origin).
 *
 * Rules:
 * - Only same-origin RELATIVE paths are accepted (starts with exactly one
 *   "/"), never protocol-relative or absolute URLs.
 * - Backslashes and control characters are rejected outright — they are
 *   never legitimate in an in-app path and browsers normalise them.
 */
export function safeRedirect(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (raw.length > 512) return fallback;
  // eslint-disable-next-line no-control-regex -- the point IS rejecting them
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  if (raw.includes('\\')) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  return raw;
}
