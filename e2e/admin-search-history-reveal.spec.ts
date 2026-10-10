import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { totp } from './helpers';

/**
 * The A1–A3 admin flows in the browser: order search, customer history, and
 * the audited delivery-code reveal — the three routes that shipped with
 * server-side coverage only (authz-matrix + a denied-path smoke), so CI could
 * go green with the admin UI never calling them at all.
 *
 * Fixture (scripts/seed-management-smoke.mjs, run before the server starts):
 *  - `mgmt-smoke-support-*@test.local` — support_agent: orders:read (MASKED),
 *    customers:read, orders:delivery:reveal → the ALLOWED leg of all three
 *    flows. Using a non-super-admin role proves the journeys are permission-
 *    driven rather than accidentally super-admin-only.
 *  - `mgmt-smoke-finance-*@test.local` — finance_viewer: orders:read:full but
 *    neither customers:read nor orders:delivery:reveal → the DENIED leg
 *    (raw PII in search, 403 on history/reveal).
 *  - customer `mgmt-smoke-history@test.local` linked to `NK-…-HIST1`, a
 *    COMPLETED order with one DELIVERED code whose plaintext is KNOWN
 *    (`HISTSMOKE-E2E-CODE-0001`). The known plaintext is the whole point:
 *    the reveal spec can then assert the exact string appears ONLY after the
 *    audited reveal, and that customer history — masked or full — never
 *    contains it. A random plaintext could prove neither half.
 *
 * Why each assertion lives here:
 *  - Search/history/reveal permission behaviour was only unit-verified; the
 *    browser is where a staff member would actually hit it.
 *  - The reveal goes through window.confirm, which Playwright dismisses by
 *    default — so the cancel path (no fetch, no audit row) is asserted first,
 *    then the confirm path (code shown, audit row written).
 *  - History's "no raw codes" invariant is a DATA-shape guarantee (the
 *    endpoint never returns code plaintext) plus a rendering guarantee; both
 *    are asserted against the known plaintext.
 *
 * Assertions read the DATABASE (read-only) for audit rows, mirroring
 * order-refund-resend.spec.ts: the UI claims success before the server does.
 * No production credentials are involved; NK_GIFT_CODE_ENCRYPTION_KEY and the
 * seeded admins are test-fixture material from the CI job environment.
 */
const prisma = new PrismaClient();

const PASSWORD = 'MgmtSmoke!2026x';
const ORDER_NUMBER = `NK-${new Date().getFullYear()}-HIST1`;
const HISTORY_EMAIL = 'mgmt-smoke-history@test.local';
const MASKED_HISTORY_EMAIL = 'm***@test.local';
const RAW_CODE = 'HISTSMOKE-E2E-CODE-0001';

let supportEmail: string;
let supportTotp: string;
let financeEmail: string;
let financeTotp: string;
let customerId: string;
let orderId: string;

test.describe('admin order search, customer history and delivery reveal', () => {
  test.beforeAll(async () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const support = await prisma.adminUser.findFirst({
      where: { email: { startsWith: `mgmt-smoke-support-${stamp}` } },
    });
    if (!support)
      throw new Error('support_agent smoke admin missing — run scripts/seed-management-smoke.mjs');
    supportEmail = support.email;
    supportTotp = support.totpSecret ?? '';
    if (!supportTotp) throw new Error('support smoke admin has no TOTP secret');

    const finance = await prisma.adminUser.findFirst({
      where: { email: { startsWith: `mgmt-smoke-finance-${stamp}` } },
    });
    if (!finance)
      throw new Error('finance_viewer smoke admin missing — run scripts/seed-management-smoke.mjs');
    financeEmail = finance.email;
    financeTotp = finance.totpSecret ?? '';
    if (!financeTotp) throw new Error('finance smoke admin has no TOTP secret');

    const customer = await prisma.customer.findUnique({ where: { email: HISTORY_EMAIL } });
    if (!customer)
      throw new Error('history fixture customer missing — run scripts/seed-management-smoke.mjs');
    customerId = customer.id;

    const order = await prisma.order.findUnique({
      where: { orderNumber: ORDER_NUMBER },
      select: { id: true },
    });
    if (!order) throw new Error('history fixture order missing — run scripts/seed-management-smoke.mjs');
    orderId = order.id;
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  /** The real 2FA login, parameterised by which seeded role signs in. */
  async function login(page: Page, email: string, secret: string): Promise<void> {
    await page.goto('/management/login');
    await page.getByRole('textbox', { name: 'อีเมล' }).fill(email);
    await page.getByRole('textbox', { name: 'รหัสผ่าน' }).fill(PASSWORD);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    const totpInput = page.getByRole('textbox', { name: 'รหัสยืนยัน 2FA' });
    await expect(totpInput).toBeVisible({ timeout: 20_000 });
    await totpInput.fill(totp(secret));
    await page.getByRole('button', { name: 'ยืนยัน' }).click();
    await page.waitForURL(/\/management\/dashboard/, { timeout: 30_000 });
  }

  /** Search by order number and open the fixture order's detail modal. */
  async function openFixtureOrderDetail(page: Page): Promise<void> {
    await page.goto('/management/orders');
    await expect(page.getByRole('heading', { name: 'คำสั่งซื้อ' })).toBeVisible({
      timeout: 20_000,
    });
    // Filter first — the unfiltered list is capped and other specs in this
    // job have already created orders.
    await page.getByPlaceholder('ค้นหาหมายเลขคำสั่งซื้อ...').fill('HIST1');
    await page.getByPlaceholder('ค้นหาหมายเลขคำสั่งซื้อ...').press('Enter');
    const row = page.getByRole('row', { name: new RegExp(ORDER_NUMBER) });
    await expect(row, `${ORDER_NUMBER} is listed by its order-number filter`).toBeVisible({
      timeout: 20_000,
    });
    await row.getByRole('button', { name: 'ดู' }).click();
    await expect(
      page.getByRole('heading', { name: `คำสั่งซื้อ ${ORDER_NUMBER}` }),
      'detail modal opened',
    ).toBeVisible({ timeout: 20_000 });
  }

  const revealAuditCount = () =>
    prisma.auditLog.count({ where: { action: 'order.delivery_revealed', recordId: orderId } });

  test('support_agent searches by email and order number with the email masked', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, supportEmail, supportTotp);
    await page.goto('/management/orders');
    await expect(page.getByRole('heading', { name: 'คำสั่งซื้อ' })).toBeVisible({
      timeout: 20_000,
    });

    // Email filter — the WHERE clause matches the raw email server-side, but
    // support_agent lacks orders:read:full, so the row it gets back is masked.
    await page.getByPlaceholder('ค้นหาอีเมลลูกค้า...').fill('mgmt-smoke-history');
    await page.getByPlaceholder('ค้นหาอีเมลลูกค้า...').press('Enter');
    const row = page.getByRole('row', { name: new RegExp(ORDER_NUMBER) });
    await expect(row, 'order found by customer-email filter').toBeVisible({ timeout: 20_000 });
    await expect(
      row,
      'support_agent has no orders:read:full — the list must show a masked email',
    ).toContainText(MASKED_HISTORY_EMAIL);
    await expect(row, 'raw email never reaches a masked role').not.toContainText(HISTORY_EMAIL);

    // Order-number filter, after clearing the email filter.
    await page.getByRole('button', { name: 'ล้างตัวกรอง' }).click();
    await page.getByPlaceholder('ค้นหาหมายเลขคำสั่งซื้อ...').fill('HIST1');
    await page.getByPlaceholder('ค้นหาหมายเลขคำสั่งซื้อ...').press('Enter');
    await expect(
      page.getByRole('row', { name: new RegExp(ORDER_NUMBER) }),
      'order found by order-number filter',
    ).toBeVisible({ timeout: 20_000 });

    // A filter matching nothing empties the table — it must never silently
    // fall back to the unfiltered list.
    await page.getByRole('button', { name: 'ล้างตัวกรอง' }).click();
    await page.getByPlaceholder('ค้นหาหมายเลขคำสั่งซื้อ...').fill('NO-SUCH-ORDER-ZZZ9');
    await page.getByPlaceholder('ค้นหาหมายเลขคำสั่งซื้อ...').press('Enter');
    await expect(page.getByText('ไม่พบคำสั่งซื้อในสถานะนี้')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('row', { name: new RegExp(ORDER_NUMBER) })).toHaveCount(0);
  });

  test('support_agent reads customer history without any raw delivery code', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, supportEmail, supportTotp);
    await page.goto('/management/customers');
    await expect(page.getByRole('heading', { name: 'ลูกค้า' })).toBeVisible({ timeout: 20_000 });

    await page.getByPlaceholder('ค้นหาอีเมล หรือชื่อ...').fill('mgmt-smoke-history');
    await page.getByPlaceholder('ค้นหาอีเมล หรือชื่อ...').press('Enter');
    const row = page.getByRole('row', { name: MASKED_HISTORY_EMAIL });
    await expect(row, 'customer list row (masked for support_agent)').toBeVisible({
      timeout: 20_000,
    });
    await row.getByRole('button', { name: 'ดู' }).click();

    // The detail modal loads the customer and, alongside it, the history
    // endpoint — this heading proves the real history section rendered
    // rather than the recentOrders preview fallback.
    await expect(page.getByRole('heading', { name: 'MGMT Smoke History' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/ประวัติคำสั่งซื้อ \(1 รายการ\)/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(ORDER_NUMBER)).toBeVisible();
    // Per-item delivery status is part of the history payload for every role.
    await expect(page.getByText('(delivered)')).toBeVisible();

    const body = await page.locator('body').innerText();
    expect(body, 'history never exposes the raw delivery code').not.toContain(RAW_CODE);
  });

  test('a support_agent reveals a delivery code only after confirming, and it is audited', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, supportEmail, supportTotp);
    await openFixtureOrderDetail(page);

    // window.confirm is dismissed by default in Playwright — own the dialog
    // explicitly so the cancel leg and the confirm leg are both deliberate.
    let acceptDialog = false;
    page.on('dialog', (dialog) => {
      void (acceptDialog ? dialog.accept() : dialog.dismiss());
    });

    const auditBefore = await revealAuditCount();
    const revealButton = page.getByRole('button', {
      name: 'เปิดเผยโค้ดส่งมอบสำหรับออเดอร์นี้',
    });
    await expect(revealButton).toBeVisible();

    // Cancel path: dismissing the confirm must fetch nothing and audit nothing.
    await revealButton.click();
    await expect(page.getByRole('heading', { name: /โค้ดส่งมอบ —/ })).toHaveCount(0);
    expect(await revealAuditCount(), 'a cancelled confirm writes no audit row').toBe(auditBefore);

    // Confirm path: the KNOWN plaintext becomes visible only now.
    acceptDialog = true;
    await revealButton.click();
    await expect(page.getByRole('heading', { name: /โค้ดส่งมอบ —/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(RAW_CODE)).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(revealAuditCount, {
        timeout: 20_000,
        message: 'the reveal writes an audit row per disclosed code',
      })
      .toBeGreaterThan(auditBefore);
  });

  test('a finance_viewer sees full PII in search but is denied the reveal', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, financeEmail, financeTotp);
    await page.goto('/management/orders');
    await expect(page.getByRole('heading', { name: 'คำสั่งซื้อ' })).toBeVisible({
      timeout: 20_000,
    });

    // Same search as the masked leg, opposite shaping: finance_viewer holds
    // orders:read:full, so the raw email is expected here — masking is
    // permission-scoped, not blanket.
    await page.getByPlaceholder('ค้นหาหมายเลขคำสั่งซื้อ...').fill('HIST1');
    await page.getByPlaceholder('ค้นหาหมายเลขคำสั่งซื้อ...').press('Enter');
    const row = page.getByRole('row', { name: new RegExp(ORDER_NUMBER) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row, 'finance_viewer holds orders:read:full → raw email').toContainText(
      HISTORY_EMAIL,
    );

    await row.getByRole('button', { name: 'ดู' }).click();
    await expect(
      page.getByRole('heading', { name: `คำสั่งซื้อ ${ORDER_NUMBER}` }),
      'detail modal opened',
    ).toBeVisible({ timeout: 20_000 });

    page.on('dialog', (dialog) => {
      void dialog.accept();
    });
    const auditBefore = await revealAuditCount();
    await page
      .getByRole('button', { name: 'เปิดเผยโค้ดส่งมอบสำหรับออเดอร์นี้' })
      .click();

    // The server answers 403 INSUFFICIENT_PERMISSIONS; the UI must say so
    // without opening the reveal modal or leaking any code.
    await expect(page.getByText('ไม่มีสิทธิ์เปิดเผยโค้ดส่งมอบ')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /โค้ดส่งมอบ —/ })).toHaveCount(0);
    const body = await page.locator('body').innerText();
    expect(body, 'a denied reveal exposes no code').not.toContain(RAW_CODE);
    expect(await revealAuditCount(), 'a denied reveal writes no audit row').toBe(auditBefore);
  });

  test('history: 200 without code plaintext for support_agent, 403 for finance_viewer', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // API-level legs, because no role can open the history UI while being
    // denied the history endpoint: the list and the history endpoint share
    // customers:read, so a UI-level 403 there would just be the list failing.
    async function tokenFor(email: string, secret: string): Promise<string> {
      const loginRes = await page.request.post('/api/v1/auth/admin/login', {
        data: { email, password: PASSWORD },
      });
      expect(loginRes.ok(), `admin login for ${email}`).toBeTruthy();
      const challenge = (await loginRes.json()) as { challengeToken?: string };
      const confirm = await page.request.post('/api/v1/auth/admin/2fa', {
        data: { challengeToken: challenge.challengeToken, code: totp(secret) },
      });
      expect(confirm.ok(), `2FA for ${email}`).toBeTruthy();
      const session = (await confirm.json()) as { accessToken?: string };
      expect(session.accessToken, '2FA yields a bearer token').toBeTruthy();
      return session.accessToken ?? '';
    }

    const supportToken = await tokenFor(supportEmail, supportTotp);
    const allowed = await page.request.get(
      `/api/v1/admin/customers/${customerId}/history`,
      { headers: { Authorization: `Bearer ${supportToken}` } },
    );
    expect(allowed.status(), 'support_agent holds customers:read').toBe(200);
    const allowedBody = await allowed.text();
    expect(allowedBody, 'history lists the fixture order').toContain(ORDER_NUMBER);
    expect(allowedBody, 'history payload carries no code plaintext').not.toContain(RAW_CODE);

    const financeToken = await tokenFor(financeEmail, financeTotp);
    const denied = await page.request.get(
      `/api/v1/admin/customers/${customerId}/history`,
      { headers: { Authorization: `Bearer ${financeToken}` } },
    );
    expect(denied.status(), 'finance_viewer lacks customers:read').toBe(403);
    const deniedJson = (await denied.json()) as { error?: string; orders?: unknown };
    expect(deniedJson.error).toBe('INSUFFICIENT_PERMISSIONS');
    expect(deniedJson.orders, 'denied response carries no order data').toBeUndefined();
  });
});
