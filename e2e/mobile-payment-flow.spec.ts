import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

/**
 * Phone proof for the 2026-11-14 payment-flow fixes:
 *
 *   1. "ชำระเงินแล้วโค้ดยังไม่เด้ง" — after a payment succeeds the delivered
 *      code has to stay on the screen the customer lands on. Slip verification
 *      clears the cart, and the checkout's empty-cart guard used to swap the
 *      whole page for ตะกร้าว่างเปล่า, unmounting the code it had just shown.
 *   2. "ซื้อแอพเดียวกัน ไม่รู้ว่าอันนี้ของอะไร" — two orders of the same
 *      product must each carry their own order number on the payment step, the
 *      slip panel and the delivered-code block.
 *   3. /account/codes must not label (or grey out) a fresh code as ใช้แล้ว
 *      merely because its order is completed.
 *
 * Only the payment-provider responses are stubbed (slip-verify, wallet pay,
 * QR initiate/poll) — exactly what real SlipOK/bank credentials would answer.
 * Everything else is the real app: the checkout UI, the cart provider, the
 * order-context block, the slip panel, the receipt dialog, and (for the QR
 * landing) the real server-rendered confirmation page backed by the database.
 */

const prisma = new PrismaClient();

const VARIANT_ID = 'e2e-mobile-variant';
const PRODUCT_NAME = 'HBO Max 7 วัน (e2e)';
const UNIT_PRICE = 100;

function cartItem() {
  return {
    id: 'e2e-mobile-line',
    variantId: VARIANT_ID,
    skuCode: 'NK-E2E-MOB',
    productNameTh: PRODUCT_NAME,
    productNameEn: 'HBO Max 7 days (e2e)',
    productSlug: 'hbo-max-e2e',
    variantLabel: '7 วัน',
    thumbnailUrl: null,
    denominationThb: UNIT_PRICE,
    unitPriceThb: UNIT_PRICE,
    vatAmountThb: 0,
    quantity: 1,
    lineTotalThb: UNIT_PRICE,
    inStock: true,
    availableQuantity: 5,
    maxQuantity: 5,
  };
}

const SEED_ITEM = cartItem();

/**
 * Seed the persisted cart before any app script runs — ONCE per context.
 * A paid checkout writes an EMPTY cart; re-seeding on every navigation would
 * hide exactly the state this spec has to observe.
 */
async function seedCart(page: Page): Promise<void> {
  await page.addInitScript((item) => {
    if (localStorage.getItem('nk_cart:v2')) return;
    const sessionKey = 'e2e-mobile-session';
    localStorage.setItem('nk_cart_session', sessionKey);
    localStorage.setItem(
      'nk_cart:v2',
      JSON.stringify({
        cartId: null,
        sessionKey,
        items: [item],
        summary: {
          subtotalThb: 100,
          vatAmountThb: 0,
          totalAmountThb: 100,
          itemCount: 1,
          discountAmountThb: 0,
        },
        expiresAt: null,
      }),
    );
  }, SEED_ITEM);
}

/** Put the cart back for a second purchase in the same browser context. */
async function reseedCart(page: Page): Promise<void> {
  await page.evaluate((item) => {
    const sessionKey = 'e2e-mobile-session';
    localStorage.setItem('nk_cart_session', sessionKey);
    localStorage.setItem(
      'nk_cart:v2',
      JSON.stringify({
        cartId: null,
        sessionKey,
        items: [item],
        summary: {
          subtotalThb: 100,
          vatAmountThb: 0,
          totalAmountThb: 100,
          itemCount: 1,
          discountAmountThb: 0,
        },
        expiresAt: null,
      }),
    );
  }, SEED_ITEM);
}

/** Lines left in the persisted cart. */
async function cartLineCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('nk_cart:v2');
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { items?: unknown[] };
    return Array.isArray(parsed.items) ? parsed.items.length : 0;
  });
}

interface StubOrder {
  id: string;
  orderNumber: string;
  confirmationUuid: string;
  code: string;
}

interface StubOptions {
  /** What POST /orders/{id}/pay-wallet answers. */
  wallet: 'succeed' | 'fail';
  /** What POST /payments/{id}/status answers once polling starts. */
  poll: 'succeeded' | 'pending';
  /** QR/conformation target for a succeeded poll. */
  pollConfirmationUuid?: string;
}

interface StubState {
  orders: StubOrder[];
  options: StubOptions;
}

function orderBody(order: StubOrder) {
  const now = new Date().toISOString();
  return {
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      confirmationUuid: order.confirmationUuid,
      customerEmail: 'e2e@nong-kati-test.local',
      customerPhone: '0812345678',
      status: 'pending_payment',
      paymentMethod: 'promptpay',
      items: [
        {
          id: `oi-${order.id}`,
          variantId: VARIANT_ID,
          productNameTh: PRODUCT_NAME,
          productNameEn: 'HBO Max 7 days (e2e)',
          skuCode: 'NK-E2E-MOB',
          denominationThb: UNIT_PRICE,
          quantity: 1,
          unitPriceThb: UNIT_PRICE,
          unitPriceExVat: UNIT_PRICE,
          unitVatAmount: 0,
          lineTotalThb: UNIT_PRICE,
          deliveryStatus: 'pending',
          couponDiscountThb: 0,
          finalLineTotalThb: UNIT_PRICE,
          finalLineExVat: UNIT_PRICE,
          finalLineVatAmount: 0,
          originalUnitPriceThb: UNIT_PRICE,
          appliedPromotionId: null,
          promotionName: null,
          promotionType: null,
          promotionValue: null,
          promotionDiscountThb: 0,
        },
      ],
      subtotalThb: UNIT_PRICE,
      promotionDiscountThb: 0,
      vatAmountThb: 0,
      vatEnabled: false,
      vatRate: 0,
      discountThb: 0,
      totalAmountThb: UNIT_PRICE,
      requiresTaxInvoice: false,
      taxInvoiceName: null,
      taxInvoiceTaxId: null,
      manualFulfilmentReason: null,
      createdAt: now,
    },
    slipUploadToken: 'e2e-slip-token',
  };
}

/**
 * Install the provider stubs. The two synthetic orders this run creates are
 * distinct on purpose: the same product bought twice has to stay tellable
 * apart by order number.
 */
async function installStubs(page: Page, state: StubState): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    const method = req.method();
    const json = (body: unknown, status = 200): Promise<void> =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
        body: JSON.stringify(body),
      });

    if (pathname === '/api/v1/settings/tax-invoice') return json({ enabled: false });
    if (pathname === '/api/v1/wallet') return json({ balanceThb: 500 });
    if (pathname === '/api/v1/payments/manual-info') {
      return json({
        enabled: true,
        accountName: 'ร้านน้องกะทิ',
        accountNumber: '199-1-73578-6',
        accountType: 'promptpay',
        bankName: null,
        qrImageUrl: null,
      });
    }
    if (pathname === '/api/v1/payments/slip-verify' && method === 'GET') {
      return json({ enabled: true });
    }
    if (pathname === '/api/v1/orders/preview') {
      return json({
        items: [
          {
            variantId: VARIANT_ID,
            unitPriceThb: UNIT_PRICE,
            tierUnitPriceThb: UNIT_PRICE,
            variantLabel: '7 วัน',
            availableQuantity: 5,
          },
        ],
        grossSubtotalThb: UNIT_PRICE,
        subtotalThb: UNIT_PRICE,
        promotionDiscountThb: 0,
        couponDiscountThb: 0,
        vatAmountThb: 0,
        vatEnabled: false,
        vatRate: 0,
        totalAmountThb: UNIT_PRICE,
      });
    }
    if (pathname === '/api/v1/orders' && method === 'POST') {
      const seq = state.orders.length + 1;
      const order: StubOrder = {
        id: `e2e-order-${seq}`,
        orderNumber: `NK-E2E-${String(seq).padStart(4, '0')}`,
        confirmationUuid: `e2e-uuid-${seq}`,
        code: `E2E-CODE-${seq}-AAAA-BBBB`,
      };
      state.orders.push(order);
      return json(orderBody(order));
    }
    if (pathname === '/api/v1/payments/slip-verify' && method === 'POST') {
      const order = state.orders[state.orders.length - 1]!;
      return json({
        status: 'confirmed',
        message: 'ตรวจสลิปผ่าน — ส่งโค้ดเรียบร้อยแล้ว ดูโค้ดด้านบนได้เลย',
        confirmationUuid: order.confirmationUuid,
        codes: [{ code: order.code, productName: PRODUCT_NAME, denomination: UNIT_PRICE }],
      });
    }
    if (/^\/api\/v1\/orders\/[^/]+\/pay-wallet$/.test(pathname) && method === 'POST') {
      if (state.options.wallet === 'fail') {
        return json({ error: { code: 'WALLET_PAY_FAILED' } }, 500);
      }
      const order = state.orders[state.orders.length - 1]!;
      return json({
        success: true,
        orderNumber: order.orderNumber,
        codes: [{ code: order.code, productName: PRODUCT_NAME, denomination: UNIT_PRICE }],
      });
    }
    if (pathname === '/api/v1/payments/initiate' && method === 'POST') {
      return json({
        paymentAttemptId: 'e2e-attempt-1',
        qrImageUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        qrExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
    }
    if (/^\/api\/v1\/payments\/[^/]+\/status$/.test(pathname)) {
      if (state.options.poll !== 'succeeded') return json({ status: 'pending' });
      return json({
        status: 'succeeded',
        confirmationUuid: state.options.pollConfirmationUuid ?? 'e2e-uuid-1',
      });
    }
    if (pathname === '/api/v1/auth/me') {
      return json({
        customer: {
          id: 'e2e-customer',
          email: 'e2e-codes@nong-kati-test.local',
          fullName: 'E2E Codes',
          phoneNumber: null,
          marketingOptIn: false,
        },
      });
    }
    if (pathname === '/api/v1/account/codes') {
      return json({
        hasMore: false,
        codes: [
          {
            id: 'c1',
            code: 'FRESH-CODE-AAAA',
            product: PRODUCT_NAME,
            denomination: 100,
            orderNumber: 'NK-E2E-0001',
            deliveredAt: new Date().toISOString(),
            used: false,
          },
          {
            id: 'c2',
            code: 'FRESH-CODE-BBBB',
            product: PRODUCT_NAME,
            denomination: 100,
            orderNumber: 'NK-E2E-0002',
            deliveredAt: new Date().toISOString(),
            used: false,
          },
        ],
      });
    }

    return route.fallback();
  });
}

/** Fill step 1 and land on the payment step. */
async function startCheckout(page: Page): Promise<void> {
  await page.goto('/checkout');
  await page.locator('input[id$="-email"]').fill(`e2e-${Date.now()}@nong-kati-test.local`);
  await page.locator('input[id$="-phone"]').fill('0812345678');
  await page.locator('input[id$="-tos"]').check();
  await page.getByRole('button', { name: 'ดำเนินการต่อ' }).click();
  await expect(page.getByRole('button', { name: 'เลือกไฟล์สลิป' })).toBeVisible({
    timeout: 30_000,
  });
}

/** Upload the slip and let the (stubbed) bank answer confirm it. */
async function payWithSlip(page: Page): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/slip-8x8.png');
  await page.getByRole('button', { name: 'ตรวจสลิป' }).click();
}

function codeBox(page: Page, code: string): Locator {
  return page.getByRole('textbox', { name: `รหัสบัตร: ${code}` });
}

/**
 * The code has to be genuinely reachable on a short phone screen: scrolled
 * into view, topmost at its own centre, and not sitting under the fixed
 * mobile bottom navigation.
 */
async function assertReachable(locator: Locator): Promise<void> {
  const probe = await locator.evaluate(async (el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const rect = el.getBoundingClientRect();
    const points: [number, number][] = [
      [rect.left + Math.min(8, rect.width / 2), rect.top + 4],
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + rect.width / 2, rect.bottom - 4],
    ];
    const clamp = (v: number, max: number): number => Math.min(max - 2, Math.max(2, v));
    const hits = points.map(([x, y]) => {
      const top = document.elementFromPoint(
        clamp(x, window.innerWidth),
        clamp(y, window.innerHeight),
      );
      const ok = !!top && (el === top || el.contains(top) || top.contains(el));
      return {
        ok,
        hit: top ? `${top.tagName}.${(top.className || '').toString().slice(0, 50)}` : 'none',
      };
    });
    return {
      rect: { top: Math.round(rect.top), bottom: Math.round(rect.bottom) },
      viewportHeight: window.innerHeight,
      hits,
    };
  });
  // Occlusion is judged point-by-point: a fixed bottom bar (or the sticky
  // header) that actually covers the code shows up as a non-matching hit, and
  // a dialog layered ABOVE that bar is correctly not treated as blocked.
  expect(
    probe.hits.every((h) => h.ok),
    `the code must be unobstructed at its top, middle and bottom: ${JSON.stringify(probe)}`,
  ).toBe(true);
  await expect(locator).toBeInViewport();
}

/** A real, already-completed order with delivered codes (server-rendered landing page). */
async function realCompletedOrder(): Promise<{ uuid: string; orderNumber: string; hashes: Buffer[] }> {
  const order = await prisma.order.findFirst({
    where: { status: 'completed', giftCodes: { some: { status: 'delivered' } } },
    orderBy: { createdAt: 'desc' },
    select: {
      confirmationUuid: true,
      orderNumber: true,
      giftCodes: { where: { status: 'delivered' }, select: { codeHash: true }, take: 3 },
    },
  });
  if (!order) throw new Error('no completed order with delivered codes in the database');
  return {
    uuid: order.confirmationUuid,
    orderNumber: order.orderNumber,
    hashes: order.giftCodes.map((c) => Buffer.from(c.codeHash)),
  };
}

const VIEWPORTS = [
  {
    name: 'iPhone 390x844',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  },
  {
    name: 'Android 412x915',
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2.625,
  },
] as const;

for (const device of VIEWPORTS) {
  test.describe(`mobile payment flow — ${device.name}`, () => {
    test.use({
      viewport: device.viewport,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
      deviceScaleFactor: device.deviceScaleFactor,
      locale: 'th-TH',
    });

    test.afterAll(async () => {
      await prisma.$disconnect();
    });

    test('slip approved: the delivered code stays on screen after the cart clears, and the order number identifies it', async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const state: StubState = { orders: [], options: { wallet: 'succeed', poll: 'pending' } };
      await seedCart(page);
      await installStubs(page, state);

      await startCheckout(page);
      const order = state.orders[0]!;

      // Payment step: order number + the product actually bought.
      await expect(page.getByText(order.orderNumber).first()).toBeVisible();
      await expect(page.getByText(PRODUCT_NAME).first()).toBeVisible();
      await assertReachable(page.getByText(order.orderNumber).first());

      await payWithSlip(page);

      // 1) The code is on the page, in the DOM and on screen.
      const code = codeBox(page, order.code);
      await expect(code).toBeVisible({ timeout: 30_000 });
      await expect(code).toHaveText(order.code);

      // 2) The paid state is stated, and the empty-cart screen never replaced it
      //    even though the cart genuinely emptied.
      await expect(page.getByText(/ตรวจสลิปผ่าน — ชำระเงินเรียบร้อย/)).toBeVisible();
      await expect(page.getByText('ตะกร้าว่างเปล่า')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'เลือกไฟล์สลิป' })).toHaveCount(0);

      // 3) The block says which order those codes belong to.
      await expect(page.getByText(`โค้ดของคุณ · ${order.orderNumber}`)).toBeVisible();
      await expect(page.getByText(`คำสั่งซื้อ ${order.orderNumber}`)).toBeVisible();

      // 4) Reachable on a short phone screen — not behind the fixed bottom bar.
      await assertReachable(code);
      await assertReachable(page.getByRole('link', { name: /ดูรายละเอียดคำสั่งซื้อ/ }));

      // 5) The cart really is empty (the guard change is not hiding a live cart).
      expect(await cartLineCount(page), 'the paid line must leave the cart').toBe(0);
      await expect(page.getByText('ตะกร้าว่างเปล่า')).toHaveCount(0);
    });

    test('wallet paid: the receipt dialog shows the code and its order number', async ({ page }) => {
      test.setTimeout(180_000);
      const state: StubState = { orders: [], options: { wallet: 'succeed', poll: 'pending' } };
      await seedCart(page);
      await installStubs(page, state);

      await startCheckout(page);
      const order = state.orders[0]!;

      await page.getByText('เครดิตในกระเป๋า').click();
      await page.getByRole('button', { name: 'ยืนยันชำระด้วยเครดิต' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByText(order.orderNumber)).toBeVisible();
      await expect(dialog.getByText(order.code)).toBeVisible();
      await expect(dialog.getByText(/ชำระด้วยเครดิตสำเร็จ/)).toBeVisible();

      // The cart was cleared by the payment; the codes must not be replaced by
      // the empty-cart screen behind the dialog.
      await expect(page.getByText('ตะกร้าว่างเปล่า')).toHaveCount(0);
      expect(await cartLineCount(page), 'the paid line must leave the cart').toBe(0);

      // Code reachable inside the dialog's scroll container on this viewport.
      await assertReachable(dialog.getByText(order.code));
    });

    test('QR success: the customer lands on a page that still shows the delivered code', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const real = await realCompletedOrder();
      const state: StubState = {
        orders: [],
        options: { wallet: 'fail', poll: 'succeeded', pollConfirmationUuid: real.uuid },
      };
      await seedCart(page);
      await installStubs(page, state);

      await startCheckout(page);
      const order = state.orders[0]!;

      // Wallet failure is the production path that falls back to a real QR.
      await page.getByText('เครดิตในกระเป๋า').click();
      await page.getByRole('button', { name: 'ยืนยันชำระด้วยเครดิต' }).click();

      await expect(page.getByText(/สร้าง QR|พร้อมเพย์|สแกน/).first()).toBeVisible({
        timeout: 30_000,
      });

      // Poll succeeds -> the app navigates to the confirmation page.
      await page.waitForURL(`**/checkout/confirmation/${real.uuid}`, { timeout: 60_000 });
      await expect(page.getByText(real.orderNumber).first()).toBeVisible({ timeout: 30_000 });

      // A delivered code is actually rendered — matched to the DB hash of the
      // plaintext that the page displays, so this is the real decrypted code.
      const rendered = await page
        .locator('[aria-label^="รหัสบัตร: "], pre')
        .evaluateAll((nodes) =>
          nodes.map((n) => (n.getAttribute('aria-label') ?? n.textContent ?? '').replace('รหัสบัตร: ', '').trim()),
        );
      // GiftCode.codeHash = sha256(plaintext.trim().toUpperCase()) — same rule here.
      const matched = real.hashes.some((hash) =>
        rendered.some(
          (text) =>
            text.length > 0 &&
            createHash('sha256').update(text.trim().toUpperCase()).digest().equals(hash),
        ),
      );
      expect(matched, 'the confirmation page must show a real delivered code').toBe(true);
      await expect(page.getByText('ตะกร้าว่างเปล่า')).toHaveCount(0);
      expect(await cartLineCount(page), 'the QR-paid line must leave the cart').toBe(0);

      // ...and that code is reachable on this phone screen (not under the
      // fixed bottom navigation, not cut off).
      const shown = rendered.find((text) =>
        real.hashes.some((hash) =>
          createHash('sha256').update(text.trim().toUpperCase()).digest().equals(hash),
        ),
      );
      expect(shown, 'a rendered code must be identifiable').toBeTruthy();
      await assertReachable(
        page.locator(`[aria-label="รหัสบัตร: ${shown}"]`).first(),
      );

      // The QR order's own number was on the payment step it came from.
      expect(order.orderNumber).toMatch(/^NK-E2E-/);
    });

    test('buying the same product twice: each order number, slip panel and code block stay attributable', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const state: StubState = { orders: [], options: { wallet: 'succeed', poll: 'pending' } };
      await seedCart(page);
      await installStubs(page, state);

      // First purchase.
      await startCheckout(page);
      const first = state.orders[0]!;
      await expect(page.getByText(first.orderNumber).first()).toBeVisible();
      await payWithSlip(page);
      await expect(codeBox(page, first.code)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(`โค้ดของคุณ · ${first.orderNumber}`)).toBeVisible();

      // Second purchase of the SAME product (the cart was emptied by the
      // payment, so put it back deliberately).
      await reseedCart(page);
      await page.goto('/checkout');
      await startCheckout(page);
      const second = state.orders[1]!;
      expect(second.orderNumber).not.toBe(first.orderNumber);

      // Payment step names its own order, and the first order's number is gone.
      await expect(page.getByText(`คำสั่งซื้อ ${second.orderNumber}`)).toBeVisible();
      await expect(page.getByText(first.orderNumber)).toHaveCount(0);

      await payWithSlip(page);
      await expect(codeBox(page, second.code)).toBeVisible({ timeout: 30_000 });

      // Each code block names the order it belongs to; the other order's code
      // is nowhere on this screen.
      await expect(page.getByText(`โค้ดของคุณ · ${second.orderNumber}`)).toBeVisible();
      await expect(page.getByText(`คำสั่งซื้อ ${second.orderNumber}`)).toBeVisible();
      await expect(page.getByText(first.code)).toHaveCount(0);
      await expect(page.getByText(first.orderNumber)).toHaveCount(0);
    });

    test('/account/codes: a fresh delivered code is neither labelled ใช้แล้ว nor greyed out', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const state: StubState = { orders: [], options: { wallet: 'succeed', poll: 'pending' } };
      await installStubs(page, state);

      await page.goto('/account/codes');
      await expect(page.getByText('FRESH-CODE-AAAA')).toBeVisible({ timeout: 30_000 });

      await expect(page.getByText('ใช้แล้ว')).toHaveCount(0);
      await expect(page.getByText('FRESH-CODE-BBBB')).toBeVisible();

      // Neither card may be dimmed: `opacity-60` was the "used" styling.
      const dimmed = await page.locator('div.rounded-md.opacity-60').count();
      expect(dimmed, 'no code card may be dimmed as already used').toBe(0);

      const opacity = await page
        .getByText('FRESH-CODE-AAAA')
        .evaluate((el) => {
          let node: HTMLElement | null = el as HTMLElement;
          while (node && node !== document.body) {
            const value = Number(getComputedStyle(node).opacity);
            if (value < 1) return value;
            node = node.parentElement;
          }
          return 1;
        });
      expect(opacity).toBe(1);
    });
  });
}
