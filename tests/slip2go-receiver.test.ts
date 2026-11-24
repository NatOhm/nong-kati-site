/** Slip2Go receiver plumbing: the store's receiving account is sent
 * bank-side via checkReceiver (digits only). The AUTHORITATIVE compare is
 * receiverPolicy.checkReceiverMatch, applied by the slip-verify route after
 * any provider succeeds — it lives here only so a change to the rule has one
 * home (tests/receiver-policy.test.ts + tests/slip-flow.test.ts cover it).
 * Mocks fetch only — no network, no DB.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realFetch = globalThis.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env['NK_SLIP2GO_SECRET'];
});

function okResponse(receiverAccount: string | null): Response {
  return new Response(
    JSON.stringify({
      code: '200000',
      message: 'Slip found.',
      data: {
        transRef: 'TR1234567890',
        amount: 25,
        dateTime: '2026-10-01T03:00:00.000Z',
        receiver:
          receiverAccount === null
            ? null
            : { account: { name: 'Shop', bank: { account: receiverAccount } } },
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function sentBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
  return JSON.parse(init.body) as Record<string, unknown>;
}

function checkCondition(): Record<string, unknown> {
  const payload = sentBody()['payload'] as Record<string, unknown>;
  return payload['checkCondition'] as Record<string, unknown>;
}

describe('Slip2Go receiver enforcement', () => {
  it('sends checkReceiver with digits-only account (strips dashes/spaces)', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(okResponse('xxx-x-x5786-x'));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25,
      expectedReceiverDigits: '123-456 5786',
    });
    expect(r).toMatchObject({ ok: true, ref: 'TR1234567890' });
    expect(checkCondition()['checkReceiver']).toEqual([{ accountNumber: '1234565786' }]);
  });

  it('omits checkReceiver entirely when the store account is not configured', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(okResponse('xxx-x-x5786-x'));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(r.ok).toBe(true);
    expect(checkCondition()).not.toHaveProperty('checkReceiver');
  });

  it('maps provider 200401 to RECEIVER_MISMATCH', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: '200401', message: 'บัญชีผู้รับไม่ตรง' }), {
        status: 200,
      }),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25,
      expectedReceiverDigits: '1234565786',
    });
    expect(r).toMatchObject({ ok: false, code: 'RECEIVER_MISMATCH' });
  });

  it('surfaces the provider receiver verbatim for the route to compare', async () => {
    // The 2026-10-30 live proof: Slip2Go answered 200200 for a slip paid to
    // another account, so this module reports what it saw and does NOT
    // decide accept/reject — receiverPolicy (route) does that for every
    // provider, SlipOK included.
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(okResponse('xxx-x-x9999-x'));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25,
      expectedReceiverDigits: '1234565786',
    });
    expect(r).toMatchObject({ ok: true, receiverAccount: 'xxx-x-x9999-x' });
  });
});

describe('Slip2Go amount guard', () => {
  it('rejects when the order total is not a finite number, instead of accepting anything', async () => {
    // Audit 2026-11-24: the guard was `Math.abs(amount - expected) > 0.005`,
    // which is FALSE when either side is NaN — so an order row whose total did
    // not parse confirmed a slip of ANY amount. The comparison is now total:
    // an uncomparable amount is a mismatch, never a pass.
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(okResponse('xxx-x-x5786-x'));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: Number.NaN,
      expectedReceiverDigits: '1234565786',
    });
    expect(r).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
  });

  it('still accepts an exact match at the satang tolerance', async () => {
    // The fix must not turn a real match into a reject: tolerance is unchanged.
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(okResponse('xxx-x-x5786-x'));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25.004,
      expectedReceiverDigits: '1234565786',
    });
    expect(r).toMatchObject({ ok: true });
  });
});

describe('Slip2Go auth-scheme retry', () => {
  it('does NOT re-send the request for a quota refusal (401005)', async () => {
    // Audit 2026-11-24: `/^401\d*$/` also matched the non-credential refusals, so
    // a spent quota produced a second identical outbound request for an answer
    // that could not change.
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: '401005', message: 'โควต้าหมด' }), { status: 200 }),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(r).toMatchObject({ ok: false, code: 'QUOTA_EXCEEDED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('also does not re-send for 401006 or 401007 (credit / IP)', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    for (const code of ['401006', '401007']) {
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ code, message: 'refused' }), { status: 200 }),
      );
      const { verifySlip2Go } = await import('@/lib/payment/slip2go');
      const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
      expect(r.ok, code).toBe(false);
      expect(fetchMock, code).toHaveBeenCalledTimes(1);
    }
  });

  it('still retries once with the raw secret when the TOKEN is rejected', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: '401001', message: 'Authentication Token Mismatch' }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(okResponse('xxx-x-x5786-x'));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(r).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = fetchMock.mock.calls[1] as unknown as [string, { headers: Record<string, string> }];
    // The retry is the RAW secret — the whole point of the fallback.
    expect(second[1].headers['Authorization']).toBe('test-secret');
  });
});

describe('Slip2Go image MIME', () => {
  it('declares the caller-provided type in the data URI', async () => {
    // The route sniffs the bytes (a slip is usually a JPEG screenshot), so the
    // declaration must follow the real format rather than a hardcoded PNG.
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(okResponse('xxx-x-x5786-x'));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    await verifySlip2Go({
      imageBase64: '/9j/4AAQ',
      expectedAmountThb: 25,
      imageMime: 'image/jpeg',
    });
    const payload = sentBody()['payload'] as Record<string, unknown>;
    expect(payload['imageBase64']).toBe('data:image/jpeg;base64,/9j/4AAQ');
  });
});

/**
 * A condition code is the answer, even when the provider echoes a `data`
 * object beside it. Live 23 พ.ย. 2569 (NK-2026-000237): a `200404` for a real
 * ฿67 slip carried an empty `data`, `verifySuccess` ran, and its
 * missing-amount/transRef guard reported INVALID_SLIP — so the customer read
 * "สลิปไม่ถูกต้อง" for a slip the bank had merely not published yet, and the
 * delayed re-check never ran (it keys off SLIP_DELAYED).
 */
describe('Slip2Go verdict codes win over an echoed payload', () => {
  function codeResponse(code: string, data?: unknown): Response {
    return new Response(JSON.stringify({ code, message: 'condition', ...(data ? { data } : {}) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('maps 200404 + empty data to SLIP_DELAYED, not INVALID_SLIP', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(codeResponse('200404', {}));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 67 });
    expect(r).toMatchObject({ ok: false, code: 'SLIP_DELAYED', providerCode: '200404' });
  });

  it('never confirms a 200404 even if its data looks complete', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(
      codeResponse('200404', {
        transRef: 'TR1234567890',
        amount: 67,
        receiver: { account: { bank: { account: 'xxx-x-x5786-x' } } },
      }),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 67 });
    expect(r).toMatchObject({ ok: false, code: 'SLIP_DELAYED' });
  });

  it('maps 200500 + data to INVALID_SLIP (fraud is still a verdict)', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(codeResponse('200500', { transRef: 'TR1', amount: 67 }));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 67 });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SLIP', providerCode: '200500' });
  });

  it('never confirms an undocumented 200xxx, however complete its data looks', async () => {
    // A confirmed order delivers codes, so "the payload looks fine" cannot be
    // the test — the code has to be one we know means money. A new success
    // code surfaces as INVALID_SLIP + providerCode (admin-confirmable, the
    // slip is stored) instead of silently handing out goods.
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(
      codeResponse('200777', {
        transRef: 'TR1234567890',
        amount: 67,
        receiver: { account: { bank: { account: 'xxx-x-x5786-x' } } },
      }),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 67 });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SLIP', providerCode: '200777' });
  });

  it('still confirms 200200 — the success code this account really answers', async () => {
    // The allowlist must not be narrower than observed reality: 200200 is
    // undocumented but live-verified (30 ต.ค. and 1 พ.ย. 2569).
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: '200200',
          message: 'Slip found.',
          data: {
            transRef: 'TR1234567890',
            amount: 25,
            receiver: { account: { bank: { account: 'xxx-x-x5786-x' } } },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(r).toMatchObject({ ok: true, ref: 'TR1234567890', providerCode: '200200' });
  });
});
