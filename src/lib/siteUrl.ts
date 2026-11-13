/**
 * Canonical site origin for links that are sent to CUSTOMERS (order emails).
 *
 * One owner on purpose: the same URL was built in two places, and they failed
 * differently. `src/lib/fulfilment.ts` failed closed (production threw when the
 * variable was missing) while `src/api/orderLookup.ts` fell back to
 * `http://localhost:3000` — so a resend from production mail could quietly send
 * a customer a link to their own machine.
 *
 * Precedence: a configured NEXT_PUBLIC_SITE_URL → the dev default. Production
 * has NO fallback: a missing value must break loudly at build/deploy rather
 * than link customers to localhost. (Metadata/canonical URLs use the looser
 * `publicOrigin()` in lib/siteConfig.ts, which may fall back to the production
 * origin — those are rendered by us, not mailed to a customer.)
 */
export function siteUrl(): string {
  const configured = process.env['NEXT_PUBLIC_SITE_URL'];
  if (configured && configured.length > 0) return configured.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is required in production (customer-facing links would point at localhost)',
    );
  }
  return 'http://localhost:3000';
}
