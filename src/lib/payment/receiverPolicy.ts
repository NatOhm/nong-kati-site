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
 *   the digits we enforce. `''` means UNCONFIGURED, and callers must fail
 *   closed on it: since 2026-11-21 `slip-verify` refuses to auto-confirm and
 *   parks the slip for manual review (evidence kept, admin pinged, order
 *   still payable) instead of skipping the only receiver check that exists.
 * - Those digits go to Slip2Go for its bank-side `checkCondition` — a belt.
 * - `checkReceiverMatch` is the authoritative compare, applied by the route
 *   after ANY provider succeeds. Bank-side conditions cannot be trusted
 *   alone: the 2026-10-30 live proof sent a wrong `accountNumber` and got
 *   `200200` back instead of `200401` (order NK-2026-000171).
 *
 * `checkReceiverMatch` itself fails closed only where there is something to
 * compare: a definite mismatch (both sides at least 4 digits) rejects, while a
 * short/unreadable mask trusts the provider. An unconfigured store never
 * reaches this function — the route refuses to auto-confirm first. Details
 * carry last-4 digits only — full account numbers never reach a log.
 *
 * 2026-10-30 correction: the provider mask does NOT expose the trailing
 * window. The genuine slip to `199-1-73578-6` reports `xxx-x-x3578-x`
 * (digits `3578` — positions 6–9, tail masked), so trailing-4 equality
 * false-rejected a real customer slip (probe order NK-2026-000175: amount
 * 9 = 9, same account, yet `RECEIVER_MISMATCH`). The compare is therefore
 * containment — the slip's exposed run must appear inside the store digits
 * (or vice versa) — not tail equality.
 *
 * 2026-11-22 correction: not every bank hides the tail. A Bangkok Bank slip
 * paid to this same account prints the receiver as `199-1-xxx786` — front
 * AND tail visible, middle hidden — so its digits (`1991786`) are not one
 * contiguous run and containment rejected a genuine กรุงเทพ slip even though
 * nothing was wrong with it. Visible runs are now matched where they belong:
 * a leading run is the store's prefix, a trailing run its suffix, and an
 * interior run of 4+ digits must sit inside the account. Anything with fewer
 * than 4 visible digits still trusts the provider (nothing to compare).
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
 * masked accounts ("xxx-x-x3578-x" for store `199-1-73578-6`), so the
 * exposed digit run must appear inside the store digits (or vice versa),
 * and only when both sides yield at least 4 digits.
 */
/** Mask characters a provider may print for the hidden part of an account. */
const MASK_CHARS = /[xX*•·#]/;

/** Visible digit runs of a masked account, and whether either end is hidden. */
function maskedParts(
  v: string,
): { parts: string[]; leading: boolean; trailing: boolean } | null {
  const compact = v.replace(/[^0-9xX*•·#]/g, '');
  if (!MASK_CHARS.test(compact)) return null;
  return {
    parts: compact.split(/[xX*•·#]+/).filter((p) => p !== ''),
    leading: MASK_CHARS.test(compact.charAt(0)),
    trailing: MASK_CHARS.test(compact.charAt(compact.length - 1)),
  };
}

export function checkReceiverMatch(
  storeAccount: string | null | undefined,
  slipReceiver: string | null | undefined,
): ReceiverVerdict {
  const want = normalizeAccountDigits(storeAccount);
  const got = normalizeAccountDigits(slipReceiver);
  if (want.length < 4 || got.length < 4) return { ok: true };
  if (want.includes(got) || got.includes(want)) return { ok: true };

  // Bangkok Bank keeps the front and the tail (`199-1-xxx786` for
  // `199-1-73578-6`), so the visible digits are two runs, not one. Each run is
  // checked where it belongs; a mismatch anywhere still fails closed.
  const masked = maskedParts(slipReceiver ?? '');
  if (masked) {
    const { parts, leading, trailing } = masked;
    const visible = parts.reduce((n, p) => n + p.length, 0);
    if (visible >= 4) {
      const headIdx = leading ? -1 : 0;
      const tailIdx = trailing ? -1 : parts.length - 1;
      const head = headIdx === 0 ? (parts[0] ?? '') : '';
      const tail = tailIdx === parts.length - 1 ? (parts[parts.length - 1] ?? '') : '';
      const middle = parts.filter((_, i) => i !== headIdx && i !== tailIdx);
      const matches =
        (head === '' || want.startsWith(head)) &&
        (tail === '' || want.endsWith(tail)) &&
        middle.every((run) => run.length < 4 || want.includes(run));
      if (matches) return { ok: true };
    }
  }
  return { ok: false, detail: `receiver …${got.slice(-4)} vs store …${want.slice(-4)}` };
}
