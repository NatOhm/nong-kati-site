import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { deflateRawSync } from 'node:zlib';

import { totp } from './helpers';

const prisma = new PrismaClient();

/** Generate a tiny valid PNG (8x8) - well under the 5 MB upload cap. */
function makeSlipPng(size = 8) {
  const raw = Buffer.alloc(size * size * 3);
  for (let i = 0; i < raw.length; i += 3) {
    raw[i] = 0x41;
    raw[i + 1] = 0x42;
    raw[i + 2] = 0x43;
  }
  const deflated = deflateRawSync(raw);
  const png = Buffer.alloc(8 + deflated.length + 12 + 4);
  png.writeUInt32LE(0x89504e47, 0);
  png.writeUInt32LE(0x0d0a1a0a, 4);
  png.writeUInt32LE(size, 8);
  png.writeUInt32LE(size, 12);
  png.writeUInt8(8, 16);
  png.writeUInt8(2, 17);
  png.writeUInt8(0, 18);
  png.writeUInt8(0, 19);
  png.writeUInt8(0, 20);
  png.writeUInt32LE(0x00000000, 21);
  png.writeUInt32LE(deflated.length, 25);
  deflated.copy(png, 29);
  png.writeUInt32LE(0, 29 + deflated.length);
  return png;
}

/** Fresh anonymous email per run. */
function freshEmail() {
  return 'pf-' + crypto.randomBytes(6).toString('hex') + '@nong-kati-test.local';
}

/** Server truth: the POST /api/v1/orders the checkout page sends. */
interface CreatedOrder {
  id: string;
  orderNumber: string;
  confirmationUuid: string;
  status: string;
}

function captureOrderCreation(page: import('@playwright/test').Page): {
  body: () => CreatedOrder | null;
} {
  let created: CreatedOrder | null = null;
  page.on('response', async (res) => {
    if (res.url().endsWith('/api/v1/orders') && res.request().method() === 'POST') {
      try {
        created = ((await res.json()) as { order: CreatedOrder } | null)?.order ?? null;
      } catch {
        /* body already consumed by the page */
      }
    }
  });
  return { body: () => created };
}

/** Assert the confirmation link renders the order (UF-01 Step 3). */
async function assertOrderPageVisible(
  page: import('@playwright/test').Page,
  order: { orderNumber: string; confirmationUuid: string },
) {
  const confirmation = await page.goto('/checkout/confirmation/' + order.confirmationUuid);
  expect(confirmation?.status()).toBe(200);
  await expect(page.getByText(order.orderNumber ?? '').first()).toBeVisible();
}

/** Order lookup by UUID (UF-01 Step 4). */
async function assertOrderLookup(order: { confirmationUuid: string }) {
  // The typed client, not $queryRawUnsafe: the old raw query interpolated
  // the UUID unquoted (every UUID is invalid SQL — numeric-shaped ones parse
  // as junk-after-literal, letter-shaped ones as unknown columns) AND left
  // the camelCase columns unquoted, so this leg never once passed. The
  // lookup under test is by confirmationUuid; how it is issued does not
  // change what it proves.
  const found = await prisma.order.findUnique({
    where: { confirmationUuid: order.confirmationUuid },
    select: { status: true },
  });
  expect(found, 'the confirmation UUID resolves to an order').toBeTruthy();
  expect(found?.status, 'the looked-up order is the one just completed').toBe('completed');
}
/** Add item to cart via the real product-page UI (server-side price + stock). */
async function addVariantToCart(
  page: import('@playwright/test').Page,
  slug: string,
  label: string,
  quantity = 1,
) {
  await page.goto('/product/' + slug);
  const card = page.locator('button[aria-pressed]').first();
  await card.waitFor({ state: 'visible', timeout: 30000 });
  await card.click();
  await page.getByRole('button', { name: /เพิ่มลงตะกร้า/ }).click();
  await expect(page.getByText(/เพิ่มลงตะกร้าแล้ว!/)).toBeVisible({ timeout: 15000 });
}

/**
 * Wait for the manual-transfer payment surface on checkout step 2.
 *
 * The old walk (button "โอนยอด" → radio "โอนเงินผ่านธนาคาร" → ดำเนินการต่อ)
 * targeted a checkout that no longer exists: step 2 now renders
 * PaymentMethodSelector with PromptPay preselected and — when the store
 * account is configured (manual-info enabled) — the transfer panel plus
 * SlipUploadPanel immediately, with no channel click required. Anchored on
 * the transfer-copy + the slip file button, both stable since the M8 rebuild.
 */
async function expectManualTransferSurface(page: import('@playwright/test').Page) {
  await expect(page.getByText('โอนยอด').first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'เลือกไฟล์สลิป' })).toBeVisible({
    timeout: 30000,
  });
}

/**
 * Upload the slip through the production manual-transfer path into the admin queue.
 *
 * The submit button and the acknowledgement copy both depend on whether
 * auto-verification is configured (slipVerifyEnabled): with a provider the
 * button reads ตรวจสลิป, the junk PNG never passes bank verification, and
 * the panel falls back to "สลิปถูกส่งให้แอดมินตรวจแล้ว…" with the provider's
 * reason kept; without one it reads ส่งสลิปให้แอดมิน and the upload API's own
 * "ได้รับสลิปแล้ว — …" copy shows. Both end-states mean the same server
 * truth — the slip sits in the admin queue — so the assertion accepts either.
 */
async function uploadManually(page: import('@playwright/test').Page) {
  const input = page.locator('input[type="file"]');
  await input.setInputFiles('e2e/fixtures/slip-8x8.png');
  const submit = page.getByRole('button', { name: /ตรวจสลิป$|ส่งสลิปให้แอดมิน$/ });
  await expect(submit).toBeVisible({ timeout: 15000 });
  await submit.click();
  await expect(page.getByText(/ได้รับสลิปแล้ว|สลิปถูกส่งให้แอดมินตรวจแล้ว/)).toBeVisible({
    timeout: 45_000,
  });
}

/** Real 2FA login for the seeded smoke super-admin (fixture from
 *  scripts/seed-management-smoke.mjs) — the admin-confirm leg needs a real
 *  session because /management/* is guarded by middleware + layout. */
async function adminLogin(page: Page): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const admin = await prisma.adminUser.findFirst({
    where: { email: { startsWith: `mgmt-smoke-${stamp}` } },
  });
  if (!admin) throw new Error('management smoke admin missing — run scripts/seed-management-smoke.mjs');
  const secret = admin.totpSecret ?? '';
  if (!secret) throw new Error('smoke admin has no TOTP secret');

  await page.goto('/management/login');
  await page.getByRole('textbox', { name: 'อีเมล' }).fill(admin.email);
  await page.getByRole('textbox', { name: 'รหัสผ่าน' }).fill('MgmtSmoke!2026x');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  const totpInput = page.getByRole('textbox', { name: 'รหัสยืนยัน 2FA' });
  await expect(totpInput).toBeVisible({ timeout: 20_000 });
  await totpInput.fill(totp(secret));
  await page.getByRole('button', { name: 'ยืนยัน' }).click();
  await page.waitForURL(/\/management\/dashboard/, { timeout: 30_000 });
}

test.describe('P0 purchase flow (guest -> order -> slip -> admin confirm -> confirmation link)', () => {
  test('guest checkout -> manual-transfer slip upload -> admin confirm -> confirmation link works', async ({
    page,
  }) => {
    test.setTimeout(300000);

    // Register the capture listener before any navigation; the body is read
    // only AFTER the contact step's POST lands (body() is a sync snapshot —
    // calling it at test start could only ever return null).
    const capture = captureOrderCreation(page);

    // Most recent product has stock; the real UI walk is deterministic.
    await addVariantToCart(page, 'hbo-max-7-4k-4', '7 วัน 4K (÷4)', 1);

    // Step 1 - contact form -> creates a pending_payment order (server truth).
    await page.goto('/checkout');
    await page.fill('input[id$="-email"]', freshEmail());
    await page.fill('input[id$="-phone"]', '0812345678');
    await page.check('input[id$="-tos"]');
    await page.getByRole('button', { name: 'ดำเนินการต่อ' }).click();

    // Server truth: wait for POST /api/v1/orders to land, then read it.
    await expect.poll(() => capture.body(), { timeout: 30000 }).toBeTruthy();
    const created = capture.body();
    expect(created, 'POST /api/v1/orders must have returned the order').toBeTruthy();

    // Step 2 - the manual-transfer surface renders directly (PromptPay is
    // preselected and the store account is configured); upload the slip.
    await expectManualTransferSurface(page);
    await uploadManually(page);

    // The slip-upload acknowledgement — manual copy ("ได้รับสลิปแล้ว — …") or
    // the auto-verify fallback ("…สลิปถูกส่งให้แอดมินตรวจแล้ว …"). Anchored
    // on the RESULT span, not a loose แอดมินตรวจ regex: the panel's helper
    // paragraph ("…ส่งให้แอดมินตรวจต่อทันที") matches that too and trips
    // strict mode.
    await expect(
      page.getByText(/สลิปถูกส่งให้แอดมินตรวจแล้ว|ได้รับสลิปแล้ว/),
    ).toBeVisible({ timeout: 30000 });

    // Server truth: the order is still pending_payment; the admin must confirm it.
    const status = await prisma.order.findUnique({
      where: { id: created!.id },
      select: { status: true },
    });
    expect(status?.status).toBe('pending_payment');

    // Admin confirms payment -> stock deducted, code claimed, email enqueued.
    // The order-detail route is a MODAL on /management/orders now (there is
    // no /management/orders/[id] page), and /management/* requires a real
    // 2FA session — log in as the seeded super-admin first.
    await adminLogin(page);
    await page.goto('/management/orders');
    await expect(page.getByRole('heading', { name: 'คำสั่งซื้อ' })).toBeVisible({
      timeout: 20_000,
    });
    // Narrow to the pending tab so the fresh order is guaranteed in view.
    await page.getByRole('button', { name: /^รอชำระเงิน \(\d+\)$/ }).click();
    const row = page.getByRole('row', { name: new RegExp(created!.orderNumber) });
    await expect(row, 'the new order is listed as pending').toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'ยืนยันการชำระเงิน' }).click();

    // The order must flip to completed through fulfilment.
    await expect
      .poll(
        async () => {
          const o = await prisma.order.findUnique({
            where: { id: created!.id },
            select: { status: true },
          });
          return o?.status;
        },
        { timeout: 30000, message: 'order must reach completed after admin confirm' },
      )
      .toBe('completed');

    // Codes were delivered to the customer.
    const delivered = await prisma.giftCode.count({
      where: { order: { id: created!.id }, status: 'delivered' },
    });
    expect(delivered).toBeGreaterThan(0);

    // UF-01 Step 3: the confirmation link renders the order + delivered codes.
    const order = await prisma.order.findUnique({
      where: { id: created!.id },
      select: { orderNumber: true, confirmationUuid: true },
    });
    expect(order).toBeTruthy();
    if (order) await assertOrderPageVisible(page, order);

    // UF-01 Step 4: API lookup by confirmation UUID works.
    if (order) await assertOrderLookup(order);
  });
});
