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
import { checkReceiverMatch, storeReceiverDigits } from '@/lib/payment/receiverPolicy';

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
  let result: Awaited<ReturnType<typeof verifySlip>> | Awaited<ReturnType<typeof verifySlip2Go>> =
    usedProvider === 'slip2go'
      ? await verifySlip2Go({
          imageBase64: input.imageBase64,
          expectedAmountThb: input.expectedAmountThb,
          ...receiverOpt,
        })
      : await verifySlip({
          imageBase64: input.imageBase64,
          expectedAmountThb: input.expectedAmountThb,
        });

  if (!result.ok && RETRYABLE_ON_FALLBACK.has(result.code)) {
    // Provider down / quota spent / config broken — try the OTHER provider
    // when one is configured, so a real slip can still confirm instead of
    // being dumped into the manual queue.
    const canRetry = isSlip2GoEnabled() ? isSlipVerificationEnabled() : isSlip2GoEnabled();
    if (canRetry) {
      result =
        usedProvider === 'slip2go'
          ? await verifySlip({
              imageBase64: input.imageBase64,
              expectedAmountThb: input.expectedAmountThb,
            })
          : await verifySlip2Go({
              imageBase64: input.imageBase64,
              expectedAmountThb: input.expectedAmountThb,
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
