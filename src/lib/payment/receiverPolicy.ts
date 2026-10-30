/**
 * Receiver policy — the ONE owner of "which account do we accept?".
 *
 * The rule used to live in three coordinated places: the store digits were
 * extracted in `slip-verify/route.ts`, the bank-side `checkCondition` was
 * built in `slip2go.ts`, and a trailing-4 comparison sat inside
 * `verifySlip2Go` — so changing the rule meant three edits, and the SlipOK
 * fallback path (which has no receiver condition at all) ended up with no
 * receiver check whatsoever. It lives here now:
 *
 * - `storeReceiverDigits` resolves the admin `manual-transfer` setting into
 *   the digits we enforce (`''` when unconfigured → the check is skipped;
 *   that fail-open is a documented decision: with nothing to check against we
 *   queue to manual review instead of inventing a target).
 * - Those digits go to Slip2Go for its bank-side `checkCondition` — a belt.
 * - `checkReceiverMatch` is the authoritative compare, applied by the route
 *   after ANY provider succeeds. Bank-side conditions cannot be trusted
 *   alone: the 2026-10-30 live proof sent a wrong `accountNumber` and got
 *   `200200` back instead of `200401` (order NK-2026-000171).
 *
 * Fail-closed only where there is something to compare: a definite mismatch
 * (both sides at least 4 digits) rejects; a short/unreadable mask trusts the
 * provider. Details carry last-4 digits only — full account numbers never
 * reach a log.
 */

/** Digits only — strips spaces/dashes/mask chars from account numbers. */
export function normalizeAccountDigits(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

/**
 * Store receiving account as digits, resolved from the `manual-transfer`
 * setting. Empty string means "not configured" → callers skip the check.
 */
export function storeReceiverDigits(
  accountNumber: string | null | undefined,
): string {
  return normalizeAccountDigits(accountNumber);
}

export type ReceiverVerdict = { ok: true } | { ok: false; detail: string };

/**
 * Compare the slip's receiver against the store account. Providers report
 * masked accounts ("xxx-x-x5786-x"), so only the trailing 4 digits are
 * compared, and only when both sides yield at least 4.
 */
export function checkReceiverMatch(
  storeAccount: string | null | undefined,
  slipReceiver: string | null | undefined,
): ReceiverVerdict {
  const want = normalizeAccountDigits(storeAccount);
  const got = normalizeAccountDigits(slipReceiver);
  if (want.length < 4 || got.length < 4) return { ok: true };
  if (want.slice(-4) === got.slice(-4)) return { ok: true };
  return { ok: false, detail: `receiver …${got.slice(-4)} vs store …${want.slice(-4)}` };
}
