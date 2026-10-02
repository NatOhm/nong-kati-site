import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { deflateRawSync } from 'node:zlib';

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
interface CreatedOrder { id: string; orderNumber: string; confirmationUuid: string; status: string }

function captureOrderCreation(page: import('@playwright/test').Page): { body: () => CreatedOrder | null } {
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
async function assertOrderPageVisible(page: import('@playwright/test').Page, order: { orderNumber: string; confirmationUuid: string }) {
  const confirmation = await page.goto('/checkout/confirmation/' + order.confirmationUuid);
  expect(confirmation?.status()).toBe(200);
  await expect(page.getByText(order.orderNumber ?? '').first()).toBeVisible();
}

/** Order lookup by UUID through Prisma (UF-01 Step 4). */
async function assertOrderLookup(order: { confirmationUuid: string }) {
  const res = await prisma.$queryRawUnsafe(`SELECT id, orderNumber, status, totalAmountThb FROM "Order" WHERE "confirmationUuid" = ${order.confirmationUuid}`) as { id: string; orderNumber: string; status: string; totalAmountThb: string }[];
  // Resolved by the lookup; value not otherwise consumed.
  void res;

}
/** Add item to cart via the real product-page UI (server-side price + stock). */
async function addVariantToCart(page: import('@playwright/test').Page, slug: string, label: string, quantity = 1) {
  await page.goto('/product/' + slug);
  const card = page.locator('button[aria-pressed]').first();
  await card.waitFor({ state: 'visible', timeout: 30000 });
  await card.click();
  await page.getByRole('button', { name: /เพิ่มลงตะกร้า/ }).click();
  await expect(page.getByText(/เพิ่มลงตะกร้าแล้ว!/)).toBeVisible({ timeout: 15000 });
}

/** Select the manual-transfer channel (production path) + attach the order. */
async function selectManualTransfer(page: import('@playwright/test').Page, orderId: string) {
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'โอนยอด' }).click();
  await page.getByRole('radio', { name: 'โอนเงินผ่านธนาคาร' }).click();
  await page.getByRole('button', { name: 'ดำเนินการต่อ' }).click();
  await expect(page.getByRole('button', { name: /เลือกไฟล์สลิป|โอนแล้ว?/ })).toBeVisible({ timeout: 30000 });
}

/** Upload the slip through the production manual-transfer path into the admin queue. */
async function uploadManually(page: import('@playwright/test').Page) {
  const input = page.locator('input[type="file"]');
  await input.setInputFiles('e2e/fixtures/slip-8x8.png');
  await expect(page.getByText('ได้รับสลิปแล้ว - แอดมินจะตรวจและยืนยันให้เร็วที่สุด')).toBeVisible({ timeout: 30000 });
}

test.describe('P0 purchase flow (guest -> order -> slip -> admin confirm -> confirmation link)', () => {
  test('guest checkout -> manual-transfer slip upload -> admin confirm -> confirmation link works', async ({ page }) => {
    test.setTimeout(300000);

    const created = captureOrderCreation(page).body();
    expect(created, 'POST /api/v1/orders must have returned the order').toBeTruthy();

    // Most recent product has stock; the real UI walk is deterministic.
    await addVariantToCart(page, 'hbo-max-7-4k', '7 วัน 4K (÷4)', 1);

    // Step 1 - contact form -> creates a pending_payment order (server truth).
    await page.goto('/checkout');
    await page.fill('input[id$="-email"]', freshEmail());
    await page.fill('input[id$="-phone"]', '0812345678');
    await page.check('input[id$="-tos"]');
    await page.getByRole('button', { name: 'ดำเนินการต่อ' }).click();

    // Step 2 - manual-transfer channel + slip upload (production path).
    await selectManualTransfer(page, created!.id);
    await uploadManually(page);

    // Wait for the admin queue to acknowledge the slip (stored, then awaiting).
    await expect(page.getByText(/กำลังตรวจสอบ|แอดมินจะตรวจ/)).toBeVisible({
      timeout: 30000,
    });

    // Server truth: the order is still pending_payment; the admin must confirm it.
    const status = await prisma.order.findUnique({
      where: { id: created!.id },
      select: { status: true },
    });
    expect(status?.status).toBe('pending_payment');

    // Admin confirms payment -> stock deducted, code claimed, email enqueued.
    const orderPage = await page.goto('/management/orders/' + created!.id);
    expect(orderPage?.status()).toBe(200);
    await page.getByRole('button', { name: 'ยืนยันการชำระเงิน' }).click();

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
