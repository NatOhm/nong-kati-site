/**
 * Store-time day boundaries.
 *
 * Revenue cutoffs ("วันนี้", "เดือนนี้") must follow the shop's clock, not the
 * machine's. Nothing pins TZ in the deployment, and a Linux default is UTC —
 * seven hours behind Bangkok — so a local-midnight cutoff counted every order
 * paid between 00:00 and 07:00 Thai time on the previous day.
 *
 * Thailand is UTC+7 year-round (no DST), so a fixed offset is exact.
 */
const OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Midnight of the current Bangkok day, `offsetDays` days earlier. */
export function bangkokDayStart(offsetDays = 0): Date {
  const midnightBkk = Math.floor((Date.now() + OFFSET_MS) / DAY_MS) * DAY_MS - offsetDays * DAY_MS;
  return new Date(midnightBkk - OFFSET_MS);
}

/** Midnight on the 1st of the current Bangkok month. */
export function bangkokMonthStart(): Date {
  const bkk = new Date(Date.now() + OFFSET_MS);
  return new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), 1) - OFFSET_MS);
}
