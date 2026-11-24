/**
 * Verify one slip image: does it prove payment to THIS shop?
 *
 * Extracted from `POST /api/v1/payments/slip-verify` (2026-11-22) so the
 * background re-check of a delayed slip (src/lib/slipRecheck.ts) applies the
 * SAME rule instead of a second copy of it: provider preference, the
 * retryable-provider fallback, and the receiver policy that is the only
 * trustworthy guard — the bank-side `checkReceiver` condition did not fire on
 * the 2026-10-30 live probe (wrong account, `200200`).
 *
 * No HTTP, no evidence write, no attempt row: the caller owns those.
 */
import { isSlip2GoEnabled, verifySlip2Go } from '@/lib/payment/slip2go';
import { isSlipVerificationEnabled, verifySlip } from '@/lib/payment/slipok';
import {
  checkReceiverMatch,
  normalizeAccountDigits,
  storeReceiverDigits,
} from '@/lib/payment/receiverPolicy';

/** Codes worth retrying on the other provider (transient/config, not verdicts). */
const RETRYABLE_ON_FALLBACK = new Set([
  'UPSTREAM_ERROR',
  'QUOTA_EXCEEDED',
  'RATE_LIMITED',
  'NOT_CONFIGURED',
]);

export type SlipVerification =
  | {
      ok: true;
      ref: string;
      amountThb: number;
      /** As the bank printed it (masked), or null when it sent none. */
      receiverAccount: string | null;
      /** `slip2go:auto` / `slipok:auto` — what the attempt row records. */
      verifiedBy: string;
      /** The provider payload, stored as evidence on the attempt. */
      raw: unknown;
    }
  | {
      ok: false;
      code: string;
      /** Provider diagnostic (last-4 only for receiver mismatches). */
      detail?: string | null | undefined;
      /**
       * The provider's raw code/message/HTTP status, when a provider answered.
       * Persisted on the attempt so an `INVALID_SLIP` can be explained later
       * without re-paying for the check (see slip2go.ts).
       */
      providerCode?: string | undefined;
      providerMessage?: string | undefined;
      httpStatus?: number | undefined;
      /**
       * The receiver the bank reported, when a provider DID answer (a policy
       * refusal such as RECEIVER_MISMATCH still has it); null when nobody
       * named one. The admin "read the receiver" action shows this even
       * though the verdict is a refusal — that is the point: an admin must
       * see WHICH account before confirming a slip by hand.
       */
      receiverAccount: string | null;
      /**
       * The provider that answered, or null for the route's own refusal —
       * naming a provider for a call that never happened would make the admin
       * tooltip lie (`RECEIVER_UNCONFIGURED`).
       */
      provider: 'slip2go' | 'slipok' | null;
      /**
       * The FIRST provider's refusal, when this failure is the answer of a
       * fallback. It used to exist only in a log line: the attempt row kept the
       * last provider alone, so "why did Slip2Go not answer?" was unrecoverable
       * from the record (audit 2026-11-24). Persisted into `gatewayResponse`.
       */
      fallback?: {
        provider: 'slip2go' | 'slipok';
        code: string;
        detail?: string | null | undefined;
      };
    };

/** Automatic verification is on when EITHER provider is configured. */
export function isSlipAutoVerifyEnabled(): boolean {
  return isSlip2GoEnabled() || isSlipVerificationEnabled();
}

/** The provider a fresh check asks first (Slip2Go is the merchant account). */
export function primarySlipProvider(): 'slip2go' | 'slipok' {
  return isSlip2GoEnabled() ? 'slip2go' : 'slipok';
}

/**
 * Ask the configured providers, then apply the store-account policy.
 *
 * `storeAccountNumber` empty means the shop has no receiving account: there is
 * nothing to compare a slip against, so this refuses (fail closed) WITHOUT
 * calling a provider — a credit spent on a verdict we must not act on buys
 * nothing. The money is real either way, so callers park the slip for a human.
 */
export async function verifySlipImage(input: {
  imageBase64: string;
  /**
   * The image's REAL type, sniffed from its bytes (`sniffSlipMime`) by every
   * caller. Optional so an older caller keeps the previous `image/png`, but the
   * two production call sites always pass it: the customer route discards the
   * client's declared type, so hardcoding PNG mislabelled every JPEG upload.
   */
  imageMime?: string | undefined;
  expectedAmountThb: number;
  storeAccountNumber: string | null | undefined;
  /**
   * Default true: no store account means no provider call at all (a credit is
   * not spent on a verdict the shop cannot act on). The admin "read the
   * receiver" action passes false — it needs the bank's answer precisely
   * because nobody else can judge it — and still gets a refusal, never a pass.
   */
  requireStoreAccount?: boolean;
}): Promise<SlipVerification> {
  const storeDigits = storeReceiverDigits(input.storeAccountNumber);
  if (storeDigits === '' && input.requireStoreAccount !== false) {
    console.error(
      '[slip-verify] store receiving account not configured — auto-verify refused, slip parked for manual review',
    );
    return {
      ok: false,
      code: 'RECEIVER_UNCONFIGURED',
      detail: 'store receiving account not configured',
      provider: null,
      receiverAccount: null,
    };
  }

  const receiverOpt = { expectedReceiverDigits: storeDigits };
  let usedProvider: 'slip2go' | 'slipok' = primarySlipProvider();
  /** The abandoned provider's answer, carried into the failure for the row. */
  let firstRefusal: { provider: 'slip2go' | 'slipok'; code: string; detail?: string | null } | null =
    null;
  let result: Awaited<ReturnType<typeof verifySlip>> | Awaited<ReturnType<typeof verifySlip2Go>> =
    usedProvider === 'slip2go'
      ? await verifySlip2Go({
          imageBase64: input.imageBase64,
          expectedAmountThb: input.expectedAmountThb,
          imageMime: input.imageMime,
          ...receiverOpt,
        })
      : await verifySlip({
          imageBase64: input.imageBase64,
          expectedAmountThb: input.expectedAmountThb,
          imageMime: input.imageMime,
        });

  if (!result.ok && RETRYABLE_ON_FALLBACK.has(result.code)) {
    // Provider down / quota spent / config broken — try the OTHER provider
    // when one is configured, so a real slip can still confirm instead of
    // being dumped into the manual queue.
    const canRetry = isSlip2GoEnabled() ? isSlipVerificationEnabled() : isSlip2GoEnabled();
    if (canRetry) {
      // Why the first provider was abandoned, so an operator can tell a dead
      // provider from a spent quota without reading the attempt row (which only
      // keeps the LAST answer — audit 2026-11-24).
      console.warn('[slip-verify] falling back to the other provider', {
        from: usedProvider,
        code: result.code,
        ...(result.detail ? { detail: result.detail } : {}),
      });
      firstRefusal = { provider: usedProvider, code: result.code, detail: result.detail ?? null };
      result =
        usedProvider === 'slip2go'
          ? await verifySlip({
              imageBase64: input.imageBase64,
              expectedAmountThb: input.expectedAmountThb,
              imageMime: input.imageMime,
            })
          : await verifySlip2Go({
              imageBase64: input.imageBase64,
              expectedAmountThb: input.expectedAmountThb,
              imageMime: input.imageMime,
              ...receiverOpt,
            });
      usedProvider = usedProvider === 'slip2go' ? 'slipok' : 'slip2go';
    }
  }

  if (!result.ok) {
    // SlipOK's result has no raw-code fields, so narrow instead of assuming.
    const raw = 'providerCode' in result ? result : null;
    return {
      ok: false,
      code: result.code,
      detail: result.detail,
      ...(raw?.providerCode ? { providerCode: raw.providerCode } : {}),
      ...(raw?.providerMessage ? { providerMessage: raw.providerMessage } : {}),
      ...(raw?.httpStatus !== undefined ? { httpStatus: raw.httpStatus } : {}),
      provider: usedProvider,
      receiverAccount: null,
      ...(firstRefusal ? { fallback: firstRefusal } : {}),
    };
  }

  if (storeDigits === '') {
    // Only reachable with requireStoreAccount === false: the bank answered, but
    // there is no store account to hold the slip against. A refusal that still
    // carries the reported account — never an `ok`.
    return {
      ok: false,
      code: 'RECEIVER_UNCONFIGURED',
      detail: 'store receiving account not configured',
      provider: usedProvider,
      receiverAccount: result.receiverAccount,
    };
  }

  // A provider that says "paid" but names no receiving account leaves the only
  // authoritative check with nothing to compare: `checkReceiverMatch` passes
  // anything shorter than 4 digits on purpose, and the bank-side condition is
  // known not to fire (a wrong `checkReceiver` still answered `200200` on
  // 2026-10-30 and 2026-11-24). This is REACHABLE, not theoretical: both
  // providers type the field optional (`data.receiver?.account?.bank?.account`,
  // `d.receiver?.account?.value`) and each parser returns `ok: true` on the
  // documented success code alone, so a payload without it would auto-confirm
  // a slip paid to ANY account — the exact hole the store-account guard closes.
  // Fail closed and park it: a false reject is recoverable by hand, a false
  // confirm delivers goods.
  // The test is COMPARABILITY, not non-nullness: a fully masked line
  // (`xxx-x-xxxx-x`) is a present string with zero digits, which
  // checkReceiverMatch also passes. Fewer than 4 digits cannot identify an
  // account either way, so both shapes are the same refusal.
  if (normalizeAccountDigits(result.receiverAccount).length < 4) {
    return {
      ok: false,
      code: 'RECEIVER_MISSING',
      detail: 'provider confirmed the transfer without a comparable receiving account',
      provider: usedProvider,
      receiverAccount: result.receiverAccount,
    };
  }

  // Applied after ANY provider succeeds: the bank-side condition is belt-only,
  // and the SlipOK fallback carries no receiver condition at all.
  const verdict = checkReceiverMatch(input.storeAccountNumber, result.receiverAccount);
  if (!verdict.ok) {
    return {
      ok: false,
      code: 'RECEIVER_MISMATCH',
      detail: verdict.detail,
      provider: usedProvider,
      receiverAccount: result.receiverAccount,
    };
  }

  return {
    ok: true,
    ref: result.ref,
    amountThb: result.amountThb,
    receiverAccount: result.receiverAccount,
    verifiedBy: usedProvider === 'slip2go' ? 'slip2go:auto' : 'slipok:auto',
    raw: result.raw,
  };
}
