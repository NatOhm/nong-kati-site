/**
 * A stale tab must not promise a ใบกำกับภาษี the store stopped issuing
 * (2026-11-05).
 *
 * The switch protects four surfaces. Two are already pinned (`getTaxInvoiceConfig`
 * semantics in `tax-invoice-setting.test.ts`, the checkout form in
 * `checkout-tax-invoice-gate.test.tsx`). The server-side one was not: a page
 * left open before the switch flipped still POSTs `requiresTaxInvoice: true`,
 * and `POST /api/v1/orders` has to drop the flag instead of storing it — while
 * still creating the order, because the customer did buy something.
 *
 * The real handler runs; only its business dependencies are mocked.
 *   D1  switch off → createOrder receives `requiresTaxInvoice: false`,
 *   D2  switch on  → the same body keeps `requiresTaxInvoice: true`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const dbMock = vi.hoisted(() => ({ siteSetting: vi.fn() }));
const createOrderMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/notify', () => ({ notifyNewOrder: vi.fn(async () => undefined) }));
vi.mock('@/api/orders', () => ({
  createOrder: createOrderMock,
  orderErrorStatus: () => 400,
}));
vi.mock('@/api/customerAuth', () => ({ getCustomerFromToken: vi.fn(async () => null) }));
vi.mock('@/lib/data', () => ({
  getManualTransferInfo: vi.fn(async () => ({
    enabled: true,
    accountName: 'Shop',
    accountNumber: '1234567890',
  })),
}));
vi.mock('@/lib/paymentChannels', () => ({
  resolvePaymentChannels: vi.fn(async () => ['manual']),
  hasUsableChannel: vi.fn(() => true),
}));
vi.mock('@/lib/payment/omise', () => ({ isOpnConfigured: vi.fn(async () => false) }));
vi.mock('@/lib/db', () => ({ prisma: { siteSetting: { findUnique: dbMock.siteSetting } } }));

import { POST } from '@/app/api/v1/orders/route';

/** Unique suffix per test so the shared in-memory limiter never collides. */
let run = 0;

function orderReq(): NextRequest {
  return new NextRequest('http://localhost/api/v1/orders', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.9.${Math.floor(run / 250)}.${run % 250}`,
    },
    body: JSON.stringify({
      email: `drop-${run}@example.com`,
      items: [{ variantId: 'var-1', quantity: 1 }],
      requiresTaxInvoice: true,
      taxInvoiceName: 'บริษัท ทดสอบ จำกัด',
      taxInvoiceTaxId: '1234567890123',
    }),
  });
}

beforeEach(() => {
  run += 1;
  createOrderMock.mockReset();
  createOrderMock.mockImplementation(async () => ({
    order: {
      id: 'ord-tax',
      orderNumber: 'NK-2026-TAX1',
      customerEmail: 'drop@example.com',
      totalAmountThb: 250,
      items: [{ quantity: 1 }],
      status: 'pending_payment',
      paymentMethod: 'promptpay',
    },
  }));
});

describe('POST /api/v1/orders — สวิตช์ใบกำกับภาษี', () => {
  it('D1: switch off drops a stale requiresTaxInvoice request but still creates the order', async () => {
    dbMock.siteSetting.mockResolvedValue({ value: JSON.stringify({ enabled: false }) });

    const res = await POST(orderReq());

    expect(res.status).toBe(201);
    expect(createOrderMock).toHaveBeenCalledTimes(1);
    const [input] = createOrderMock.mock.calls[0] as [{ requiresTaxInvoice?: boolean }];
    expect(input.requiresTaxInvoice).toBe(false);
  });

  it('D2: switch on keeps the same request', async () => {
    dbMock.siteSetting.mockResolvedValue({ value: JSON.stringify({ enabled: true }) });

    const res = await POST(orderReq());

    expect(res.status).toBe(201);
    const [input] = createOrderMock.mock.calls[0] as [{ requiresTaxInvoice?: boolean }];
    expect(input.requiresTaxInvoice).toBe(true);
  });
});
