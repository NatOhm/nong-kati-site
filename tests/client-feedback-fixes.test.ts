/**
 * Client-feedback round (2026-10-01) — regression coverage:
 *
 *  1. OUT_OF_STOCK at order creation: a persisted cart (or a direct
 *     POST /api/v1/orders) could order a variant whose stock had hit 0 —
 *     the UI disables the button but createOrder never re-checked. The
 *     route now maps OUT_OF_STOCK to HTTP 409.
 *  2. CSP img-src blob:: the admin slip viewer and the customer's upload
 *     preview render blob: URLs from URL.createObjectURL — the enforced
 *     production CSP blocked them (client screenshot: broken-image icon on
 *     every bill, desktop + mobile).
 *  3. Slip2Go adapter (provider #2, the client's merchant account): wire
 *     format per slip2go.com/guide — POST /api/verify-slip/qr-base64/info,
 *     Authorization header = the secret directly, checkCondition carries
 *     checkAmount eq + checkDuplicate; response codes mapped to our types.
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
  delete process.env['NK_SLIP2GO_BASE'];
});

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
            productVariant: { findMany: vi.fn(async () => [
              { id: 'v1', stock: 0, isActive: true, price: 100,
                memberPrice: null, dealerPrice: null, label: 'D1',
                product: { name: 'Test Product' } } ]) },
            customer: { findUnique: vi.fn(async () => null) },
            siteSetting: { findUnique: vi.fn(async () => null) },
            promotion: { findMany: vi.fn(async () => []) },
            order: { count: vi.fn(async () => 0), create: vi.fn() },
          };
          return typeof fn === 'function' ? await fn(tx) : null;
        }),
        order: { count: vi.fn(async () => 0), create: vi.fn() },
      },
    }));
    vi.doMock('@/lib/slipSecurity', () => ({
      mintSlipUploadToken: vi.fn(() => 'tok'),
    }));
    vi.doMock('@/lib/crypto/giftCode', () => ({ encryptCode: vi.fn(), decryptCode: vi.fn() }));

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
            productVariant: { findMany: vi.fn(async () => [
              {
                id: 'v1', stock: 3, isActive: true, price: 100,
                memberPrice: null, dealerPrice: null, label: 'D1',
                product: { name: 'Test Product' },
              },
            ]) },
            customer: { findUnique: vi.fn(async () => null) },
            promotion: { findMany: vi.fn(async () => []) },
            siteSetting: { findUnique: vi.fn(async () => null) },
            order: {
              count: vi.fn(async () => 0),
              create: vi.fn(async () => ({
                id: 'o1', orderNumber: 'NK-2026-000001', confirmationUuid: 'u1',
                customerEmail: 'a@b.co', customerPhone: null, status: 'pending_payment',
                paymentMethod: 'promptpay', subtotalThb: 100, vatAmountThb: 6.54,
                discountThb: 0, couponId: null, totalAmountThb: 100,
                requiresTaxInvoice: false, taxInvoiceName: null, taxInvoiceTaxId: null,
                manualFulfilmentReason: null,
                createdAt: new Date('2026-10-01T00:00:00Z'),
                items: [{
                  id: 'i1', variantId: 'v1', productNameTh: 'Test Product',
                  productNameEn: 'Test Product', skuCode: 'D1', denominationThb: 100,
                  quantity: 1, unitPriceThb: 100, unitPriceExVat: 93.46,
                  unitVatAmount: 6.54, lineTotalThb: 100, deliveryStatus: 'pending',
                }],
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
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(r).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the secret in the Authorization header with eq-amount + duplicate check', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(slip2goOk());
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(r).toMatchObject({ ok: true, ref: 'TR1234567890', amountThb: 25 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toContain('/api/verify-slip/qr-base64/info');
    expect(init.headers['Authorization']).toBe('test-secret');
    const body = JSON.parse(init.body);
    expect(body.payload.checkCondition.checkAmount).toEqual({ type: 'eq', amount: '25' });
    expect(body.payload.checkCondition.checkDuplicate).toBe(true);
    expect(String(body.payload.imageBase64).startsWith('data:image/png;base64,')).toBe(true);
  });
});

describe('Slip2Go adapter — error mapping', () => {
  it('maps 200402 to AMOUNT_MISMATCH', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: '200402', message: 'ยอดโอนเงินไม่ตรงเงื่อนไข' }), {
        status: 200,
      }),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(r).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
  });

  it('maps 200501 to INVALID_SLIP (duplicate)', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: '200501', message: 'สลิปซ้ำ' }), { status: 200 }),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SLIP' });
  });

  it('maps 200500 (fraud) to INVALID_SLIP with a fraud detail', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: '200500', message: 'สลิปปลอม' }), { status: 200 }),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(r).toMatchObject({
      ok: false,
      code: 'INVALID_SLIP',
      detail: expect.stringContaining('fraud'),
    });
  });

  it('maps 401005/401006 to QUOTA_EXCEEDED and 401007 (IP) to NOT_CONFIGURED', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    for (const code of ['401005', '401006', '401007']) {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ code, message: 'x' }), {
          status: code === '401007' ? 401 : 200,
        }),
      );
      const { verifySlip2Go } = await import('@/lib/payment/slip2go');
      const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
      expect(r.ok).toBe(false);
      if (code === '401007') {
        expect(r).toMatchObject({ code: 'NOT_CONFIGURED' });
      } else {
        expect(r).toMatchObject({ code: 'QUOTA_EXCEEDED' });
      }
    }
  });

  it('treats a 5xx / non-JSON body as UPSTREAM_ERROR', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(r).toMatchObject({ ok: false, code: 'UPSTREAM_ERROR' });
  });

  it('re-checks the amount locally even on a 200000 success', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: '200000',
          message: 'Slip found.',
          data: { transRef: 'TR1', amount: 999 },
        }),
        { status: 200 },
      ),
    );
    const { verifySlip2Go } = await import('@/lib/payment/slip2go');
    const r = await verifySlip2Go({ imageBase64: 'aGk=', expectedAmountThb: 25 });
    expect(r).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
  });
});

describe('Slip2Go dispatch in the slip-verify route', () => {
  it('calls Slip2Go (not SlipOK) when its secret is set', async () => {
    process.env['NK_SLIP2GO_SECRET'] = 'test-secret';
    fetchMock.mockResolvedValueOnce(slip2goOk());
    vi.doMock('@/lib/db', () => ({
      prisma: {
        paymentAttempt: {
          findFirst: vi.fn(async () => ({
            id: 'pa1',
            status: 'pending',
            paymentMethod: 'promptpay',
          })),
          update: vi.fn(async () => ({})),
        },
        productVariant: {
          findMany: vi.fn(async () => []),
          findUnique: vi.fn(async () => null),
        },
        $transaction: vi.fn(async (fn: unknown) => {
          const tx = {
            paymentAttempt: { update: vi.fn(async () => ({})) },
            order: { update: vi.fn(async () => ({})) },
          };
          return typeof fn === 'function' ? await (fn as (t: typeof tx) => Promise<unknown>)(tx) : null;
        }),
      },
    }));
    vi.doMock('@/api/orders', () => ({
      getOrderById: vi.fn(async () => ({
        id: 'o1',
        status: 'pending_payment',
        totalAmountThb: 25,
        orderNumber: 'NK-2026-000001',
        confirmationUuid: 'u1',
        items: [{ variantId: 'v1' }],
      })),
      claimOrderForConfirmation: vi.fn(async () => ({ claimed: true })),
    }));
    vi.doMock('@/lib/notify', () => ({
      getNotificationSettings: vi.fn(async () => ({})),
      notifyPaymentConfirmed: vi.fn(),
      notifyStockLow: vi.fn(),
    }));
    vi.doMock('@/lib/fulfilment', () => ({
      fulfilOrder: vi.fn(async () => ({ success: true, codes: [] })),
      scheduleOutboxDrain: vi.fn(async () => undefined),
    }));
    vi.doMock('@/lib/paymentReconciliation', () => ({
      recordPaymentReconciliation: vi.fn(),
    }));
    vi.doMock('@/lib/rateLimit', () => ({
      getClientIp: vi.fn(() => '1.2.3.4'),
      checkRateLimit: vi.fn(async () => ({ allowed: true })),
    }));
    vi.doMock('@/lib/slipSecurity', () => ({
      isValidSlipUploadToken: vi.fn(() => true),
    }));
    vi.doMock('@/lib/payment/slipok', () => ({
      isSlipVerificationEnabled: vi.fn(() => false),
      verifySlip: vi.fn(),
    }));

    const { POST } = await import('@/app/api/v1/payments/slip-verify/route');
    const { NextRequest } = await import('next/server');
    const form = new FormData();
    form.set('orderId', 'o1');
    form.set('token', 'tok');
    form.set('slip', new File([new Uint8Array([1, 2, 3])], 'slip.png', { type: 'image/png' }));
    const req = new NextRequest('https://x.test/api/v1/payments/slip-verify', {
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string };
    expect(body.status).toBe('confirmed');
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('slip2go');
  });
});

// 4. Main categories never reached the storefront.
describe('storefront main-category groups', () => {
  const child = (id: string, name: string) => ({ id, name, slug: id, children: [] });
  const group = (id: string, name: string, kids: ReturnType<typeof child>[]) => ({
    id,
    name,
    slug: id,
    icon: null,
    children: kids,
  });

  it('keeps a configured main group instead of flattening it away', async () => {
    const { splitAppGroups } = await import('@/lib/appGroups');
    const movie = group('movie-series', 'แอปดูหนัง/ซีรีส์', [
      child('wetv', 'WeTV'),
      child('bilibili', 'Bilibili'),
    ]);
    const { groups } = splitAppGroups([movie, child('loose', 'ไม่มีกลุ่ม')]);

    // The regression: the old flatMap returned [wetv, bilibili, loose] and the
    // group itself was discarded, so no heading could ever render.
    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe('แอปดูหนัง/ซีรีส์');
    expect(groups[0]?.children.map((c) => c.name)).toEqual(['WeTV', 'Bilibili']);
  });

  it('routes a childless category to the loose bucket so a flat catalogue still renders', async () => {
    const { splitAppGroups } = await import('@/lib/appGroups');
    const { groups, looseApps } = splitAppGroups([child('netflix', 'Netflix')]);
    expect(groups).toHaveLength(0);
    expect(looseApps.map((c) => c.name)).toEqual(['Netflix']);
  });

  it('loses and duplicates nothing: every root appears exactly once', async () => {
    const { splitAppGroups } = await import('@/lib/appGroups');
    const roots = [
      group('movie-series', 'แอปดูหนัง/ซีรีส์', [child('wetv', 'WeTV')]),
      child('spotify', 'Spotify'),
      group('music', 'แอปดนตรี', [child('spotify-premium', 'Spotify Premium')]),
    ];
    const { groups, looseApps } = splitAppGroups(roots);
    expect([...groups, ...looseApps].map((c) => c.id).sort()).toEqual([
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
    const { groups, looseApps } = splitAppGroups(roots);
    expect(groups.map((c) => c.id)).toEqual(['g1', 'g2']);
    expect(looseApps.map((c) => c.id)).toEqual(['a1', 'a2']);
  });

  it('the homepage consumes the helper rather than re-flattening the tree', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(
      new URL('../src/app/page.tsx', import.meta.url),
      'utf8',
    ) as string;
    expect(src).toContain('splitAppGroups(categories)');
    // The flattening that discarded every main group must not come back.
    expect(src).not.toMatch(/flatMap\(\s*\(root\)/);
  });
});
