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
 * 9 = 9, same account, yet `RECEIVER_MISMATCH`).
 *
 * 2026-11-24: the mask belongs to the SENDING bank, so there is more than one
 * shape. A real Bangkok Bank receipt for that same account prints
 * `199-1-xxx786` — middle hidden — whose digits `1991786` are not one
 * contiguous run, and containment alone rejects it. The compare is therefore
 * containment OR a positional mask match (one mask char per hidden digit,
 * same total length), never tail equality.
 */

/** Digits only — strips spaces/dashes/mask chars from account numbers. */
export function normalizeAccountDigits(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

/**
 * Store receiving account as digits, resolved from the `manual-transfer`
 * setting. Empty string means "not configured" → callers fail closed.
 *
 * Fewer than 4 digits is ALSO "not configured", deliberately: that is the same
 * length `checkReceiverMatch` treats as "nothing to compare", so a typo (`12`)
 * or a placeholder would otherwise switch the only authoritative receiver check
 * off while still looking configured — every slip, paid to any account, would
 * auto-confirm. Fail closed instead (2026-11-24 audit; the blank-account guard
 * used to be bypassed by any 1–3 digit value).
 */
export function storeReceiverDigits(accountNumber: string | null | undefined): string {
  const digits = normalizeAccountDigits(accountNumber);
  return digits.length >= 4 ? digits : '';
}

export type ReceiverVerdict = { ok: true } | { ok: false; detail: string };

/** Mask characters a provider may print for the hidden part of an account. */
const MASK_CHARS = 'xX*•·#';

/** Provider text → visible digits and masks only, in the bank's own order. */
function maskPattern(v: string): string {
  return Array.from(v)
    .filter((ch) => /[0-9]/.test(ch) || MASK_CHARS.includes(ch))
    .join('');
}

/**
 * Does the provider's masked account line up with the store account?
 *
 * Banks print the account in their own digit groups with one mask char per
 * hidden digit, so the mask is a positional template (`199-1-73578-6` →
 * `199-1-xxx786`, or `xxx-x-x3578-x`). Squeezing the separators out leaves
 * visible digits and masks in the store's own order: every visible digit must
 * equal the store digit in that slot, and the total length must match — a
 * truncated or different-length account is a different account, rejected
 * rather than guessed at.
 */
function maskMatches(want: string, slipReceiver: string): boolean {
  const pattern = maskPattern(slipReceiver);
  if (pattern.length !== want.length) return false;
  let hasMask = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern.charAt(i);
    // maskPattern leaves only digits and masks, so this is the whole test.
    if (/[0-9]/.test(ch)) {
      if (ch !== want.charAt(i)) return false;
    } else {
      hasMask = true;
    }
  }
  return hasMask;
}

/**
 * Compare the slip's receiver against the store account. Providers report
 * masked accounts ("xxx-x-x3578-x" or "199-1-xxx786" for store
 * `199-1-73578-6`), so the exposed digit run must appear inside the store
 * digits (or vice versa), or the whole mask must line up positionally; only
 * when both sides yield at least 4 digits.
 */
export function checkReceiverMatch(
  storeAccount: string | null | undefined,
  slipReceiver: string | null | undefined,
): ReceiverVerdict {
  const want = normalizeAccountDigits(storeAccount);
  const got = normalizeAccountDigits(slipReceiver);
  if (want.length < 4 || got.length < 4) return { ok: true };
  if (want.includes(got) || got.includes(want)) return { ok: true };
  if (maskMatches(want, slipReceiver ?? '')) return { ok: true };
  return { ok: false, detail: `receiver …${got.slice(-4)} vs store …${want.slice(-4)}` };
}

/** Titles banks print in front of the holder name — formatting, not identity. */
const NAME_TITLES = [
  'นางสาว',
  'นาง',
  'นาย',
  'น.ส.',
  'ด.ช.',
  'ด.ญ.',
  'mr.',
  'mrs.',
  'ms.',
  'miss',
  'master',
];

/**
 * Compare a holder name the way a bank prints it: titles, spacing and case are
 * presentation. Returns '' for anything empty so callers can tell "no name"
 * from "a name that differs".
 */
export function normalizePersonName(name: string | null | undefined): string {
  let v = (name ?? '').normalize('NFKC').toLowerCase();
  // Zero-width spaces survive NFKC and would otherwise make two identical
  // names unequal.
  v = v.replace(/[\u200B-\u200D\uFEFF]/g, '');
  let previous = '';
  while (previous !== v) {
    previous = v;
    for (const title of NAME_TITLES) {
      if (v.startsWith(title)) v = v.slice(title.length);
    }
    v = v.trimStart();
  }
  // Letters and digits only: Thai combining marks are \p{M}, kept below.
  return v.replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}

export type ReceiverProof =
  | { proven: true; by: 'full-account' | 'holder-name' }
  | {
      proven: false;
      reason: 'store-account-unset' | 'store-name-unset' | 'provider-named-no-holder' | 'holder-name-differs';
      detail: string;
    };

/**
 * Can we POSITIVELY prove the slip's receiver is the shop's own account?
 *
 * `checkReceiverMatch` answers a weaker question — "do the visible digits fit
 * the store account?" — and a mask cannot answer more than that. `xxx-x-x3578-x`
 * fits EVERY 10-digit account whose 6th–9th digits are 3578, so a slip from
 * another bank with a coincidentally identical mask passed the digit compare
 * and auto-confirmed an order: the money went to somebody else and this shop
 * released codes. The bank-side `checkReceiver` cannot close that (a wrong
 * accountNumber still answered 200200 on 2026-10-30 and 2026-11-24), so the
 * only evidence left is the one the provider does send and we used to discard:
 * the receiving account's HOLDER NAME.
 *
 * Proven means one of:
 *  - the provider printed the FULL account (no mask chars) and its digits equal
 *    the store account, or
 *  - the holder name the bank reports equals the shop's configured account
 *    name once titles/spacing/case are normalized.
 *
 * Anything else — no store name configured, the provider named no holder, or a
 * different holder — is NOT proven, and the caller must park the slip for an
 * admin instead of confirming. A false reject is a queue entry; a false confirm
 * is goods handed out for a payment that went to another account.
 */
export function receiverIsProven(input: {
  storeAccountNumber: string | null | undefined;
  storeAccountName: string | null | undefined;
  slipReceiverAccount: string | null | undefined;
  slipReceiverName: string | null | undefined;
}): ReceiverProof {
  const want = storeReceiverDigits(input.storeAccountNumber);
  if (want === '') {
    return { proven: false, reason: 'store-account-unset', detail: 'store receiving account not configured' };
  }

  const printed = input.slipReceiverAccount ?? '';
  const printedUnmasked = !Array.from(printed).some((ch) => MASK_CHARS.includes(ch));
  if (printedUnmasked && normalizeAccountDigits(printed) === want) {
    return { proven: true, by: 'full-account' };
  }

  const storeName = normalizePersonName(input.storeAccountName);
  if (storeName === '') {
    return {
      proven: false,
      reason: 'store-name-unset',
      detail: 'shop account holder name not configured — the receiver cannot be proven',
    };
  }
  const slipName = normalizePersonName(input.slipReceiverName);
  if (slipName === '') {
    return {
      proven: false,
      reason: 'provider-named-no-holder',
      detail: 'provider named no receiving account holder',
    };
  }
  if (slipName === storeName) return { proven: true, by: 'holder-name' };

  return {
    proven: false,
    reason: 'holder-name-differs',
    detail: 'receiving account holder is not the shop account holder',
  };
}
