/**
 * Production-review round-2 fixes (report at faa515a).
 *
 * HIGH-2: an externally-verified payment must never be stranded because
 * coupon state changed after the QR was issued — claimOrderForConfirmation
 * honors the charged snapshot when paidExternally (usage recorded, no
 * capacity throw).
 *
 * HIGH-3: order creation gates on the UNION of channels (Opn configured OR
 * manual transfer enabled) — Opn-only environments were locked out by the
 * legacy manual-transfer requirement.
 *
 * CRITICAL-1: every inline JSON-LD block (Breadcrumb included) serializes
 * through serializeJsonLd — a static guard keeps new bare JSON.stringify
 * script blocks from appearing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NK_JWT_SECRET'] = 'reviewfixes-test-secret-0123456789abcdef0123456789abcdef';

const { prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    order: { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    coupon: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    couponRedemption: { create: vi.fn(), count: vi.fn() },
  };
  const prismaMock = {
    order: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    coupon: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    couponRedemption: { create: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
  };
  return { prismaMock, txMock };
});

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
  txMock.order.updateMany.mockResolvedValue({ count: 1 });
  txMock.order.findUnique.mockResolvedValue({ couponId: null, customerId: null });
  txMock.order.update.mockResolvedValue({});
});

import { claimOrderForConfirmation } from '@/api/orders';

function seedClaimOrder(couponId: string | null, customerId: string | null): void {
  // Call 1: the claim helper's coupon/customer ref read (select projection);
  // Call 2: the final include read that maps to the returned Order shape.
  let calls = 0;
  txMock.order.findUnique.mockImplementation(async () => {
    calls += 1;
    if (calls === 1) return { couponId, customerId };
    return {
      id: 'ord-1',
      orderNumber: 'NK-9001',
      status: 'payment_confirmed',
      paymentMethod: 'promptpay',
      subtotalThb: 100,
      vatAmountThb: 7,
      discountThb: 0,
      totalAmountThb: 100,
      requiresTaxInvoice: false,
      taxInvoiceName: null,
      manualFulfilmentReason: null,
      createdAt: new Date(),
      items: [],
    };
  });
}

describe('HIGH-2 — paid-external claims honor the coupon snapshot', () => {
  it('inactive coupon + paidExternally → confirmation succeeds and logs, never throws', async () => {
    seedClaimOrder('cpn-1', 'cust-1');
    txMock.coupon.findUnique.mockResolvedValue({
      usageLimit: 10,
      perCustomerLimit: 1,
      isActive: false,
    });

    const claimed = await claimOrderForConfirmation('ord-1', txMock, { paidExternally: true });
    expect(claimed).not.toBeNull();
  });

  it('inactive coupon + strict (wallet/admin) → COUPON_NO_LONGER_VALID still throws', async () => {
    seedClaimOrder('cpn-1', 'cust-1');
    txMock.coupon.findUnique.mockResolvedValue({
      usageLimit: 10,
      perCustomerLimit: 1,
      isActive: false,
    });

    await expect(claimOrderForConfirmation('ord-1', txMock)).rejects.toThrow(
      'COUPON_NO_LONGER_VALID',
    );
  });

  it('usage-limit race + paidExternally → usage still recorded (over-limit, honest), confirmation succeeds', async () => {
    seedClaimOrder('cpn-1', 'cust-1');
    txMock.coupon.findUnique.mockResolvedValue({
      usageLimit: 10,
      perCustomerLimit: 1,
      isActive: true,
    });
    // The guarded bump loses the race (coupon full).
    txMock.coupon.updateMany.mockResolvedValue({ count: 0 });

    const claimed = await claimOrderForConfirmation('ord-1', txMock, { paidExternally: true });
    expect(claimed).not.toBeNull();
    // The unconditional increment documents the charged discount.
    expect(txMock.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { usageCount: { increment: 1 } } }),
    );
  });

  it('usage-limit race + strict → COUPON_USAGE_LIMIT still throws', async () => {
    seedClaimOrder('cpn-1', 'cust-1');
    txMock.coupon.findUnique.mockResolvedValue({
      usageLimit: 10,
      perCustomerLimit: 1,
      isActive: true,
    });
    txMock.coupon.updateMany.mockResolvedValue({ count: 0 });

    await expect(claimOrderForConfirmation('ord-1', txMock)).rejects.toThrow('COUPON_USAGE_LIMIT');
  });
});

describe('HIGH-3 — order creation gate is the union of channels', () => {
  it('the gate accepts Opn-only environments (no manual transfer configured)', async () => {
    const { isOpnConfigured } = await import('@/lib/payment/omise');
    delete process.env['NK_PAYMENT_MOCK'];
    process.env['NK_OMISE_SECRET_KEY'] = 'skey_test_x';
    process.env['NK_OMISE_WEBHOOK_SECRET'] = 'whsec_x';
    expect(isOpnConfigured()).toBe(true);
    delete process.env['NK_OMISE_SECRET_KEY'];
    delete process.env['NK_OMISE_WEBHOOK_SECRET'];
  });

  it('the gate still fails with NO usable channel', async () => {
    const { isOpnConfigured } = await import('@/lib/payment/omise');
    delete process.env['NK_PAYMENT_MOCK'];
    delete process.env['NK_OMISE_SECRET_KEY'];
    delete process.env['NK_OMISE_WEBHOOK_SECRET'];
    expect(isOpnConfigured()).toBe(false);
  });

  it('the orders route source uses the union gate (static guard)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/app/api/v1/orders/route.ts', 'utf8');
    expect(src).toContain('isOpnConfigured');
    expect(src).toContain('!manualUsable && !opnReady');
    // The legacy single-channel hard gate is gone.
    expect(src).not.toContain('if (!manualInfo.enabled');
  });
});

describe('CRITICAL-1 — no bare JSON.stringify may render into a script tag', () => {
  it('Breadcrumb serializes through serializeJsonLd (static guard)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/data-display/Breadcrumb.tsx', 'utf8');
    expect(src).toContain('serializeJsonLd(jsonLd)');
    expect(src).not.toContain('dangerouslySetInnerHTML={{ __html: JSON.stringify(');
  });
});
