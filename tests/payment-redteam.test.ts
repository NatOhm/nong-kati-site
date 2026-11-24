/**
 * Red-team suite: the slip checker and payment pipeline attacked on purpose
 * (audit 2026-11-24, second pass).
 *
 * Every test here starts from the attacker's side: what would I send, or cause
 * a provider to say, to get goods without paying, pay less than the order, or
 * make one payment settle twice? The aim is a concrete counterexample, not a
 * restatement of the implementation.
 *
 * The real provider adapters run against a stubbed `fetch`, so the payloads
 * below are what the shop would actually consume from Slip2Go / SlipOK. The
 * flow tests stub the adapters and attack the ORDERING: a provider that says
 * "paid" for a slip paid to someone else, a fallback that must not launder a
 * refusal, a delay that must not buy a second credit.
 *
 * Amount rounding, sub-satang values and the tolerance boundary are pinned in
 * both directions on purpose: 8.99 and 9.01 must reject for a ฿9.00 order,
 * 8.996/9.004 are accepted by the documented 0.005 tolerance, and 8.994 is not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  on2go: true,
  onOk: true,
  verifySlip2Go: vi.fn(),
  verifySlip: vi.fn(),
  real2go: undefined as undefined | typeof import('@/lib/payment/slip2go').verifySlip2Go,
  realOk: undefined as undefined | typeof import('@/lib/payment/slipok').verifySlip,
}));

// Keep the real adapter functions reachable (they are what consumes a hostile
// provider payload) while the flow sees stubs it can drive per test.
vi.mock('@/lib/payment/slip2go', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payment/slip2go')>();
  h.real2go = actual.verifySlip2Go;
  return {
    ...actual,
    isSlip2GoEnabled: () => h.on2go,
    verifySlip2Go: h.verifySlip2Go,
  };
});
vi.mock('@/lib/payment/slipok', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payment/slipok')>();
  h.realOk = actual.verifySlip;
  return {
    ...actual,
    isSlipVerificationEnabled: () => h.onOk,
    verifySlip: h.verifySlip,
  };
});

import { nextCasStamp } from '@/lib/casStamp';
import { describeFetchError } from '@/lib/payment/fetchFailure';
import { checkReceiverMatch } from '@/lib/payment/receiverPolicy';
import { parseSlipAmount } from '@/lib/payment/slipAmount';
import { verifySlipImage } from '@/lib/payment/slipVerifyFlow';
import { sniffSlipMime } from '@/lib/slipStore';

const fetchMock = vi.fn();

const STORE_ACCOUNT = '199-1-73578-6'; // digits 1991735786
/** What a genuine slip to that account prints (tail masked, live NK-186). */
const REAL_TAIL_MASK = 'xxx-x-x3578-x';
/** What a Bangkok Bank receipt for the same account prints (middle masked). */
const REAL_BBK_MASK = '199-1-xxx786';

/** A Slip2Go-shaped success body. `amount` is deliberately `unknown`. */
function slip2goBody(
  amount: unknown,
  opts: { receiver?: string | null; code?: string; transRef?: string | null } = {},
): Response {
  const receiver = opts.receiver === undefined ? REAL_TAIL_MASK : opts.receiver;
  return new Response(
    JSON.stringify({
      code: opts.code ?? '200200',
      message: 'ok',
      data: {
        transRef: opts.transRef === undefined ? 'TRX-1' : opts.transRef,
        amount,
        dateTime: '2026-11-24T10:00:00+07:00',
        receiver: receiver === null ? undefined : { account: { bank: { account: receiver }, name: 'ร้าน' } },
      },
    }),
    { status: 200 },
  );
}

function slipOkBody(amount: unknown, receiver: string | null = REAL_TAIL_MASK): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        transRef: 'OK-TRX-1',
        amount,
        date_time: '2026-11-24T10:00:00+07:00',
        receiver: receiver === null ? undefined : { account: { value: receiver } },
      },
    }),
    { status: 200 },
  );
}

const ok2go = (receiver: string | null = REAL_TAIL_MASK) => ({
  ok: true as const,
  ref: 'TRX-1',
  amountThb: 9,
  receiverAccount: receiver,
  receiverName: 'ร้าน',
  transferAt: null,
  raw: {},
  providerCode: '200200',
});

const okOk = (receiver: string | null = REAL_TAIL_MASK) => ({
  ok: true as const,
  ref: 'OK-TRX-1',
  amountThb: 9,
  receiverAccount: receiver,
  receiverName: 'ร้าน',
  transferAt: null,
  raw: {},
});

beforeEach(() => {
  // reset(), not clearAllMocks(): a queued `mockResolvedValueOnce` that a test
  // never consumed (a refusal path that never asked the provider) would leak
  // into the NEXT test and make it assert against the wrong answer.
  h.verifySlip2Go.mockReset();
  h.verifySlip.mockReset();
  vi.clearAllMocks();
  h.on2go = true;
  h.onOk = false;
  process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
  process.env['NK_SLIP_OK_KEY'] = 'test-key';
  process.env['NK_SLIP_OK_BRANCH'] = 'test-branch';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

// ─── A. Pay less than the order ────────────────────────────────────────────

describe('ATTACK: make a ฿9.00 order settle for a different amount', () => {
  const check = async (amount: unknown) => {
    fetchMock.mockResolvedValueOnce(slip2goBody(amount));
    const r = await h.real2go!({ imageBase64: 'aGk=', expectedAmountThb: 9 });
    return r;
  };

  it('rejects one satang short (8.99) — no rounding in my favour', async () => {
    expect(await check('8.99')).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
  });

  it('rejects one satang over (9.01) — overpaying does not buy the order either', async () => {
    expect(await check('9.01')).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
  });

  it('pins the documented 0.005 tolerance in BOTH directions: 8.996 ok, 8.994 not', async () => {
    // Sub-satang values cannot occur on a Thai transfer (2 decimals), so this
    // is the boundary of a rule that only ever sees exact satang in practice.
    expect(await check('8.996')).toMatchObject({ ok: true });
    expect(await check('8.994')).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
  });

  it('rejects a hex literal instead of coercing 0x09 into 9', async () => {
    // `Number('0x09') === 9`: before the strict parser this CONFIRMED the order.
    expect(await check('0x09')).toMatchObject({ ok: false, code: 'INVALID_SLIP' });
  });

  it('rejects exponent notation instead of coercing 1e1 into 10', async () => {
    fetchMock.mockResolvedValueOnce(slip2goBody('1e1'));
    const r = await h.real2go!({ imageBase64: 'aGk=', expectedAmountThb: 10 });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SLIP' });
  });

  it('rejects a comma decimal (9,00) rather than reading it as 9', async () => {
    expect(await check('9,00')).toMatchObject({ ok: false, code: 'INVALID_SLIP' });
  });

  it('rejects Thai digits (๙.๐๐) rather than guessing', async () => {
    expect(await check('๙.๐๐')).toMatchObject({ ok: false, code: 'INVALID_SLIP' });
  });

  it('rejects a negative amount', async () => {
    expect(await check('-9')).toMatchObject({ ok: false, code: 'INVALID_SLIP' });
  });

  it('rejects a missing amount and a self-consistent but empty transfer', async () => {
    fetchMock.mockResolvedValueOnce(slip2goBody(undefined));
    expect(await h.real2go!({ imageBase64: 'aGk=', expectedAmountThb: 9 })).toMatchObject({
      ok: false,
      code: 'INVALID_SLIP',
    });
    fetchMock.mockResolvedValueOnce(slip2goBody(9, { transRef: null }));
    expect(await h.real2go!({ imageBase64: 'aGk=', expectedAmountThb: 9 })).toMatchObject({
      ok: false,
      code: 'INVALID_SLIP',
    });
  });

  it('the SlipOK fallback refuses the same hex literal', async () => {
    fetchMock.mockResolvedValueOnce(slipOkBody('0x09'));
    const r = await h.realOk!({ imageBase64: 'aGk=', expectedAmountThb: 9 });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SLIP' });
  });

  it('parseSlipAmount accepts real provider shapes and nothing else', () => {
    expect(parseSlipAmount(9)).toBe(9);
    expect(parseSlipAmount(9.5)).toBe(9.5);
    expect(parseSlipAmount('9.00')).toBe(9);
    expect(parseSlipAmount(' 9.00 ')).toBe(9);
    for (const bad of ['0x09', '1e1', '9,00', '๙', '-9', '+9', '', ' ', 'NaN', 'Infinity', null, undefined, {}, true]) {
      expect(Number.isNaN(parseSlipAmount(bad)), String(bad)).toBe(true);
    }
    expect(Number.isNaN(parseSlipAmount(Number.NaN))).toBe(true);
    expect(Number.isNaN(parseSlipAmount(Number.POSITIVE_INFINITY))).toBe(true);
  });
});

// ─── B. Slip accepted for the wrong receiver ───────────────────────────────

describe('ATTACK: get a slip to MY account accepted as the shop', () => {
  const flow = (storeAccount: string | null = STORE_ACCOUNT) =>
    verifySlipImage({ imageBase64: 'aGk=', expectedAmountThb: 9, storeAccountNumber: storeAccount });

  it('a different account (zeros) is refused and NOT laundered through the fallback', async () => {
    h.verifySlip2Go.mockResolvedValueOnce(ok2go('xxx-x-x0000-x'));
    h.onOk = true; // a second provider is configured — must not be asked
    const r = await flow();
    expect(r).toMatchObject({ ok: false, code: 'RECEIVER_MISMATCH' });
    expect(h.verifySlip).not.toHaveBeenCalled();
    // Last four of a wrong account is all the detail may ever carry.
    expect(String(r.ok === false && r.detail)).toContain('0000');
    expect(String(r.ok === false && r.detail)).not.toContain('73578');
  });

  it('the genuine Bangkok Bank middle mask is accepted (the false-reject side)', async () => {
    h.verifySlip2Go.mockResolvedValueOnce(ok2go(REAL_BBK_MASK));
    expect(await flow()).toMatchObject({ ok: true, receiverAccount: REAL_BBK_MASK });
  });

  it('a fully masked receiver (no digits) is REFUSED, not trusted', async () => {
    h.verifySlip2Go.mockResolvedValueOnce(ok2go('xxx-x-xxxx-x'));
    expect(await flow()).toMatchObject({ ok: false, code: 'RECEIVER_MISSING' });
  });

  it('a missing receiver is refused', async () => {
    h.verifySlip2Go.mockResolvedValueOnce(ok2go(null));
    expect(await flow()).toMatchObject({ ok: false, code: 'RECEIVER_MISSING' });
  });

  it('a 3-digit receiver (too short to compare) is refused', async () => {
    h.verifySlip2Go.mockResolvedValueOnce(ok2go('123'));
    expect(await flow()).toMatchObject({ ok: false, code: 'RECEIVER_MISSING' });
  });

  it('the fallback provider cannot pass a wrong receiver either', async () => {
    h.verifySlip2Go.mockResolvedValueOnce({ ok: false, code: 'UPSTREAM_ERROR' });
    h.onOk = true;
    h.verifySlip.mockResolvedValueOnce(okOk('xxx-x-x4242-x'));
    expect(await flow()).toMatchObject({ ok: false, code: 'RECEIVER_MISMATCH' });
  });

  it('a store account too short to compare cannot auto-confirm anything', async () => {
    h.verifySlip2Go.mockResolvedValueOnce(ok2go());
    const r = await flow('12');
    expect(r).toMatchObject({ ok: false, code: 'RECEIVER_UNCONFIGURED' });
    expect(h.verifySlip2Go).not.toHaveBeenCalled();
  });

  it('a mask of the wrong LENGTH is a different account, not a guess', () => {
    // Longer than the store account: not the same account by construction.
    expect(checkReceiverMatch(STORE_ACCOUNT, 'xxx-x-x35781-x')).toMatchObject({ ok: false });
    // Same length, wrong digit in a visible position.
    expect(checkReceiverMatch(STORE_ACCOUNT, '199-1-xxx787')).toMatchObject({ ok: false });
    // And a wrong 4-digit run is not contained anywhere in the store digits.
    expect(checkReceiverMatch(STORE_ACCOUNT, 'x-xxx-x0000-x')).toMatchObject({ ok: false });
    // (A shorter mask whose digits ARE a real window of the store account is
    // accepted by the containment rule on purpose — pinned in the policy test.)
    expect(checkReceiverMatch(STORE_ACCOUNT, 'x-xxxx-x-x3578-x')).toMatchObject({ ok: true });
  });

  it('KNOWN POLICY HOLE (needs a product decision): another bank, same visible digits', async () => {
    // The provider only ever reports a MASK, so "paid to a Kasikorn account
    // whose tail is also 3578" is indistinguishable from the shop's own slip.
    // The bank-side checkReceiver did not fire on live probes, so nothing here
    // can tell them apart. This test records the accepted behaviour; it is a
    // policy hole, not a bug this suite can close — see the report.
    h.verifySlip2Go.mockResolvedValueOnce(ok2go(REAL_TAIL_MASK));
    expect(await flow()).toMatchObject({ ok: true });
  });
});

// ─── C. Provider ordering and laundering ───────────────────────────────────

describe('ATTACK: exploit the fallback order or a slow/odd provider answer', () => {
  const flow = () =>
    verifySlipImage({ imageBase64: 'aGk=', expectedAmountThb: 9, storeAccountNumber: STORE_ACCOUNT });

  it('a fraud-shaped payload that carries `data` is still not a pass', async () => {
    // 200500 = fraudulent transaction. The code decides, not the payload shape.
    fetchMock.mockResolvedValueOnce(slip2goBody(9, { code: '200500' }));
    const r = await h.real2go!({ imageBase64: 'aGk=', expectedAmountThb: 9 });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SLIP' });
  });

  it('a delay does NOT buy a second provider call', async () => {
    h.verifySlip2Go.mockResolvedValueOnce({ ok: false, code: 'SLIP_DELAYED' });
    h.onOk = true;
    const r = await flow();
    expect(r).toMatchObject({ ok: false, code: 'SLIP_DELAYED' });
    // Both providers read the same bank; the second call cannot answer sooner.
    expect(h.verifySlip).not.toHaveBeenCalled();
  });

  it('a transient provider failure DOES fall back, and the fallback can confirm', async () => {
    h.verifySlip2Go.mockResolvedValueOnce({ ok: false, code: 'QUOTA_EXCEEDED' });
    h.onOk = true;
    h.verifySlip.mockResolvedValueOnce(okOk());
    expect(await flow()).toMatchObject({ ok: true, verifiedBy: 'slipok:auto' });
  });

  it('records WHY it fell back, not just that it did', async () => {
    // The attempt row keeps only the last provider's answer, so the first
    // provider's reason has to reach the log or it is gone (audit 2026-11-24).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      h.verifySlip2Go.mockResolvedValueOnce({ ok: false, code: 'QUOTA_EXCEEDED' });
      h.onOk = true;
      h.verifySlip.mockResolvedValueOnce(okOk());
      await flow();
      expect(warn).toHaveBeenCalledWith(
        '[slip-verify] falling back to the other provider',
        expect.objectContaining({ from: 'slip2go', code: 'QUOTA_EXCEEDED' }),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('an OUTAGE (UPSTREAM_ERROR) falls back too — a dead provider must not dead-end a paid slip', async () => {
    h.verifySlip2Go.mockResolvedValueOnce({ ok: false, code: 'UPSTREAM_ERROR' });
    h.onOk = true;
    h.verifySlip.mockResolvedValueOnce(okOk(REAL_BBK_MASK));
    const r = await flow();
    expect(r).toMatchObject({ ok: true, verifiedBy: 'slipok:auto' });
    // …and the fallback's receiver answer still had to pass the policy.
    expect(h.verifySlip).toHaveBeenCalledTimes(1);
  });

  it('a definitive refusal never falls back (no second opinion for sale)', async () => {
    h.verifySlip2Go.mockResolvedValueOnce({ ok: false, code: 'AMOUNT_MISMATCH' });
    h.onOk = true;
    expect(await flow()).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
    expect(h.verifySlip).not.toHaveBeenCalled();
  });

  it('both providers failing yields a refusal, never a pass', async () => {
    h.verifySlip2Go.mockResolvedValueOnce({ ok: false, code: 'UPSTREAM_ERROR' });
    h.onOk = true;
    h.verifySlip.mockResolvedValueOnce({ ok: false, code: 'UPSTREAM_ERROR' });
    expect(await flow()).toMatchObject({ ok: false });
  });

  it('a slow first provider that eventually fails still ends in a refusal', async () => {
    h.verifySlip2Go.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: false, code: 'UPSTREAM_ERROR' }), 5)),
    );
    h.onOk = true;
    h.verifySlip.mockResolvedValueOnce({ ok: false, code: 'UPSTREAM_ERROR' });
    expect(await flow()).toMatchObject({ ok: false, code: 'UPSTREAM_ERROR' });
  });
});

// ─── D. Auth-scheme retry buying a second paid request ─────────────────────

describe('ATTACK: make the adapter spend a second provider call on a refusal', () => {
  const one = async (status: number, body: string) => {
    fetchMock.mockResolvedValueOnce(new Response(body, { status }));
    const r = await h.real2go!({ imageBase64: 'aGk=', expectedAmountThb: 9 });
    return { r, calls: fetchMock.mock.calls.length };
  };

  it('HTTP 401 carrying a quota code costs ONE request', async () => {
    const { r, calls } = await one(401, JSON.stringify({ code: '401005', message: 'no credit' }));
    expect(r).toMatchObject({ ok: false, code: 'QUOTA_EXCEEDED' });
    expect(calls).toBe(1);
  });

  it('HTTP 403 carrying an IP refusal costs ONE request', async () => {
    const { r, calls } = await one(403, JSON.stringify({ code: '401007', message: 'ip' }));
    expect(r).toMatchObject({ ok: false });
    expect(calls).toBe(1);
  });

  it('a bare 401 with a JSON body (no code) still retries exactly once with the raw secret', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(slip2goBody(9));
    const r = await h.real2go!({ imageBase64: 'aGk=', expectedAmountThb: 9 });
    expect(r).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = fetchMock.mock.calls[1] as unknown as [string, { headers: Record<string, string> }];
    expect(second[1].headers['Authorization']).toBe('test-secret');
  });

  it('an unparseable 401 (a proxy\'s HTML page) does NOT retry — it is not an answer', async () => {
    // The auth retry needs a parsed response to judge; an HTML body is a
    // transport problem, so the money path must not spend a second call
    // guessing. The flow still falls back to the other provider on
    // UPSTREAM_ERROR, which is where a real outage is handled once.
    fetchMock.mockResolvedValueOnce(new Response('<html>unauthorized</html>', { status: 401 }));
    const r = await h.real2go!({ imageBase64: 'aGk=', expectedAmountThb: 9 });
    expect(r).toMatchObject({ ok: false, code: 'UPSTREAM_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ─── E. MIME sniffing bypass ───────────────────────────────────────────────

describe('ATTACK: hand the provider a file that lies about itself', () => {
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('a PNG/JPEG polyglot is declared by its real magic, not by its JPEG body', () => {
    const polyglot = Buffer.concat([PNG_MAGIC, Buffer.from([0xff, 0xd8, 0xff, 0xe0])]);
    expect(sniffSlipMime(polyglot)).toBe('image/png');
  });

  it('a JPEG is sniffed as JPEG and declared that way end to end', async () => {
    // The type must come from the BYTES, not from a constant or the client's
    // claim: sniff → adapter → data URI, the same chain the route runs.
    const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQ==', 'base64');
    expect(sniffSlipMime(jpeg)).toBe('image/jpeg');
    fetchMock.mockResolvedValueOnce(slip2goBody(9));
    await h.real2go!({ imageBase64: jpeg.toString('base64'), expectedAmountThb: 9, imageMime: sniffSlipMime(jpeg) });
    const sent = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    ) as { payload: { imageBase64: string } };
    expect(sent.payload.imageBase64.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('garbage bytes are labelled image/jpeg (a guess) — and a guess cannot confirm anything', async () => {
    // The sniff's default is a guess; the provider decodes the bytes and is the
    // one that refuses. Worth pinning so nobody "fixes" it by trusting a label.
    expect(sniffSlipMime(Buffer.from('not an image at all'))).toBe('image/jpeg');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: '200500', message: 'invalid image' }), { status: 200 }),
    );
    const r = await h.real2go!({ imageBase64: 'bm90IGFuIGltYWdl', expectedAmountThb: 9 });
    expect(r).toMatchObject({ ok: false });
  });

  it('production IGNORES the e2e base override (a stray hook cannot redirect slips)', async () => {
    // A leftover override in an env file once pointed the built server at a dead
    // loopback port: every real slip read as "provider outage". In production
    // the hook must not exist at all, so customer images (and the API key) can
    // never be sent to another host.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SLIP_VERIFY_BASE_OVERRIDE', 'http://127.0.0.1:9');
    fetchMock.mockResolvedValueOnce(slipOkBody(9));
    try {
      await h.realOk!({ imageBase64: 'aGk=', expectedAmountThb: 9 });
      const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
      expect(url).toBe('https://api.slipok.com/api/line/apikey/test-branch');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('outside production the stub override is still honoured (the e2e hook works)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('SLIP_VERIFY_BASE_OVERRIDE', 'http://127.0.0.1:45171');
    fetchMock.mockResolvedValueOnce(slipOkBody(9));
    try {
      await h.realOk!({ imageBase64: 'aGk=', expectedAmountThb: 9 });
      const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
      expect(url).toBe('http://127.0.0.1:45171/test-branch');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('SlipOK receives the sniffed type and a matching extension, never a .png over JPEG', async () => {
    fetchMock.mockResolvedValueOnce(slipOkBody(9));
    await h.realOk!({ imageBase64: '/9j/4AAQ', expectedAmountThb: 9, imageMime: 'image/jpeg' });
    const form = (fetchMock.mock.calls[0] as unknown as [string, { body: FormData }])[1].body;
    const file = form.get('files') as File;
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toBe('slip.jpg');
  });
});

// ─── F. A broken request must not look like a provider outage ─────────────

describe('ATTACK: make a local failure look like the provider being down', () => {
  it('describes a failed provider call with its errno, so an outage is distinguishable', () => {
    // Found on the built artifact (2026-11-24): a stale test hook pointed SlipOK
    // at a dead loopback port, every real slip became "ระบบตรวจสลิปขัดข้อง", and the
    // log said only `network` — identical to a provider outage.
    const refused = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    expect(describeFetchError(refused)).toBe('TypeError/ECONNREFUSED: fetch failed');
    expect(describeFetchError(new Error('boom'))).toBe('Error: boom');
    expect(describeFetchError('a string was thrown')).toContain('non-error thrown');
  });
});

// ─── G. Stale / non-monotonic claim state ──────────────────────────────────

describe('ATTACK: reuse a claim token that did not move', () => {
  it('nextCasStamp is strictly greater than the token it replaces', () => {
    // The window this closes: two writers inside one millisecond. With
    // `new Date()` the stamp can EQUAL the token, so both match the CAS.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(1_000));
      const stamp = nextCasStamp(new Date(1_000));
      expect(stamp.getTime()).toBeGreaterThan(1_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a token from the FUTURE (clock skew) is moved forward, never backwards', () => {
    // A stamp that lands before the token leaves the old token valid, so the
    // next runner's CAS matches the row a previous runner already claimed.
    const future = new Date(Date.now() + 60_000);
    expect(nextCasStamp(future).getTime()).toBeGreaterThan(future.getTime());
    expect(nextCasStamp(new Date(Number.NaN)).getTime()).toBeGreaterThan(0);
  });

  it('real time still produces a stamp in the future of the token', () => {
    const before = new Date();
    const stamp = nextCasStamp(before);
    expect(stamp.getTime()).toBeGreaterThan(before.getTime());
  });
});
