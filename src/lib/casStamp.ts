/**
 * The next value for a compare-and-set on a row's `updatedAt` (audit 2026-11-24).
 *
 * A CAS is only a claim if the token CHANGES. Writing `new Date()` can produce
 * the very value it is replacing — two operations inside one millisecond, or
 * an app server whose clock is behind the row's timestamp — and then a second
 * runner's `where { updatedAt: <token> }` still matches the row the first
 * runner just claimed. Both runners then act: two pending payment attempts, or
 * two paid provider calls for one delayed slip.
 *
 * Always strictly greater than the token, never a step backwards. Crash safety
 * is unchanged: this is an ordinary column write inside the caller's
 * transaction, so a rollback takes it with it.
 */
export function nextCasStamp(current: Date): Date {
  const token = current instanceof Date ? current.getTime() : Number.NaN;
  if (!Number.isFinite(token)) return new Date();
  return new Date(Math.max(Date.now(), token + 1));
}
