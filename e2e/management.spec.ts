import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import { totp } from './helpers';

/**
 * Management smoke (roadmap §6/§7 closure for the back office): the admin
 * must be able to reach the back office through the REAL 2FA login, see the
 * reconciliation queue, and actually repair a stranded paid order with the
 * rerun-fulfilment operator action — against the production build, the same
 * way CI covers the customer journey in smoke.spec.ts.
 *
 * Fixture (scripts/seed-management-smoke.mjs, run before the server starts):
 *  - a throwaway confirmed-TOTP super_admin (mgmt-smoke-*.test.local)
 *  - a stranded order NK-…-MGMT01: pending_payment + a SUCCEEDED
 *    manual-transfer attempt → the reconciliation "เงินเข้าแต่ออเดอร์ยังค้าง"
 *    (webhookGap) row
 *  - available gift codes on the variant so the rerun can complete
 *
 * The database runs in the same process context as the server under test
 * (CI: localhost:5432 service, local: 127.0.0.1:55432 embedded), addressed
 * via DATABASE_URL — read-only for assertions, writes only through the UI.
 */

const prisma = new PrismaClient();

test.describe('management back office smoke', () => {
  let adminEmail: string;
  let adminPassword: string;
  let totpSecret: string;
  test.beforeAll(async () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const admin = await prisma.adminUser.findFirst({
      where: { email: { startsWith: `mgmt-smoke-${stamp}` } },
    });
    if (!admin)
      throw new Error('management smoke admin missing — run scripts/seed-management-smoke.mjs');
    adminEmail = admin.email;
    adminPassword = 'MgmtSmoke!2026x';
    totpSecret = admin.totpSecret ?? '';
    if (!totpSecret) throw new Error('smoke admin has no TOTP secret');

    // Idempotent reruns: a previous pass left the order completed, which
    // removes it from the queue. Reset the fixture to the stranded state
    // (and top up one fulfilment code if the last run consumed it).
    const orderNumber = `NK-${new Date().getFullYear()}-MGMT01`;
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: { id: true, items: { select: { variantId: true, quantity: true } } },
    });
    if (order) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'pending_payment' },
      });
      await prisma.paymentAttempt.updateMany({
        where: { orderId: order.id },
        data: { status: 'succeeded', failureReason: null },
      });
      const variantId = order.items[0]?.variantId;
      if (variantId) {
        const available = await prisma.giftCode.count({
          where: { variantId, status: 'available', orderId: null },
        });
        if (available < 1) {
          const plain = `MGMTSMOKE-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
          const keyHex = process.env['NK_GIFT_CODE_ENCRYPTION_KEY'];
          if (!keyHex) throw new Error('NK_GIFT_CODE_ENCRYPTION_KEY not set for code reset');
          const nonce = crypto.randomBytes(12);
          const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), nonce);
          const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
          await prisma.giftCode.create({
            data: {
              variantId,
              codeEncrypted: Buffer.concat([encrypted, cipher.getAuthTag()]),
              codeHash: crypto.createHash('sha256').update(plain).digest(),
              nonce,
              status: 'available',
            },
          });
        }
      }
    }
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('admin login (2FA) → reconciliation queue → rerun-fulfilment completes a stranded paid order', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);

    // ── Step 1: credentials through the real UI ──────────────────────
    await page.goto('/management/login');
    await page.getByRole('textbox', { name: 'อีเมล' }).fill(adminEmail);
    await page.getByRole('textbox', { name: 'รหัสผ่าน' }).fill(adminPassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

    // ── Step 2: real TOTP from the seeded secret ─────────────────────
    const totpInput = page.getByRole('textbox', { name: 'รหัสยืนยัน 2FA' });
    await expect(totpInput).toBeVisible({ timeout: 20_000 });
    await totpInput.fill(totp(totpSecret));
    await page.getByRole('button', { name: 'ยืนยัน' }).click();

    // The layout verifies the HttpOnly cookies and admits the dashboard.
    await page.waitForURL(/\/management\/dashboard/, { timeout: 30_000 });
    const cookies = await context.cookies();
    const sessionFlag = cookies.find((c) => c.name === 'nk_admin_flag');
    expect(sessionFlag, 'session flag cookie set after 2FA login').toBeTruthy();

    // ── Step 3: open the reconciliation queue ────────────────────────
    // Go straight to the queue (sidebar is rendered by AdminShell, not a
    // stable landmark for the test); the page itself is the feature under
    // test and the login already proves the entry path works.
    await page.goto('/management/reconciliation');
    await expect(
      page.getByRole('heading', { name: 'Reconciliation' }),
      'queue page renders for a super admin',
    ).toBeVisible({ timeout: 20_000 });

    // ── Step 4: rerun-fulfilment on the stranded order ───────────────
    const stranded = await prisma.order.findUnique({
      where: { orderNumber: `NK-${new Date().getFullYear()}-MGMT01` },
      select: { id: true, status: true },
    });
    if (!stranded) throw new Error('stranded fixture order missing');
    const gapRow = page.getByRole('row', { name: /MGMT01/ });
    await expect(gapRow, 'stranded order appears in the webhook-gap section').toBeVisible();

    await gapRow.getByRole('button', { name: 'ส่งมอบอีกครั้ง' }).click();

    // Server truth beats UI copy: the rerun must flip the order through
    // fulfilment to completed and attach the seeded gift codes.
    await expect
      .poll(
        async () => {
          const o = await prisma.order.findUnique({
            where: { id: stranded.id },
            select: { status: true },
          });
          return o?.status;
        },
        { timeout: 30_000, message: 'order must reach completed after rerun' },
      )
      .toBe('completed');

    const delivered = await prisma.giftCode.count({
      where: { order: { id: stranded.id }, status: 'delivered' },
    });
    expect(delivered, 'codes attached to the order and marked delivered').toBeGreaterThan(0);

    // UI acknowledges: success notice or the row leaving the queue.
    await expect(page.locator('body')).toContainText(/ส่งมอบสำเร็จ|เสร็จสิ้นแล้ว|คิวงาน/);
  });

  test('rerun-fulfilment rejects a second press with ALREADY_SETTLED', async ({ page }) => {
    test.setTimeout(60_000);

    // API-level guard check with the same admin (no browser): the completed
    // order from the previous test must refuse a rerun, proving the CAS
    // protection the queue relies on.
    const completed = await prisma.order.findUnique({
      where: { orderNumber: `NK-${new Date().getFullYear()}-MGMT01` },
      select: { id: true, status: true },
    });
    test.skip(completed?.status !== 'completed', 'first test did not complete the order');

    const login = await page.request.post('/api/v1/auth/admin/login', {
      data: { email: adminEmail, password: adminPassword },
    });
    const challenge = (await login.json()) as { challengeToken?: string };
    const confirm = await page.request.post('/api/v1/auth/admin/2fa', {
      data: { challengeToken: challenge.challengeToken, code: totp(totpSecret) },
    });
    const session = (await confirm.json()) as { accessToken?: string };
    const auth = session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}; // cookie flow — request context carries the cookies

    const res = await page.request.post(
      `/api/v1/admin/reconciliation/${completed!.id}/rerun-fulfilment`,
      { headers: auth },
    );
    expect(res.status()).toBe(409);
    expect(((await res.json()) as { error?: string }).error).toBe('ALREADY_SETTLED');
  });
});
