/** Shared validation and transition helpers for the promotion admin routes.

This module is a route-local DVR-style dependency. That means:
- It owns the promotion transition semantics (effective-now, invalid-date
  rejection, notification gating) so create/update/toggle routes enforce the
  same rules from one place.
- It does NOT own promotion validation, selection, or pricing. Those live in
  src/lib/promotions.ts and src/lib/pricing.ts.
- It does NOT own audit writes. Audit writes stay in the route handlers and
  the shared audit module.

Concrete boundaries:
- isEffectiveNow is the single definition of "promotion window contains now".
- parseDateInput is the single definition of "accept absent/empty, reject
  invalid dates".
- notifyPromotionPublishedSafely is the safe fire-and-forget wrapper around
  notifyPromotionPublished. It swallows delivery failures exactly like the
  rest of the notification system.

Non-goals kept explicit so future changes do not drift the schema/accounting
invariants or the notification semantics into this file:
- Promotion eligibility: promotions.ts
- Tier-price resolution and VAT math: pricing.ts
- Promotion row persistence + joinrow replacement + audit: the admin routes
- Promotion expiry cron: src/app/api/v1/internal/promotions/expire/route.ts
*/

import { notifyPromotionPublished } from '@/lib/notify';

/** True when the promotion's start/end window contains `now`. */
export function isEffectiveNow(
  startsAt: Date | null,
  expiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (startsAt && startsAt > now) return false;
  if (expiresAt && expiresAt <= now) return false;
  return true;
}

/** Parse a user-supplied date input. */
export function parseDateInput(
  value: unknown,
): { ok: true; date: Date | null } | { ok: false } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, date: null };
  }
  if (typeof value !== 'string') return { ok: false };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { ok: false };
  return { ok: true, date };
}

/** Fire the "promotion published" notification safely. */
export async function notifyPromotionPublishedSafely(params: {
  promotionName: string;
  discountType: 'percent' | 'amount';
  discountValue: number;
  scope: 'all' | 'selected';
  expiresAt?: string;
}): Promise<void> {
  try {
    await notifyPromotionPublished(params);
  } catch (err) {
    console.error(
      '[notify] promotion published failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
