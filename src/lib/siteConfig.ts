/**
 * Canonical public origin for URLs the site emits about itself (metadataBase,
 * canonical/OG URLs, JSON-LD, sitemap, robots). Single source so the seven
 * former call sites can never drift again — they previously fell back to two
 * DIFFERENT hard-coded domains (nong-kati.com vs nong-kati.vercel.app).
 *
 * Precedence: a usable NEXT_PUBLIC_SITE_URL → the production origin.
 *
 * "Usable" excludes loopback: the value is inlined at BUILD time, so a dev
 * leftover (`http://localhost:4200`) is frozen into the shipped bundle. That
 * is exactly what production served on 2026-11-02 — every canonical, og:url
 * and sitemap <loc> named localhost, which quietly wasted the sitemap's
 * percent-encoded product URLs. A loopback value is now treated as unset, at
 * build time, so the wrong origin cannot ship at all.
 *
 * (Email links use the stricter fail-closed `siteUrl()` in lib/fulfilment.ts
 * instead — customer mail must never carry a guessed domain in production.)
 */
const PRODUCTION_ORIGIN = 'https://nongkatistore.com';

/** Loopback / wildcard bind addresses: fine for dev, never for a public URL. */
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

export function publicOrigin(): string {
  const configured = (process.env['NEXT_PUBLIC_SITE_URL'] ?? '').trim().replace(/\/+$/, '');
  if (configured.length > 0 && !LOOPBACK.test(configured)) return configured;
  return PRODUCTION_ORIGIN;
}
