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
 * - Header: Authorization: Bearer {NK_SLIP2GO_SECRET}, Content-Type:
 *   application/json. The public guide shows the raw secret while the
 *   merchant dashboard's examples show `Bearer` — and this merchant account
 *   EMPIRICALLY requires Bearer (the account-info probe accepts both, the
 *   verify endpoint only Bearer), so verify sends Bearer first and retries
 *   once with the raw secret after an auth rejection (401/403 or 401xxx),
 *   mirroring the probe's fallback so either scheme works.
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
 * https://connect.slip2go.com — the live host: api.slip2go.com 404s every
 * merchant path, so dev/staging without the env var must not be dead on
 * arrival). Production sets NK_SLIP2GO_BASE explicitly in the Plesk panel.
 */

import { normalizeAccountDigits } from './receiverPolicy';

const SLIP2GO_BASE = process.env['NK_SLIP2GO_BASE'] ?? 'https://connect.slip2go.com';

export interface Slip2GoVerifyInput {
  imageBase64: string;
  /** Exact order total in THB — enforced bank-side via checkAmount eq. */
  expectedAmountThb: number;
  /**
   * Store receiving account, digits only (no spaces/dashes) — forwarded
   * bank-side as checkReceiver. This is a belt only: the provider did NOT
   * enforce it in the 2026-10-30 live proof, so the authoritative compare
   * is `checkReceiverMatch` in receiverPolicy.ts, applied by the route after
   * any provider succeeds. Omit when the store account is not configured:
   * amount/duplicate checks still apply, receiver enforcement is skipped.
   */
  expectedReceiverDigits?: string;
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
        | 'RATE_LIMITED'
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
  const detail = `${code}: ${message}`;
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
    case '200502':
      // Bank-side error — transient upstream trouble, not a bad slip.
      return { ok: false, code: 'UPSTREAM_ERROR', detail };
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
    case '429000':
      return { ok: false, code: 'RATE_LIMITED', detail };
    case '500500':
    case '500503':
      return { ok: false, code: 'UPSTREAM_ERROR', detail };
    default:
      // Never accuse the customer's slip for provider/infra problems
      // (client feedback 19 Oct: rate limits, 5xx and body-validation
      // errors all surfaced as "สลิปไม่ถูกต้อง/อ่านไม่ได้/ถูกใช้ไปแล้ว").
      // Only the documented slip-condition codes (2xxxxx) may call the
      // slip itself invalid; anything else is ours or the provider's fault.
      if (code.startsWith('200')) return { ok: false, code: 'INVALID_SLIP', detail };
      if (code.startsWith('401')) return { ok: false, code: 'NOT_CONFIGURED', detail };
      if (code.startsWith('429') || code === 'HTTP_429') {
        return { ok: false, code: 'RATE_LIMITED', detail };
      }
      return { ok: false, code: 'UPSTREAM_ERROR', detail };
  }
}

/** Slip2Go wants a plain decimal string: no commas, no trailing zeros. */
function amountString(amountThb: number): string {
  const rounded = Math.round(amountThb * 100) / 100;
  return String(Number(rounded.toFixed(2)));
}

/** True when the response is an auth rejection worth retrying with the other scheme. */
function isAuthRejection(httpStatus: number, providerCode: string): boolean {
  return httpStatus === 401 || httpStatus === 403 || /^401\d*$/.test(providerCode);
}

/** Verify one slip through Slip2Go. Never throws — every path returns a result. */
export async function verifySlip2Go(input: Slip2GoVerifyInput): Promise<Slip2GoResult> {
  const secret = process.env['NK_SLIP2GO_SECRET'];
  if (!secret) return { ok: false, code: 'NOT_CONFIGURED' };

  const receiverDigits = normalizeAccountDigits(input.expectedReceiverDigits);
  const body = {
    payload: {
      imageBase64: `data:image/png;base64,${input.imageBase64}`,
      checkCondition: {
        checkAmount: { type: 'eq', amount: amountString(input.expectedAmountThb) },
        checkDuplicate: true,
        // Provider-side receiver enforcement (200401 on mismatch, mapped
        // to RECEIVER_MISMATCH). Sent only when the store account is
        // configured — Slip2Go checks only the keys present, so omitting
        // this changes nothing else.
        ...(receiverDigits !== '' ? { checkReceiver: [{ accountNumber: receiverDigits }] } : {}),
      },
    },
  };

  // Bearer first (what this merchant account requires empirically), raw
  // fallback after an auth rejection only — one retry, same result mapping.
  for (let attempt = 0; attempt < 2; attempt++) {
    const authorization = attempt === 0 ? `Bearer ${secret}` : secret;
    let res: Response;
    try {
      res = await fetch(`${SLIP2GO_BASE}/api/verify-slip/qr-base64/info`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
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
      if (attempt === 0 && isAuthRejection(res.status, code)) continue;
      return mapSlip2GoError(code, message);
    }

    return verifySuccess(parsed, input);
  }
  // Unreachable: the loop returns on every path except an auth rejection on
  // attempt 0, and the last attempt always returns.
  return { ok: false, code: 'NOT_CONFIGURED' };
}

function verifySuccess(parsed: Slip2GoBody, input: Slip2GoVerifyInput): Slip2GoResult {
  const code = typeof parsed.code === 'string' ? parsed.code : '';
  const message = typeof parsed.message === 'string' ? parsed.message : '';
  if (!parsed.data) return mapSlip2GoError(code || 'HTTP_200', message || 'HTTP 200');

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
  // Receiver reporting only — no account comparison here. The masked
  // receiver (bank account, else proxy id) is surfaced so the route can run
  // the single receiverPolicy compare after ANY provider succeeds (SlipOK
  // has no receiver condition either). See receiverPolicy.ts.
  const gotAccount =
    d.receiver?.account?.bank?.account ?? d.receiver?.account?.proxy?.account ?? null;
  return {
    ok: true,
    ref: d.transRef,
    amountThb: amount,
    receiverAccount: gotAccount,
    receiverName: d.receiver?.account?.name ?? null,
    transferAt: d.dateTime ?? null,
    raw: d as unknown as Record<string, unknown>,
  };
}

// ─── Account-info probe (no-purchase connectivity check) ─────────────

/** Sanitized account summary — the ONLY shape that leaves this module. */
export interface Slip2GoAccountSummary {
  shopName: string | null;
  package: string | null;
  packageExpiredDate: string | null;
  tokenLimit: number | null;
  tokenRemaining: number | null;
  creditRemaining: number | null;
  estimatedQuotaSlip: number | null;
  quotaQrLimit: number | null;
  quotaQrRemaining: number | null;
}

export type Slip2GoAccountResult =
  | { ok: true; account: Slip2GoAccountSummary; authScheme: 'raw' | 'bearer' }
  | {
      ok: false;
      code: 'NOT_CONFIGURED' | 'AUTH_FAILED' | 'UPSTREAM_ERROR';
      detail?: string;
    };

interface AccountInfoBody {
  code?: string;
  message?: string;
  data?: Record<string, unknown>;
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function mapAccount(data: Record<string, unknown>): Slip2GoAccountSummary {
  return {
    shopName: strOrNull(data['shopName']),
    package: strOrNull(data['package']),
    packageExpiredDate: strOrNull(data['packageExpiredDate']),
    tokenLimit: numOrNull(data['tokenLimit']),
    tokenRemaining: numOrNull(data['tokenRemaining']),
    creditRemaining: numOrNull(data['creditRemaining']),
    estimatedQuotaSlip: numOrNull(data['estimatedQuotaSlip']),
    quotaQrLimit: numOrNull(data['quotaQrLimit']),
    quotaQrRemaining: numOrNull(data['quotaQrRemaining']),
  };
}

type AccountAttempt =
  | { kind: 'ok'; account: Slip2GoAccountSummary }
  | { kind: 'auth' }
  | { kind: 'error'; detail: string };

async function fetchAccountInfoOnce(
  secret: string,
  scheme: 'raw' | 'bearer',
): Promise<AccountAttempt> {
  let res: Response;
  try {
    res = await fetch(`${SLIP2GO_BASE}/api/account/info`, {
      method: 'GET',
      headers: {
        Authorization: scheme === 'bearer' ? `Bearer ${secret}` : secret,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { kind: 'error', detail: 'network' };
  }
  // Auth verdict from the status alone, before parsing — a rejecting proxy
  // may answer HTML, and a 401 is still an auth failure we must retry past.
  if (res.status === 401 || res.status === 403) return { kind: 'auth' };
  let parsed: AccountInfoBody | null;
  try {
    parsed = (await res.json()) as AccountInfoBody;
  } catch {
    return { kind: 'error', detail: `HTTP ${res.status}` };
  }
  const code = typeof parsed?.code === 'string' ? parsed.code : '';
  if (code.startsWith('401')) return { kind: 'auth' }; // 401001/2/3/4/7…
  if (res.status !== 200 || !code.startsWith('200') || !parsed?.data) {
    return { kind: 'error', detail: code || `HTTP ${res.status}` };
  }
  return { kind: 'ok', account: mapAccount(parsed.data) };
}

/**
 * GET {SLIP2GO_BASE}/api/account/info — READ-ONLY account/package/quota
 * probe: the "no-purchase connectivity check" (is the configured secret
 * accepted, how much API quota is left). Officially documented at
 * slip2go.com/guide/rest-api/account/info as an informational call — no
 * verification credit is charged per the docs.
 *
 * What it deliberately does NOT establish: that slip verification,
 * amount/receiver matching, duplicate detection, or production checkout
 * works — those need a real slip through the customer flow.
 *
 * Auth-scheme note: the public guide documents the RAW secret as the
 * `Authorization` value (no "Bearer"), while the merchant dashboard's
 * copy-paste examples show `Bearer {secret}`. We try raw first, then
 * Bearer only after an auth rejection, and REPORT which scheme worked —
 * so this free informational call settles the contradiction empirically
 * instead of guessing. The secret never appears in any result.
 */
export async function getSlip2GoAccountInfo(): Promise<Slip2GoAccountResult> {
  const secret = process.env['NK_SLIP2GO_SECRET'];
  if (!secret) return { ok: false, code: 'NOT_CONFIGURED' };

  const first = await fetchAccountInfoOnce(secret, 'raw');
  if (first.kind === 'ok') return { ok: true, account: first.account, authScheme: 'raw' };
  if (first.kind === 'error') {
    return { ok: false, code: 'UPSTREAM_ERROR', detail: first.detail };
  }

  const second = await fetchAccountInfoOnce(secret, 'bearer');
  if (second.kind === 'ok') return { ok: true, account: second.account, authScheme: 'bearer' };
  if (second.kind === 'error') {
    return { ok: false, code: 'UPSTREAM_ERROR', detail: second.detail };
  }
  return { ok: false, code: 'AUTH_FAILED', detail: 'rejected with both raw and Bearer schemes' };
}
