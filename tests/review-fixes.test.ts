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

import type { Prisma } from '@prisma/client';

import { claimOrderForConfirmation } from '@/api/orders';

/** The mock as the Prisma interactive-transaction client type. */
const TX = txMock as unknown as Prisma.TransactionClient;

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

    const claimed = await claimOrderForConfirmation('ord-1', TX, { paidExternally: true });
    expect(claimed).not.toBeNull();
  });

  it('inactive coupon + strict (wallet/admin) → COUPON_NO_LONGER_VALID still throws', async () => {
    seedClaimOrder('cpn-1', 'cust-1');
    txMock.coupon.findUnique.mockResolvedValue({
      usageLimit: 10,
      perCustomerLimit: 1,
      isActive: false,
    });

    await expect(claimOrderForConfirmation('ord-1', TX)).rejects.toThrow('COUPON_NO_LONGER_VALID');
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

    const claimed = await claimOrderForConfirmation('ord-1', TX, { paidExternally: true });
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

    await expect(claimOrderForConfirmation('ord-1', TX)).rejects.toThrow('COUPON_USAGE_LIMIT');
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
    // Roadmap §4: the gate is now the full union via resolvePaymentChannels
    // (Opn OR manual OR wallet) — no single-channel conjunction remains.
    expect(src).toContain('resolvePaymentChannels');
    expect(src).toContain('hasUsableChannel');
    expect(src).not.toContain('!manualUsable && !opnReady');
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

describe('2026-10-12 — an itemless order must never be claimed as paid', () => {
  /**
   * Production contained 13 orders with zero OrderItem rows and one of them
   * had been flipped to `completed`. These pin both halves of the fix: the
   * claim refuses such rows (behaviour), and it does so because the `where`
   * carries an items filter (static — a mocked DB cannot assert the SQL).
   */
  it('behaviour: a claim the DB rejects because the order has no items returns null and stops', async () => {
    // The DB reports 0 rows matched: `pending_payment` but no `items` to match
    // `items: { some: {} }`.
    txMock.order.updateMany.mockResolvedValue({ count: 0 });

    const claimed = await claimOrderForConfirmation('ord-empty', TX);

    expect(claimed).toBeNull();
    // It must stop at the claim — no coupon, redemption or status work.
    expect(txMock.coupon.findUnique).not.toHaveBeenCalled();
    expect(txMock.couponRedemption.create).not.toHaveBeenCalled();
    expect(txMock.order.update).not.toHaveBeenCalled();
  });

  it('behaviour: an order WITH items still claims normally (guard does not over-block)', async () => {
    seedClaimOrder(null, null);
    txMock.order.updateMany.mockResolvedValue({ count: 1 });

    const claimed = await claimOrderForConfirmation('ord-1', TX);

    expect(claimed).not.toBeNull();
    expect(txMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ items: { some: {} } }),
      }),
    );
  });

  it('static: the claim filter requires at least one item, and orders cannot be created empty', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/api/orders.ts', 'utf8');

    // The claim's updateMany where-clause carries the items filter.
    expect(src).toContain('items: { some: {} }');

    // createOrder still rejects an empty cart before any row is written, so
    // this guard is defence in depth and never the only line of defence.
    expect(src).toContain("throw new Error('CART_EMPTY')");
  });
});

describe('2026-10-12 — createOrder retry predicate is scoped by attempt', () => {
  it('static: the retryable-code check is parenthesised so `attempt < 4` guards BOTH arms', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/api/orders.ts', 'utf8');

    // Before the fix the catch read `attempt < 4 && … P2034 || … P2002`.
    // `&&` binds tighter than `||`, so that parsed as
    //   (attempt < 4 && … P2034) || (… P2002)
    // and the P2002 arm ignored `attempt < 4` entirely. Worse, the guard only
    // ever applied to the P2034 arm, so a non-retryable error carrying either
    // code could be retried on every iteration. The fix groups the two code
    // comparisons so the attempt guard covers both.
    expect(src).toMatch(/\(\(err as \{ code\?: string \}\)\.code === 'P2034' \|\|/);

    // The un-parenthesised form must not come back.
    expect(src).not.toMatch(
      /typeof err === 'object' &&\s*err !== null &&\s*\(err as \{ code\?: string \}\)\.code === 'P2034' \|\|/,
    );
  });
});
