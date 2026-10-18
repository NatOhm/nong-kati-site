/**
 * Slip2Go account-info probe — the no-purchase connectivity check
 * (GET {base}/api/account/info), adapted from the merchant dashboard's
 * REST API example.
 *
 * Why this gate exists:
 * - The dashboard example ships broken (syntax errors) and contradicts the
 *   public guide on auth: guide says the RAW secret, dashboard examples say
 *   `Bearer {secret}`. The probe tries raw first and Bearer only after an
 *   auth rejection; this suite pins that exact behaviour so the fallback
 *   can never silently invert or double-fire on network errors.
 * - The secret must never appear in ANY result (same rule as the Discord
 *   webhook probe): results carry quota/status only.
 * - Unconfigured must not fetch at all (mirrors sendTestDiscordMessage).
 *
 * What this does NOT claim: that slip verification, amount/receiver
 * matching, duplicate detection, or checkout works — a real slip through
 * the customer flow is still required for that.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getSlip2GoAccountInfo } from '@/lib/payment/slip2go';

const SECRET = 'unit-test-secret-value-must-never-leak-9f3a';

let fetchMock: ReturnType<typeof vi.fn>;

const jsonRes = (status: number, body: unknown): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as unknown as Response;

const authHeaderOf = (callIndex: number): string => {
  const call = fetchMock.mock.calls[callIndex] as unknown as [string, RequestInit];
  return (call[1].headers as Record<string, string>)['Authorization'] as string;
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  process.env['NK_SLIP2GO_SECRET'] = SECRET;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env['NK_SLIP2GO_SECRET'];
});

describe('getSlip2GoAccountInfo', () => {
  it('does not fetch when the secret is not configured', async () => {
    delete process.env['NK_SLIP2GO_SECRET'];
    const result = await getSlip2GoAccountInfo();
    expect(result).toEqual({ ok: false, code: 'NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the raw-secret scheme first (public guide) and maps account fields', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRes(200, {
        code: '200001',
        message: 'Get Info Success',
        data: {
          shopName: 'Nongkati store',
          package: 'BASIC-1',
          packageExpiredDate: '04 Feb 2027',
          tokenLimit: 5000,
          tokenRemaining: 577,
          creditRemaining: 0,
          estimatedQuotaSlip: 2885,
          quotaQrLimit: 480,
          quotaQrRemaining: 480,
        },
      }),
    );

    const result = await getSlip2GoAccountInfo();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authScheme).toBe('raw');
      expect(result.account.shopName).toBe('Nongkati store');
      expect(result.account.package).toBe('BASIC-1');
      expect(result.account.tokenRemaining).toBe(577);
      expect(result.account.tokenLimit).toBe(5000);
      expect(result.account.creditRemaining).toBe(0);
      expect(result.account.estimatedQuotaSlip).toBe(2885);
    }
    // First request must carry the RAW secret — never 'Bearer …'.
    expect(authHeaderOf(0)).toBe(SECRET);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once with the Bearer scheme when raw is rejected (dashboard examples)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(200, { code: '401001', message: 'invalid token' }))
      .mockResolvedValueOnce(
        jsonRes(200, { code: '200001', data: { shopName: 'x', tokenRemaining: 577 } }),
      );

    const result = await getSlip2GoAccountInfo();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.authScheme).toBe('bearer');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeaderOf(0)).toBe(SECRET);
    expect(authHeaderOf(1)).toBe(`Bearer ${SECRET}`);
  });

  it('treats a bare HTTP 401 (even a non-JSON body) as an auth rejection', async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response)
      .mockResolvedValueOnce(
        jsonRes(200, { code: '200001', data: { tokenRemaining: 577 } }),
      );

    const result = await getSlip2GoAccountInfo();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.authScheme).toBe('bearer');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports AUTH_FAILED only when BOTH schemes are rejected', async () => {
    fetchMock.mockResolvedValue(jsonRes(401, { code: '401001', message: 'token invalid' }));
    const result = await getSlip2GoAccountInfo();
    expect(result).toMatchObject({ ok: false, code: 'AUTH_FAILED' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports UPSTREAM_ERROR on a network failure without a Bearer retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await getSlip2GoAccountInfo();
    expect(result).toMatchObject({ ok: false, code: 'UPSTREAM_ERROR', detail: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps non-auth provider errors to UPSTREAM_ERROR with the provider code', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { code: '429000', message: 'rate limited' }));
    const result = await getSlip2GoAccountInfo();
    expect(result).toMatchObject({ ok: false, code: 'UPSTREAM_ERROR', detail: '429000' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never leaks the secret in any result shape', async () => {
    fetchMock.mockResolvedValue(jsonRes(401, { code: '401001' }));
    const failed = await getSlip2GoAccountInfo();
    expect(JSON.stringify(failed)).not.toContain(SECRET);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      jsonRes(200, { code: '200001', data: { shopName: 'x', tokenRemaining: 1 } }),
    );
    const ok = await getSlip2GoAccountInfo();
    expect(JSON.stringify(ok)).not.toContain(SECRET);
  });
});
