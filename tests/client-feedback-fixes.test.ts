/** Client-feedback round (2026-10-01) — regression coverage:

  1. OUT_OF_STOCK at order creation: a persisted cart (or a direct
     POST /api/v1/orders) could order a variant whose stock had hit 0 —
     the UI disables the button but createOrder never re-checked. The
     route now maps OUT_OF_STOCK to HTTP 409.
  2. CSP img-src blob:: the admin slip viewer and the customer's upload
     preview render blob: URLs from URL.createObjectURL — the enforced
     production CSP blocked them (client screenshot: broken-image icon on
     every bill, desktop + mobile).
  3. Slip2Go adapter (provider #2, the client's merchant account): wire
     format per slip2go.com/guide — POST /api/verify-slip/qr-base64/info,
     Authorization: Bearer {secret} first (this merchant account requires
     Bearer empirically), one raw-secret retry after an auth rejection
     (HTTP 401/403 or provider 401xxx), checkCondition carries
     checkAmount eq + checkDuplicate; response codes mapped to our types.
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppGroupNode } from '@/lib/appGroups';

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
  delete process.env['NK_SLIP2GO_BASE'];
});

/** Narrow a Slip2Go result to the failure fields these assertions inspect. */
function failed(
  r: Awaited<ReturnType<(typeof import('@/lib/payment/slip2go'))['verifySlip2Go']>>,
): {
  code?: string | undefined;
  detail?: string | undefined;
} {
  return r.ok ? {} : { code: r.code, detail: r.detail };
}

// 1. Order-creation stock guard
describe('OUT_OF_STOCK guard', () => {
  it('is mapped to HTTP 409 (not 500) by the shared order error map', async () => {
    const { orderErrorStatus } = await import('@/api/orders');
    expect(orderErrorStatus('OUT_OF_STOCK')).toBe(409);
    expect(orderErrorStatus('CART_EMPTY')).toBe(400);
    expect(orderErrorStatus('SOMETHING_ELSE')).toBe(500);
  });

  it('createOrder rejects when variant stock is below the requested quantity', async () => {
    vi.doMock('@/lib/db', () => ({
      prisma: {
        productVariant: {
          findMany: vi.fn(async () => [
            {
              id: 'v1',
              stock: 0,
              isActive: true,
              price: 100,
              memberPrice: null,
              dealerPrice: null,
              label: 'D1',
              product: { name: 'Test Product' },
            },
          ]),
        },
        customer: { findUnique: vi.fn(async () => null) },
        $transaction: vi.fn(async (fn) => {
          const tx = {
            productVariant: {
              findMany: vi.fn(async () => [
                {
                  id: 'v1',
                  stock: 0,
                  isActive: true,
                  price: 100,
                  memberPrice: null,
                  dealerPrice: null,
                  label: 'D1',
                  product: { name: 'Test Product' },
                },
              ]),
            },
            customer: { findUnique: vi.fn(async () => null) },
            siteSetting: { findUnique: vi.fn(async () => null) },
            promotion: { findMany: vi.fn(async () => []) },
            order: {
              count: vi.fn(async () => 0),
              create: vi.fn(),
              findMany: vi.fn(async () => []),
            },
          };
          return typeof fn === 'function' ? await fn(tx) : null;
        }),
        order: { count: vi.fn(async () => 0), create: vi.fn() },
      },
    }));
    vi.doMock('@/lib/slipSecurity', () => ({
      mintSlipUploadToken: vi.fn(() => 'tok'),
    }));
    vi.doMock('@/lib/crypto/giftCode', () => ({
      encryptCode: vi.fn(),
      decryptCode: vi.fn(),
    }));

    const { createOrder } = await import('@/api/orders');
    await expect(
      createOrder({
        customerEmail: 'a@b.co',
        paymentMethod: 'promptpay',
        tosAccepted: true,
        tosVersion: '1.0',
        lineOptIn: false,
        marketingOptIn: false,
        requiresTaxInvoice: false,
        items: [{ variantId: 'v1', quantity: 1 }],
      }),
    ).rejects.toThrow('OUT_OF_STOCK');
  });

  it('createOrder still accepts an in-stock variant', async () => {
    vi.doMock('@/lib/db', () => ({
      prisma: {
        productVariant: {
          findMany: vi.fn(async () => [
            {
              id: 'v1',
              stock: 3,
              isActive: true,
              price: 100,
              memberPrice: null,
              dealerPrice: null,
              label: 'D1',
              product: { name: 'Test Product' },
            },
          ]),
          findUnique: vi.fn(async () => null),
        },
        customer: { findUnique: vi.fn(async () => null) },
        promotion: { findMany: vi.fn(async () => []) },
        siteSetting: { findUnique: vi.fn(async () => null) },
        $transaction: vi.fn(async (fn) => {
          const tx = {
            productVariant: {
              findMany: vi.fn(async () => [
                {
                  id: 'v1',
                  stock: 3,
                  isActive: true,
                  price: 100,
                  memberPrice: null,
                  dealerPrice: null,
                  label: 'D1',
                  product: { name: 'Test Product' },
                },
              ]),
            },
            customer: { findUnique: vi.fn(async () => null) },
            promotion: { findMany: vi.fn(async () => []) },
            siteSetting: { findUnique: vi.fn(async () => null) },
            order: {
              count: vi.fn(async () => 0),
              findMany: vi.fn(async () => []),
              create: vi.fn(async () => ({
                id: 'o1',
                orderNumber: 'NK-2026-000001',
                confirmationUuid: 'u1',
                customerEmail: 'a@b.co',
                customerPhone: null,
                status: 'pending_payment',
                paymentMethod: 'promptpay',
                subtotalThb: 100,
                vatAmountThb: 6.54,
                discountThb: 0,
                couponId: null,
                totalAmountThb: 100,
                requiresTaxInvoice: false,
                taxInvoiceName: null,
                taxInvoiceTaxId: null,
                manualFulfilmentReason: null,
                createdAt: new Date('2026-10-01T00:00:00Z'),
                items: [
                  {
                    id: 'i1',
                    variantId: 'v1',
                    productNameTh: 'Test Product',
                    productNameEn: 'Test Product',
                    skuCode: 'D1',
                    denominationThb: 100,
                    quantity: 1,
                    unitPriceThb: 100,
                    unitPriceExVat: 93.46,
                    unitVatAmount: 6.54,
                    lineTotalThb: 100,
                    deliveryStatus: 'pending',
                  },
                ],
              })),
            },
          };
          return typeof fn === 'function' ? await fn(tx) : null;
        }),
        order: {
          count: vi.fn(async () => 0),
          create: vi.fn(async () => ({
            id: 'o1',
            orderNumber: 'NK-2026-000001',
            confirmationUuid: 'u1',
            customerEmail: 'a@b.co',
            customerPhone: null,
            status: 'pending_payment',
            paymentMethod: 'promptpay',
            subtotalThb: 100,
            vatAmountThb: 6.54,
            discountThb: 0,
            couponId: null,
            totalAmountThb: 100,
            requiresTaxInvoice: false,
            taxInvoiceName: null,
            taxInvoiceTaxId: null,
            manualFulfilmentReason: null,
            createdAt: new Date('2026-10-01T00:00:00Z'),
            items: [
              {
                id: 'i1',
                variantId: 'v1',
                productNameTh: 'Test Product',
                productNameEn: 'Test Product',
                skuCode: 'D1',
                denominationThb: 100,
                quantity: 1,
                unitPriceThb: 100,
                unitPriceExVat: 93.46,
                unitVatAmount: 6.54,
                lineTotalThb: 100,
                deliveryStatus: 'pending',
              },
            ],
          })),
        },
      },
    }));
    vi.doMock('@/lib/slipSecurity', () => ({
      mintSlipUploadToken: vi.fn(() => 'tok'),
    }));
    const { createOrder } = await import('@/api/orders');
    const result = await createOrder({
      customerEmail: 'a@b.co',
      paymentMethod: 'promptpay',
      tosAccepted: true,
      tosVersion: '1.0',
      lineOptIn: false,
      marketingOptIn: false,
      requiresTaxInvoice: false,
      items: [{ variantId: 'v1', quantity: 1 }],
    });
    expect(result.order.orderNumber).toBe('NK-2026-000001');
  });
});

// 2. CSP blob: images
describe('CSP img-src allows blob:', () => {
  it('production middleware CSP includes blob: in img-src', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env['NK_CSP_UNSAFE_INLINE'];
    delete process.env['NK_CSP_REPORT_ONLY'];
    try {
      const { middleware } = await import('@/middleware');
      const { NextRequest } = await import('next/server');
      const res = await middleware(new NextRequest('https://x.test/', { method: 'GET' }));
      const csp = res.headers.get('Content-Security-Policy') ?? '';
      const imgDirective = /img-src[^;]*/.exec(csp)?.[0] ?? '';
      expect(imgDirective).toContain('blob:');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// 3. Slip2Go adapter
function slip2goOk(): Response {
  return new Response(
    JSON.stringify({
      code: '200000',
      message: 'Slip found.',
      data: {
        transRef: 'TR1234567890',
        amount: 25,
        dateTime: '2026-10-01T03:00:00.000Z',
        receiver: {
          account: {
            name: 'Nong Kati Shop',
            bank: { account: 'xxx-x-x1234-x' },
          },
        },
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('Slip2Go adapter', () => {
  it('is disabled without NK_SLIP2GO_SECRET', async () => {
    delete process.env['NK_SLIP2GO_SECRET'];
    const { isSlip2GoEnabled, verifySlip2Go } = await import('@/lib/payment/slip2go');
    expect(isSlip2GoEnabled()).toBe(false);
    const r = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25,
    });
    expect(r).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the secret in the Authorization header with eq-amount + duplicate check', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(slip2goOk());
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25,
    });
    expect(r).toMatchObject({
      ok: true,
      ref: 'TR1234567890',
      amountThb: 25,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toContain('/api/verify-slip/qr-base64/info');
    expect(init.headers['Authorization']).toBe('Bearer test-secret');
    const body = JSON.parse(init.body);
    expect(body.payload.checkCondition.checkAmount).toEqual({
      type: 'eq',
      amount: '25',
    });
    expect(body.payload.checkCondition.checkDuplicate).toBe(true);
    expect(String(body.payload.imageBase64).startsWith('data:image/png;base64,')).toBe(true);
  });

  it('sends amount "9" for a ฿9 order and accepts a "9.00" echo back (no false mismatch)', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    // Docs: no commas, no trailing zeros on the way out; the bank may still
    // echo a decimal string back — Number() must absorb it.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: '200000',
          message: 'Slip found.',
          data: {
            transRef: 'TR-9',
            amount: '9.00',
            receiver: { account: { name: 'Shop', bank: { account: 'xxx-x-x5786-x' } } },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 9 });
    expect(r).toMatchObject({ ok: true, amountThb: 9 });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const sent = JSON.parse(init.body) as {
      payload: { checkCondition: { checkAmount: { type: string; amount: string } } };
    };
    expect(sent.payload.checkCondition.checkAmount).toEqual({ type: 'eq', amount: '9' });
  });

  it('surfaces a proxy-only receiver (PromptPay id) as the receiver account', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    // Some slips carry the receiver only under receiver.account.proxy — the
    // route's receiverPolicy compare must still have something to check.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: '200000',
          message: 'Slip found.',
          data: {
            transRef: 'TR-PROXY',
            amount: 25,
            receiver: {
              account: {
                name: 'Shop',
                bank: null,
                proxy: { type: 'NATID', account: 'xxx-x-x5786-x' },
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25,
      expectedReceiverDigits: '1234565786',
    });
    expect(r).toMatchObject({ ok: true, receiverAccount: 'xxx-x-x5786-x' });
  });

  it('retries once with the raw secret when Bearer is rejected, then succeeds', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    // 1st attempt: HTTP 401 (scheme rejected). 2nd: the same endpoint under
    // the raw scheme answers with the real success payload.
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(slip2goOk());
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(r).toMatchObject({ ok: true, ref: 'TR1234567890' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    const second = fetchMock.mock.calls[1] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(first[1].headers['Authorization']).toBe('Bearer test-secret');
    expect(second[1].headers['Authorization']).toBe('test-secret');
  });

  it('maps a provider 401xxx code on the Bearer attempt to the raw retry too', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    const authFail = () =>
      new Response(JSON.stringify({ code: '401001', message: 'token ไม่ถูกต้อง' }), {
        status: 200,
      });
    fetchMock.mockResolvedValueOnce(authFail()).mockResolvedValueOnce(authFail());
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(failed(r).code).toBe('NOT_CONFIGURED');
    expect(fetchMock).toHaveBeenCalledTimes(2); // bearer then raw — both mapped
  });
});

describe('Slip2Go adapter — error mapping', () => {
  it('maps 200402 to AMOUNT_MISMATCH', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: '200402',
          message: 'ยอดโอนเงินไม่ตรงเงื่อนไข',
        }),
        { status: 200 },
      ),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25,
    });
    expect(r).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
  });

  it('maps 200501 to INVALID_SLIP (duplicate)', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: '200501',
          message: 'รายการนี้ถูกบันทึกไปแล้ว',
        }),
        { status: 200 },
      ),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25,
    });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SLIP' });
  });

  it('maps 200500 (fraud) to INVALID_SLIP with a fraud detail', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: '200500',
          message: 'การทำธุรกรรมนี้ไม่ถูกต้อง',
        }),
        { status: 200 },
      ),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({
      imageBase64: 'aGk=',
      expectedAmountThb: 25,
    });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SLIP' });
    expect(String(failed(r).detail)).toContain('fraud');
  });

  it('maps 401005/401006 to QUOTA_EXCEEDED and 401007 (IP) to NOT_CONFIGURED', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    // 401xxx codes are auth-family: each attempt (Bearer then raw) is queued
    // its own response, and BOTH must map to the same outcome.
    const code401 = (code: string): Response =>
      new Response(
        JSON.stringify({
          code,
          message: code === '401007' ? 'IP ไม่อยู่ใน allowlist' : 'เกินจำนวนที่อนุญาต',
        }),
        { status: 200 },
      );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');

    fetchMock.mockResolvedValueOnce(code401('401005')).mockResolvedValueOnce(code401('401005'));
    expect(
      failed(
        await verifySlip2Go({
          imageBase64: 'aGk=',
          expectedAmountThb: 25,
        }),
      ).code,
    ).toBe('QUOTA_EXCEEDED');

    fetchMock.mockResolvedValueOnce(code401('401006')).mockResolvedValueOnce(code401('401006'));
    expect(
      failed(
        await verifySlip2Go({
          imageBase64: 'aGk=',
          expectedAmountThb: 25,
        }),
      ).code,
    ).toBe('QUOTA_EXCEEDED');

    fetchMock.mockResolvedValueOnce(code401('401007')).mockResolvedValueOnce(code401('401007'));
    expect(
      failed(
        await verifySlip2Go({
          imageBase64: 'aGk=',
          expectedAmountThb: 25,
        }),
      ).code,
    ).toBe('NOT_CONFIGURED');
  });

  it('treats a 5xx / non-JSON body as UPSTREAM_ERROR', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 502 }));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    expect(
      failed(
        await verifySlip2Go({
          imageBase64: 'aGk=',
          expectedAmountThb: 25,
        }),
      ).code,
    ).toBe('UPSTREAM_ERROR');
  });

  it('never labels provider/infra failures as a bad slip (client feedback 19 Oct)', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const check = async (body: unknown, status = 200): Promise<string | undefined> => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
      return failed(await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 })).code;
    };

    // Rate limit → retryable RATE_LIMITED (was: INVALID_SLIP).
    expect(await check({ code: '429000', message: 'คำขอเกินจำนวนที่กำหนด' })).toBe('RATE_LIMITED');
    // Provider outage → UPSTREAM_ERROR (was: INVALID_SLIP).
    expect(await check({ code: '500503', message: 'ระบบขัดข้อง' })).toBe('UPSTREAM_ERROR');
    // Bank-side error is transient, not a bad slip.
    expect(await check({ code: '200502', message: 'ธนาคารขัดข้อง' })).toBe('UPSTREAM_ERROR');
    // Undocumented 2xxxxx condition code stays slip-side.
    expect(await check({ code: '200403', message: 'วันที่ไม่ตรง' })).toBe('INVALID_SLIP');
    // HTTP 429 without a code field → RATE_LIMITED, not INVALID_SLIP.
    expect(await check({ message: 'Too many requests' }, 429)).toBe('RATE_LIMITED');
    // Truly unknown code → upstream; the customer's slip is never accused.
    expect(await check({ code: '999999', message: 'wat' })).toBe('UPSTREAM_ERROR');
  });

  it('re-checks the amount locally even on a 200000 success', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(slip2goOk());
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    expect(
      failed(
        await verifySlip2Go({
          imageBase64: 'aGk=',
          expectedAmountThb: 99,
        }),
      ).code,
    ).toBe('AMOUNT_MISMATCH');
  });
});

// The slip-verify route's provider dispatch (Slip2Go first, SlipOK fallback)
// moved to tests/slip-flow.test.ts, which mocks the full order/provider chain.

describe('storefront main-category groups', () => {
  function child(id: string, name: string): AppGroupNode {
    return { id, name, slug: id, children: [] };
  }
  function group(id: string, name: string, children: AppGroupNode[]): AppGroupNode {
    return { id, name, slug: id, children };
  }

  it('keeps a configured main group instead of flattening it away', async () => {
    const { splitAppGroups } = await import('@/lib/appGroups');
    const roots = [group('movie-series', 'แอปดูหนัง/ซีรีส์', [child('wetv', 'WeTV')])];
    const result = splitAppGroups(roots);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.id).toBe('movie-series');
    expect(result.looseApps).toHaveLength(0);
  });

  it('routes a childless category to the loose bucket so a flat catalogue still renders', async () => {
    const { splitAppGroups } = await import('@/lib/appGroups');
    const childlessRoot = group('empty-group', 'ว่างเปล่า', []);
    const result = splitAppGroups([childlessRoot]);
    expect(result.groups).toHaveLength(0);
    expect(result.looseApps.map((c) => c.id)).toEqual(['empty-group']);
  });

  it('never discards a category that has no difference from an app', async () => {
    const { splitAppGroups } = await import('@/lib/appGroups');
    const emptyCategory = group('no-difference', 'เหมือนแอป', []);
    const result = splitAppGroups([emptyCategory]);
    expect(result.groups).toHaveLength(0);
    expect(result.looseApps.map((c) => c.id)).toEqual(['no-difference']);
  });

  it('loses and duplicates nothing: every root appears exactly once', async () => {
    const { splitAppGroups } = await import('@/lib/appGroups');
    const roots = [
      group('movie-series', 'แอปดูหนัง/ซีรีส์', [child('wetv', 'WeTV')]),
      child('spotify', 'Spotify'),
      group('music', 'แอปดนตรี', [child('spotify-premium', 'Spotify Premium')]),
    ];
    const result = splitAppGroups(roots);
    expect([...result.groups, ...result.looseApps].map((c) => c.id).sort()).toEqual([
      'movie-series',
      'music',
      'spotify',
    ]);
  });

  it('preserves the caller ordering in both buckets', async () => {
    const { splitAppGroups } = await import('@/lib/appGroups');
    const roots = [
      group('g1', 'กลุ่ม 1', [child('c1', 'c1')]),
      child('a1', 'a1'),
      group('g2', 'กลุ่ม 2', [child('c2', 'c2')]),
      child('a2', 'a2'),
    ];
    const result = splitAppGroups(roots);
    expect(result.groups.map((c) => c.id)).toEqual(['g1', 'g2']);
    expect(result.looseApps.map((c) => c.id)).toEqual(['a1', 'a2']);
  });

  it('the homepage consumes the helper rather than re-flattening the tree', async () => {
    const { splitAppGroups } = await import('@/lib/appGroups');
    const roots = [group('g1', 'กลุ่ม 1', [child('c1', 'c1')]), child('a1', 'a1')];
    const result = splitAppGroups(roots);
    expect(result.groups.map((c) => c.id)).toEqual(['g1']);
    expect(result.looseApps.map((c) => c.id)).toEqual(['a1']);
  });

  it('still handles a root whose children field reads as undefined at runtime', async () => {
    const { splitAppGroups } = await import('@/lib/appGroups');
    const brokenRoot: {
      id: string;
      name: string;
      type: 'category';
      children?: readonly ReturnType<typeof child>[];
    } = {
      id: 'orphan',
      name: 'เดียว',
      type: 'category',
    };
    const result = splitAppGroups([
      brokenRoot as unknown as Parameters<typeof splitAppGroups>[0][number],
    ]);
    expect(result.groups).toHaveLength(0);
    expect(result.looseApps.map((c) => c.id)).toEqual(['orphan']);
  });
});
