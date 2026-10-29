/** Slip2Go receiver enforcement (Fix C): the store's receiving account must
 * be checked bank-side via checkReceiver plus a local trailing-4 guard, so
 * a right-amount slip paid to someone else can never auto-confirm.
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

  it('fails closed locally when the 200000 slip went to another account', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(okResponse('xxx-x-x9999-x'));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25,
      expectedReceiverDigits: '1234565786',
    });
    expect(r).toMatchObject({ ok: false, code: 'RECEIVER_MISMATCH' });
    if (!r.ok) expect(r.detail).toContain('9999');
  });

  it('passes when trailing-4 matches and skips the guard on short masks', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock
      .mockResolvedValueOnce(okResponse('xxx-x-x5786-x'))
      .mockResolvedValueOnce(okResponse('xx'));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const match = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25,
      expectedReceiverDigits: '1234565786',
    });
    expect(match.ok).toBe(true);
    // Provider mask too short to compare (<4 digits) → guard skipped, trust provider.
    const short = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25,
      expectedReceiverDigits: '1234565786',
    });
    expect(short.ok).toBe(true);
  });
});
