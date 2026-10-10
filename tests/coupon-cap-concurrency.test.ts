/**
 * Coupon per-customer cap under REAL concurrency (2026-10-03).
 *
 * The gap this closes: `tests/wallet-coupon-race.test.ts` mocks prisma, so it
 * proves the pay-wallet route ASKS for `isolationLevel: 'Serializable'` and
 * retries P2034 — it cannot prove the database actually serialises, and it
 * cannot prove the cap holds. This file is that proof.
 *
 * Under test (real HTTP, real Postgres, real parallelism):
 *
 *   1. N simultaneous wallet claims by ONE customer on ONE coupon whose
 *      perCustomerLimit is 1. Exactly one may succeed. Every other must be
 *      rejected with 409 COUPON_PER_CUSTOMER_LIMIT — the customer-facing code
 *      the checkout UI uses to fall back to PromptPay without the coupon.
 *      Without the Serializable wrapper, concurrent claims read the
 *      redemption count under Read Committed, all see 0 <= per, and all
 *      commit: the cap is over-granted and the customer keeps the discount.
 *
 *   2. The loser must leave NO trace. The balance deduct and the TopUpLog
 *      spend row both precede the coupon check inside the transaction, so
 *      every rejected claim must roll back: exactly one spend row, and the
 *      wallet debited exactly once for a single order's total. A cap that
 *      rejects the order but keeps the money would be a worse bug than the
 *      one being fixed.
 *
 *   3. Exactly one CouponRedemption row exists for (couponId, customerId),
 *      and the coupon's usageCount advanced exactly once.
 *
 * Why N = 8 and not 2: two requests can happen to serialise naturally — the
 * second then reads the first's committed redemption and is correctly
 * rejected, so the test would pass even against the unfixed code. Eight
 * in-flight claims make the overlap near-certain, which is what gives the
 * assertion its power to detect the regression. The invariant asserted is
 * the same one the cap promises: never more than `perCustomerLimit` wins.
 *
 * ── STATUS: NEVER EXECUTED. DO NOT TREAT IT AS PASSING. ──
 *
 * This file has never been run. It is typechecked (`tsc --noEmit` covers
 * the test tree too, which validated every prisma field name against the
 * generated client) and its skip path is verified, but no assertion in it
 * has ever executed. The development machine had no reachable Postgres:
 * Docker Desktop starts but its `docker-desktop` WSL2 distro stays
 * Stopped, so the engine never comes up.
 *
 * It is deliberately NOT wired into the `concurrency-tests` CI job. That
 * job is in `build`'s `needs`, so adding an unproven test there risks a red
 * build — and, per the plan, it must first be run green AND shown to fail
 * against the unfixed code (revert `isolationLevel`, expect more than one
 * 200) before it earns a place in the pipeline.
 *
 * Requires the live dev server + Postgres, exactly like
 * tests/admin-concurrency.test.ts: gated on NK_TEST_BASE_URL and skipped
 * entirely without it, so `npm test` stays green on a bare checkout.
 *
 * Stock is set well above the contender count ON PURPOSE. pay-wallet
 * fulfils strictly, so a stock shortfall would surface as INSUFFICIENT_STOCK
 * and mask the coupon code this file is actually asserting on.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BASE = process.env['NK_TEST_BASE_URL'] ?? '';

/** All tests in this file need a live server; skip cleanly without one. */
const d = BASE ? describe : describe.skip;

const REQUEST_TIMEOUT_MS = 60_000;
const RUN = Date.now().toString(36);

/** Simultaneous claims by one customer on one coupon capped at 1. */
const CONTENDERS = 8;

/** Per-order money. unit 100 + VAT 7, minus a flat ฿50 coupon = 57. */
const UNIT = '100.00';
const VAT = '7.00';
const DISCOUNT = '50.00';
const TOTAL = '57.00';

async function payWallet(
  orderId: string,
  cookie: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/api/v1/orders/${orderId}/pay-wallet`, {
    method: 'POST',
    headers: { cookie: `nk_session=${cookie}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

const errorCode = (body: Record<string, unknown>): string => {
  const err = body['error'];
  if (err && typeof err === 'object' && 'code' in err)
    return String((err as { code: unknown }).code);
  return typeof err === 'string' ? err : JSON.stringify(body);
};

type Seed = {
  customerId: string;
  couponId: string;
  variantId: string;
  categoryId: string;
  productId: string;
  orderIds: string[];
  startBalance: string;
  /** Customer session JWT for the pay-wallet cookie, minted once in beforeAll. */
  token: string;
};

d('coupon per-customer cap — real concurrency', () => {
  let seed: Seed;

  beforeAll(async () => {
    const { prisma } = await import('@/lib/db');
    const { signJwt } = await import('@/lib/jwt');

    const category = await prisma.category.create({
      data: { name: `conc-cap-cat-${RUN}`, slug: `conc-cap-cat-${RUN}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `conc-cap-product-${RUN}`,
        slug: `conc-cap-product-${RUN}`,
        categoryId: category.id,
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, label: `conc-cap-variant-${RUN}`, price: UNIT, stock: 50 },
    });

    // perCustomerLimit: 1 is the default, stated explicitly because it is the
    // whole subject of this test. usageLimit stays null (unlimited) so the
    // GLOBAL cap cannot be what rejects the losers.
    const coupon = await prisma.coupon.create({
      data: {
        code: `CONC-CAP-${RUN}`,
        description: 'concurrency test coupon',
        discountType: 'amount',
        discountValue: DISCOUNT,
        perCustomerLimit: 1,
        usageLimit: null,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        email: `conc-cap-${RUN}@example.test`,
        fullName: 'Concurrency Cap',
        status: 'active',
        emailVerified: true,
        walletBalanceThb: '5000.00',
      },
    });

    const orderIds: string[] = [];
    for (let i = 0; i < CONTENDERS; i++) {
      const order = await prisma.order.create({
        data: {
          orderNumber: `NK-CONC-${RUN}-${i}`,
          customerId: customer.id,
          customerEmail: customer.email,
          status: 'pending_payment',
          subtotalThb: UNIT,
          vatAmountThb: VAT,
          discountThb: DISCOUNT,
          totalAmountThb: TOTAL,
          couponId: coupon.id,
          tosAcceptedAt: new Date(),
          items: {
            create: {
              variantId: variant.id,
              productNameTh: `conc-cap-${RUN}`,
              productNameEn: `conc-cap-${RUN}`,
              skuCode: `conc-cap-sku-${RUN}-${i}`,
              denominationThb: UNIT,
              quantity: 1,
              unitPriceThb: UNIT,
              unitPriceExVat: UNIT,
              unitVatAmount: VAT,
              lineTotalThb: UNIT,
              couponDiscountThb: 0,
              finalLineTotalThb: UNIT,
              finalLineExVat: UNIT,
              finalLineVatAmount: VAT,
              promotionDiscountThb: 0,
              promotionName: null,
              promotionType: null,
              promotionValue: null,
              originalUnitPriceThb: UNIT,
              appliedPromotionId: null,
            },
          },
        },
      });
      orderIds.push(order.id);
    }

    const token = await signJwt({ sub: customer.id, typ: 'customer' });
    seed = {
      customerId: customer.id,
      couponId: coupon.id,
      variantId: variant.id,
      categoryId: category.id,
      productId: product.id,
      orderIds,
      startBalance: '5000.00',
      // Minted once and carried on the seed so the suite reads as one fixture.
      token,
    };
  }, 120_000);

  afterAll(async () => {
    if (!seed) return;
    const { prisma } = await import('@/lib/db');
    // Best-effort, FK-safe order. Every model is scoped to the run's own ids,
    // so leftovers cannot collide with another run or another suite.
    const wipe = async (fn: () => Promise<unknown>): Promise<void> => {
      try {
        await fn();
      } catch {
        /* cleanup must never fail the suite */
      }
    };
    await wipe(() =>
      prisma.giftCode.deleteMany({ where: { order: { customerId: seed.customerId } } }),
    );
    await wipe(() => prisma.stockMove.deleteMany({ where: { variantId: seed.variantId } }));
    await wipe(() =>
      prisma.inventorySnapshot.deleteMany({ where: { productVariantId: seed.variantId } }),
    );
    await wipe(() => prisma.orderItem.deleteMany({ where: { orderId: { in: seed.orderIds } } }));
    await wipe(() => prisma.topUpLog.deleteMany({ where: { customerId: seed.customerId } }));
    await wipe(() => prisma.couponRedemption.deleteMany({ where: { couponId: seed.couponId } }));
    await wipe(() => prisma.order.deleteMany({ where: { id: { in: seed.orderIds } } }));
    await wipe(() => prisma.coupon.deleteMany({ where: { id: seed.couponId } }));
    await wipe(() => prisma.productVariant.deleteMany({ where: { id: seed.variantId } }));
    await wipe(() => prisma.product.deleteMany({ where: { id: seed.productId } }));
    await wipe(() => prisma.category.deleteMany({ where: { id: seed.categoryId } }));
    await wipe(() => prisma.customer.deleteMany({ where: { id: seed.customerId } }));
  }, 120_000);

  it('lets exactly one of N simultaneous claims clear the cap, and charges the wallet once', async () => {
    const { prisma } = await import('@/lib/db');
    const token = seed.token;

    // Fired together, not awaited in sequence — the overlap is the test.
    const results = await Promise.all(seed.orderIds.map((id) => payWallet(id, token)));

    const ok = results.filter((r) => r.status === 200);
    const rejected = results.filter((r) => r.status === 409);

    // The cap: perCustomerLimit is 1, so exactly one claim may win.
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(CONTENDERS - 1);

    // Every loser must be told the coupon is the reason, so checkout can
    // retry without it. A different 409 (ORDER_NOT_PAYABLE, INSUFFICIENT_BALANCE)
    // would mean the test passed for the wrong reason.
    for (const r of rejected) {
      expect(errorCode(r.body)).toBe('COUPON_PER_CUSTOMER_LIMIT');
    }

    // The cap is recorded exactly once, at the database level.
    const redemptions = await prisma.couponRedemption.count({
      where: { couponId: seed.couponId, customerId: seed.customerId },
    });
    expect(redemptions).toBe(1);

    // The global counter advanced once too — the losers rolled back rather
    // than incrementing it and then being rejected.
    const coupon = await prisma.coupon.findUnique({ where: { id: seed.couponId } });
    expect(coupon?.usageCount).toBe(1);

    // Money: exactly one charge survived, for exactly one order's total. The
    // other seven deducted-then-rolled-back and must leave no spend row.
    const spends = await prisma.topUpLog.findMany({
      where: { customerId: seed.customerId, method: 'wallet_spend' },
    });
    expect(spends).toHaveLength(1);

    const customer = await prisma.customer.findUnique({ where: { id: seed.customerId } });
    expect(customer).not.toBeNull();
    const expected = Number(seed.startBalance) - Number(TOTAL);
    expect(Number(customer?.walletBalanceThb)).toBeCloseTo(expected, 2);

    // Exactly one order advanced past pending_payment; the rest are untouched
    // and therefore still payable without the coupon.
    const statuses = await prisma.order.findMany({
      where: { id: { in: seed.orderIds } },
      select: { status: true, paymentMethod: true },
    });
    const paid = statuses.filter((o) => o.status !== 'pending_payment');
    expect(paid).toHaveLength(1);
    expect(paid[0]?.paymentMethod).toBe('wallet');
    expect(statuses.filter((o) => o.status === 'pending_payment')).toHaveLength(CONTENDERS - 1);
  }, 180_000);
});
