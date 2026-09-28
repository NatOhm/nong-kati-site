/**
 * Canonical public origin for URLs the site emits about itself (metadataBase,
 * canonical/OG URLs, JSON-LD, sitemap, robots). Single source so the seven
 * former call sites can never drift again — they previously fell back to two
 * DIFFERENT hard-coded domains (nong-kati.com vs nong-kati.vercel.app).
 *
 * Precedence: NEXT_PUBLIC_SITE_URL → the canonical vercel.app deployment
 * domain. (Email links use the stricter fail-closed `siteUrl()` in
 * lib/fulfilment.ts instead — customer mail must never carry a guessed
 * domain in production.)
 */
export function publicOrigin(): string {
  const configured = process.env['NEXT_PUBLIC_SITE_URL'];
  if (configured && configured.length > 0) return configured.replace(/\/+$/, '');
  return 'https://nong-kati.vercel.app';
}
