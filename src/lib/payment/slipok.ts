/**
 * SlipOK client — automatic payment-slip verification (plan option B,
 * docs/payment-verification-plan.md). Verifies a PromptPay slip image against
 * real bank data. Per docs (slipok.com/api-documentation):
 * - POST https://api.slipok.com/api/line/apikey/{branchId}
 * - Header: x-authorization: {API key}, Content-Type: multipart/form-data
 * - Body (multipart): files = slip image (JPG/JPEG/PNG/JFIF/WEBP),
 *   amount = exact expected amount (bank-side check, error 1013 on mismatch),
 *   log = true (enables duplicate-slip detection, error 1012)
 * - 200 { success: true, data: { transRef, amount, receiver{account{name,value}} } }
 * - Non-200 { code, message } — 1006 invalid image, 1007 no transaction,
 *   1010 bank delay, 1012 duplicate slip, 1013 amount mismatch,
 *   1014 wrong receiver, 429 quota.
 *
 * Config: NK_SLIP_OK_KEY (API key) + NK_SLIP_OK_BRANCH (branch id). Without
 * them the feature is disabled — the verify endpoint answers 503 and the
 * checkout keeps the manual-slip fallback (admin clicks ยืนยันการชำระเงิน).
 */

const SLIP_VERIFY_BASE =
  process.env['SLIP_VERIFY_BASE_OVERRIDE'] ?? 'https://api.slipok.com/api/line/apikey';

export interface SlipVerifyInput {
  imageBase64: string;
  /** Exact order total in THB — passed to SlipOK for the bank-side check. */
  expectedAmountThb: number;
}

export interface SlipVerifySuccess {
  ok: true;
  /** Bank's transaction reference — stored and enforced unique per order. */
  ref: string;
  amountThb: number;
  /** Receiver account as the bank reports it (masked, e.g. xxx-x-x3109-x). */
  receiverAccount: string | null;
  receiverName: string | null;
  transferAt: string | null;
  raw: Record<string, unknown>;
}

export type SlipVerifyResult =
  | SlipVerifySuccess
  | {
      ok: false;
      code:
        | 'NOT_CONFIGURED'
        | 'UPSTREAM_ERROR'
        | 'QUOTA_EXCEEDED'
        | 'INVALID_SLIP'
        | 'AMOUNT_MISMATCH'
        | 'RECEIVER_MISMATCH'
        | 'SLIP_DELAYED';
      detail?: string;
    };

interface SlipOkData {
  transRef?: string;
  amount?: number | string;
  date_time?: string;
  receiver?: { name?: string; displayName?: string; account?: { value?: string } };
  [key: string]: unknown;
}

export function isSlipVerificationEnabled(): boolean {
  return Boolean(process.env['NK_SLIP_OK_KEY'] && process.env['NK_SLIP_OK_BRANCH']);
}

/** Map SlipOK's documented error codes to our result variants. */
function mapSlipOkError(code: number | undefined, message: string): SlipVerifyResult {
  switch (code) {
    case 1013:
      return { ok: false, code: 'AMOUNT_MISMATCH', detail: message };
    case 1014:
      return { ok: false, code: 'RECEIVER_MISMATCH', detail: message };
    case 1012:
      return { ok: false, code: 'INVALID_SLIP', detail: 'duplicate: ' + message };
    case 1010:
      return { ok: false, code: 'SLIP_DELAYED', detail: message };
    case 1002:
      return { ok: false, code: 'NOT_CONFIGURED', detail: message };
    default:
      return { ok: false, code: 'INVALID_SLIP', detail: message };
  }
}

/** Verify one slip through SlipOK. Never throws — every path returns a result. */
export async function verifySlip(input: SlipVerifyInput): Promise<SlipVerifyResult> {
  const key = process.env['NK_SLIP_OK_KEY'];
  const branch = process.env['NK_SLIP_OK_BRANCH'];
  if (!key || !branch) return { ok: false, code: 'NOT_CONFIGURED' };

  const form = new FormData();
  const bytes = Buffer.from(input.imageBase64, 'base64');
  form.append('files', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'slip.png');
  // Bank-side amount check (error 1013 when the slip's amount differs) and
  // duplicate-slip detection (1012) — both cheaper than reimplementing.
  form.append('amount', String(Math.round(input.expectedAmountThb * 100) / 100));
  form.append('log', 'true');

  let res: Response;
  try {
    res = await fetch(`${SLIP_VERIFY_BASE}/${encodeURIComponent(branch)}`, {
      method: 'POST',
      headers: { 'x-authorization': key },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, code: 'UPSTREAM_ERROR', detail: 'network' };
  }

  if (res.status === 429) {
    return { ok: false, code: 'QUOTA_EXCEEDED' };
  }

  let body: { success?: boolean; code?: number; message?: string; data?: SlipOkData } | null;
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, code: 'UPSTREAM_ERROR', detail: `HTTP ${res.status}` };
  }

  if (res.status !== 200 || body?.success !== true || !body.data) {
    return mapSlipOkError(body?.code, body?.message ?? `HTTP ${res.status}`);
  }

  const d = body.data;
  const amount = Number(d.amount ?? NaN);
  if (!Number.isFinite(amount) || !d.transRef) {
    return { ok: false, code: 'INVALID_SLIP', detail: 'missing amount/transRef' };
  }
  // SlipOK already enforced the amount via the `amount` field (1013), but the
  // local re-check keeps the invariant in our hands, not the provider's.
  if (Math.abs(amount - input.expectedAmountThb) > 0.005) {
    return {
      ok: false,
      code: 'AMOUNT_MISMATCH',
      detail: `slip ${amount} vs order ${input.expectedAmountThb}`,
    };
  }
  return {
    ok: true,
    ref: d.transRef,
    amountThb: amount,
    receiverAccount: d.receiver?.account?.value ?? null,
    receiverName: d.receiver?.displayName ?? d.receiver?.name ?? null,
    transferAt: d.date_time ?? null,
    raw: d as unknown as Record<string, unknown>,
  };
}
