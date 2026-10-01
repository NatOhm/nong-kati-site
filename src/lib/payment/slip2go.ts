/**
 * Slip2Go client — automatic payment-slip verification (provider #2).
 *
 * The client's merchant account is with Slip2Go (slip2go.com), not SlipOK.
 * Config: NK_SLIP2GO_SECRET (API secret) — when set, the slip-verify route
 * uses this provider; the SlipOK path stays as fallback for when only
 * NK_SLIP_OK_KEY is configured.
 *
 * Wire format per slip2go.com/guide (REST API):
 * - POST {base}/api/verify-slip/qr-base64/info
 * - Header: Authorization: {NK_SLIP2GO_SECRET} (the secret directly — no
 *   Bearer prefix, per the Authentication guide), Content-Type: application/json
 * - Body: { payload: { imageBase64, checkCondition: { checkAmount: { type:
 *   'eq', amount }, checkDuplicate: true, checkReceiver?: [...] } } }
 *   — amount 'eq' with no commas and no trailing zeros ("100" not "100.00").
 * - Success (code 200000): data.transRef / data.amount / data.receiver
 * - Condition codes (HTTP 200): 200401 receiver, 200402 amount, 200403 date,
 *   200404 slip not found, 200500 fraud, 200501 duplicate, 200502 bank error
 * - Auth/infra: 401001 token, 401002 shop, 401003 suspended, 401004 package
 *   expired, 401005/401006 credit exhausted, 401007 IP not whitelisted,
 *   429000 rate limit, 500500/500503 server, 4xx body validation.
 *
 * Config: NK_SLIP2GO_BASE overrides the API origin (default
 * https://api.slip2go.com) for staging/testing.
 */

const SLIP2GO_BASE = process.env['NK_SLIP2GO_BASE'] ?? 'https://api.slip2go.com';

export interface Slip2GoVerifyInput {
  imageBase64: string;
  /** Exact order total in THB — enforced bank-side via checkAmount eq. */
  expectedAmountThb: number;
}

export interface Slip2GoSuccess {
  ok: true;
  ref: string;
  amountThb: number;
  receiverAccount: string | null;
  receiverName: string | null;
  transferAt: string | null;
  raw: Record<string, unknown>;
}

export type Slip2GoResult =
  | Slip2GoSuccess
  | {
      ok: false;
      code:
        | 'NOT_CONFIGURED'
        | 'UPSTREAM_ERROR'
        | 'QUOTA_EXCEEDED'
        | 'INVALID_SLIP'
        | 'AMOUNT_MISMATCH'
        | 'RECEIVER_MISMATCH';
      detail?: string;
    };

export function isSlip2GoEnabled(): boolean {
  return Boolean(process.env['NK_SLIP2GO_SECRET']);
}

interface Slip2GoReceiver {
  account?: { name?: string; bank?: { account?: string }; proxy?: { account?: string } };
}

interface Slip2GoBody {
  code?: string;
  message?: string;
  data?: {
    transRef?: string;
    amount?: number | string;
    dateTime?: string;
    receiver?: Slip2GoReceiver;
    [key: string]: unknown;
  };
}

/** Condition/auth/infra response codes → our result variants. */
function mapSlip2GoError(code: string, message: string): Slip2GoResult {
  switch (code) {
    case '200402':
      return { ok: false, code: 'AMOUNT_MISMATCH', detail: message };
    case '200401':
      return { ok: false, code: 'RECEIVER_MISMATCH', detail: message };
    case '200501':
      return { ok: false, code: 'INVALID_SLIP', detail: 'duplicate: ' + message };
    case '200500':
      return { ok: false, code: 'INVALID_SLIP', detail: 'fraud: ' + message };
    case '200404':
      return { ok: false, code: 'INVALID_SLIP', detail: message };
    case '401005':
    case '401006':
      return { ok: false, code: 'QUOTA_EXCEEDED', detail: message };
    case '401001':
    case '401002':
    case '401003':
    case '401004':
    case '401007':
      // Config/IP problems — behave like "feature not usable" so the
      // checkout falls back to the manual admin path with an honest message.
      return { ok: false, code: 'NOT_CONFIGURED', detail: message };
    default:
      return { ok: false, code: 'INVALID_SLIP', detail: message };
  }
}

/** Slip2Go wants a plain decimal string: no commas, no trailing zeros. */
function amountString(amountThb: number): string {
  const rounded = Math.round(amountThb * 100) / 100;
  return String(Number(rounded.toFixed(2)));
}

/** Verify one slip through Slip2Go. Never throws — every path returns a result. */
export async function verifySlip2Go(input: Slip2GoVerifyInput): Promise<Slip2GoResult> {
  const secret = process.env['NK_SLIP2GO_SECRET'];
  if (!secret) return { ok: false, code: 'NOT_CONFIGURED' };

  const body = {
    payload: {
      imageBase64: `data:image/png;base64,${input.imageBase64}`,
      checkCondition: {
        checkAmount: { type: 'eq', amount: amountString(input.expectedAmountThb) },
        checkDuplicate: true,
      },
    },
  };

  let res: Response;
  try {
    res = await fetch(`${SLIP2GO_BASE}/api/verify-slip/qr-base64/info`, {
      method: 'POST',
      headers: {
        Authorization: secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, code: 'UPSTREAM_ERROR', detail: 'network' };
  }

  let parsed: Slip2GoBody | null;
  try {
    parsed = (await res.json()) as Slip2GoBody;
  } catch {
    return { ok: false, code: 'UPSTREAM_ERROR', detail: `HTTP ${res.status}` };
  }

  const code = typeof parsed?.code === 'string' ? parsed.code : `HTTP_${res.status}`;
  const message = typeof parsed?.message === 'string' ? parsed.message : `HTTP ${res.status}`;

  if (res.status !== 200 || !code.startsWith('200') || !parsed?.data) {
    return mapSlip2GoError(code, message);
  }

  const d = parsed.data;
  const amount = Number(d.amount ?? NaN);
  if (!Number.isFinite(amount) || !d.transRef) {
    return { ok: false, code: 'INVALID_SLIP', detail: 'missing amount/transRef' };
  }
  // Slip2Go already enforced the amount via checkAmount (200402), but the
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
    receiverAccount:
      d.receiver?.account?.bank?.account ?? d.receiver?.account?.proxy?.account ?? null,
    receiverName: d.receiver?.account?.name ?? null,
    transferAt: d.dateTime ?? null,
    raw: d as unknown as Record<string, unknown>,
  };
}
