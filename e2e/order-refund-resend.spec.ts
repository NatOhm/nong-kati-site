import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { totp } from './helpers';

/**
 * Admin refund + resend controls on the order-detail modal.
 *
 * Both shipped in 446b395 with no browser coverage, which is the least useful
 * kind of untested surface: they are the controls an operator reaches for
 * when money has already gone wrong. A refund that writes a row without
 * flipping the order, or a resend that claims success when nothing was
 * delivered, would be found by a human in production rather than by CI.
 *
 * Fixture (scripts/seed-management-smoke.mjs): `NK-…-RFND01`, an order
 * already in `completed` with one DELIVERED gift code. The stranded order in
 * management.spec.ts cannot stand in — a refund is only valid from
 * `completed`, and the resend button only renders for `completed` /
 * `refunded` — so without this order neither control is reachable at all.
 *
 * Assertions are read from the DATABASE, not the UI copy. The UI already
 * claims success the moment the endpoint answers 200; what has to hold is that
 * the row, the status flip, the voided code, and the audit row all landed.
 *
 * No email provider is configured in this job (NK_RESEND_API_KEY is
 * deliberately absent), and lib/email/resend.ts is fail-closed, so the resend
 * leg asserts the HONEST FAILURE — the audit #2 invariant that a send with no
 * credentials reports failure instead of inventing a message id.
 */
const prisma = new PrismaClient();

const REFUND_ORDER_NUMBER = `NK-${new Date().getFullYear()}-RFND01`;
const ADMIN_PASSWORD = 'MgmtSmoke!2026x';

let adminEmail: string;
let adminId: string;
let totpSecret: string;
let orderId: string;
let orderTotalThb: number;

test.describe('admin refund and resend controls', () => {
  test.beforeAll(async () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const admin = await prisma.adminUser.findFirst({
      where: { email: { startsWith: `mgmt-smoke-${stamp}` } },
    });
    if (!admin)
      throw new Error('management smoke admin missing — run scripts/seed-management-smoke.mjs');
    adminEmail = admin.email;
    adminId = admin.id;
    totpSecret = admin.totpSecret ?? '';
    if (!totpSecret) throw new Error('smoke admin has no TOTP secret');

    const order = await prisma.order.findUnique({
      where: { orderNumber: REFUND_ORDER_NUMBER },
      select: { id: true, totalAmountThb: true },
    });
    if (!order) throw new Error('refund fixture order missing — re-run the seed script');
    orderId = order.id;
    orderTotalThb = Number(order.totalAmountThb);

    // Idempotent reruns. A refund is one-way (a Refund row is unique per
    // order and the status never returns to `completed`), so a second CI pass
    // against the same database would start with the control correctly hidden
    // and assert nothing. Put the fixture back exactly as the seed left it.
    // Audit rows are cleared by the refund ids they point at, not by action
    // name — a blanket delete would take out a real operator's history.
    const stale = await prisma.refund.findMany({ where: { orderId }, select: { id: true } });
    if (stale.length > 0) {
      await prisma.auditLog.deleteMany({ where: { recordId: { in: stale.map((r) => r.id) } } });
      await prisma.refund.deleteMany({ where: { orderId } });
    }
    await prisma.order.update({ where: { id: orderId }, data: { status: 'completed' } });
    // A previous pass voided the delivered code; the void step is what this
    // spec exists to prove, so the code has to be deliverable again first.
    await prisma.giftCode.updateMany({
      where: { orderId, status: 'voided' },
      data: { status: 'delivered', voidedById: null, voidReason: null, voidedAt: null },
    });

    const deliverable = await prisma.giftCode.count({
      where: { orderId, status: { in: ['reserved', 'delivered'] } },
    });
    if (deliverable < 1) throw new Error('refund fixture has no deliverable code to void');
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  /** The real 2FA login, so the session cookie under test is a real one. */
  async function login(page: Page): Promise<void> {
    await page.goto('/management/login');
    await page.getByRole('textbox', { name: 'อีเมล' }).fill(adminEmail);
    await page.getByRole('textbox', { name: 'รหัสผ่าน' }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    const totpInput = page.getByRole('textbox', { name: 'รหัสยืนยัน 2FA' });
    await expect(totpInput).toBeVisible({ timeout: 20_000 });
    await totpInput.fill(totp(totpSecret));
    await page.getByRole('button', { name: 'ยืนยัน' }).click();
    await page.waitForURL(/\/management\/dashboard/, { timeout: 30_000 });
  }

  /** Open the fixture order's detail modal, narrowing to the refunded/completed tab. */
  async function openDetail(page: Page, tabName: RegExp): Promise<void> {
    await page.goto('/management/orders');
    await expect(page.getByRole('heading', { name: 'คำสั่งซื้อ' })).toBeVisible({
      timeout: 20_000,
    });
    // Filter first: the unfiltered list is capped at 100 rows and other specs
    // in this job have already created orders.
    await page.getByRole('button', { name: tabName }).click();
    const row = page.getByRole('row', { name: /RFND01/ });
    await expect(row, `${REFUND_ORDER_NUMBER} is listed`).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'ดู' }).click();
    await expect(
      page.getByRole('heading', { name: `คำสั่งซื้อ ${REFUND_ORDER_NUMBER}` }),
      'detail modal opened',
    ).toBeVisible({ timeout: 20_000 });
  }

  const refundForm = (page: Page) => page.getByLabel('หมายเลขอ้างอิงจากเกตเวย์ (จำเป็น)');

  test('refund is refused without a gateway reference and records nothing', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    await openDetail(page, /^สำเร็จ \(\d+\)$/);

    // The form says out loud that this records rather than moves money. An
    // operator who skips this box and refunds at the gateway too would be
    // handing money back twice.
    await expect(page.getByText('ระบบนี้บันทึกเท่านั้น')).toBeVisible();

    // Press submit with the required field untouched.
    await page.getByRole('button', { name: /บันทึกการคืนเงิน/ }).click();
    await expect(
      page.getByText('ต้องกรอกหมายเลขอ้างอิงการคืนเงินจากเกตเวย์'),
      'client-side error names the missing field',
    ).toBeVisible({ timeout: 20_000 });

    // Nothing reached the server: no row, no status change, codes untouched.
    expect(await prisma.refund.count({ where: { orderId } })).toBe(0);
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    expect(order?.status, 'a rejected submit leaves the order alone').toBe('completed');
  });

  test('recording a refund voids the code, writes the row and flips the order', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page);
    await openDetail(page, /^สำเร็จ \(\d+\)$/);

    await refundForm(page).fill('re_e2e_MGMT01_001');
    // Amount deliberately LEFT EMPTY: the copy promises an empty field means
    // the order total, and this is the regression that once sent 0 instead.
    // Asserting it is empty makes it certain we are exercising that branch
    // rather than accidentally typing a number.
    await expect(page.getByLabel('ยอดคืนเงิน (บาท)')).toHaveValue('');
    await page.getByLabel('หมวดเหตุผล').selectOption('customer_request');
    await page.getByLabel('รายละเอียดเพิ่มเติม (ไม่บังคับ)').fill('e2e — gateway already refunded');
    // The void checkbox is checked by default; leave it so the void is proved.
    await expect(page.getByRole('checkbox', { name: /void โค้ด/ })).toBeChecked();

    await page.getByRole('button', { name: /บันทึกการคืนเงิน/ }).click();
    await expect(
      page.getByText(/บันทึกการคืนเงินแล้ว/),
      'success notice, and the modal closes so the form cannot be re-submitted',
    ).toBeVisible({ timeout: 30_000 });

    // Server truth. The UI said "saved" before any of this was true.
    await expect
      .poll(
        async () =>
          (await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } }))
            ?.status,
        { timeout: 20_000, message: 'order must flip completed → refunded' },
      )
      .toBe('refunded');

    const refund = await prisma.refund.findFirst({ where: { orderId } });
    expect(refund, 'exactly one Refund row for the order').toBeTruthy();
    if (!refund) throw new Error('refund row missing after a reported success');
    expect(Number(refund.amountThb), 'empty amount field means the full order total').toBe(
      orderTotalThb,
    );
    expect(refund.gatewayRefundReference).toBe('re_e2e_MGMT01_001');
    expect(refund.reasonCategory).toBe('customer_request');
    expect(refund.reasonDetail).toBe('e2e — gateway already refunded');
    expect(refund.codesVoidedCount, 'the delivered code was counted as voided').toBeGreaterThan(0);
    expect(refund.initiatedBy, 'the refund records who pressed the button').toBe(adminId);

    const codes = await prisma.giftCode.findMany({
      where: { orderId },
      select: { status: true, voidedById: true },
    });
    expect(codes.length).toBeGreaterThan(0);
    expect(
      codes.every((c) => c.status === 'voided'),
      'every code on the order is voided',
    ).toBe(true);
    expect(codes[0]?.voidedById).toBe(adminId);

    // The audit row is in the SAME transaction as the refund; a refund without
    // it is the drift this endpoint exists to remove.
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'refund_issued', recordId: refund.id },
    });
    expect(audit, 'refund_issued audit row written against the Refund row').toBeTruthy();
    expect(audit?.actorId).toBe(adminId);
  });

  test('a refunded order hides the refund form but keeps the resend control', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    await openDetail(page, /^คืนเงิน \(\d+\)$/);

    // completed → refunded is one-way, so the form must be gone. Offering it
    // again would only ever produce a 409 the operator cannot act on.
    await expect(refundForm(page), 'refund form is not offered on a refunded order').toHaveCount(0);

    // Resend is a different decision — a refunded customer can still be
    // missing their codes — so it stays available.
    await expect(
      page.getByRole('button', { name: 'ส่งอีเมลยืนยันซ้ำให้ลูกค้า' }),
      'resend survives the refund',
    ).toBeVisible();
  });

  test('resend reports failure instead of claiming a send that never happened', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // If this job ever gains a real provider the outcome is a genuine send,
    // which this spec cannot predict or assert against a mailbox.
    test.skip(
      Boolean(process.env['NK_RESEND_API_KEY']) && Boolean(process.env['NK_RESEND_FROM_EMAIL']),
      'a real email provider is configured — the honest-failure leg does not apply',
    );

    await login(page);
    await openDetail(page, /^คืนเงิน \(\d+\)$/);

    await page.getByRole('button', { name: 'ส่งอีเมลยืนยันซ้ำให้ลูกค้า' }).click();

    // lib/email/resend.ts fails closed without credentials, but
    // sendEmailWithRetry still walks its 2s/4s/8s backoff before giving up —
    // roughly 11 seconds. The generous timeout is measuring that, not the UI.
    await expect(
      page.getByText(/ส่งอีเมลไม่สำเร็จ/),
      'the operator is told the send failed',
    ).toBeVisible({ timeout: 60_000 });

    // The invariant from audit #2: no invented success message.
    await expect(
      page.getByText(/ส่งอีเมลยืนยันซ้ำไปที่/),
      'no false claim that an email went out',
    ).toHaveCount(0);
  });

  test('a second refund of the same order is refused (ALREADY_REFUNDED)', async ({ page }) => {
    test.setTimeout(60_000);

    // The UI cannot produce this any more — the form is gone after the first
    // refund. The invariant still has to hold for a second operator, a retry,
    // or a stale tab, so it is driven straight at the endpoint.
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    test.skip(order?.status !== 'refunded', 'the refund tests did not run');

    const loginRes = await page.request.post('/api/v1/auth/admin/login', {
      data: { email: adminEmail, password: ADMIN_PASSWORD },
    });
    const challenge = (await loginRes.json()) as { challengeToken?: string };
    const confirm = await page.request.post('/api/v1/auth/admin/2fa', {
      data: { challengeToken: challenge.challengeToken, code: totp(totpSecret) },
    });
    const session = (await confirm.json()) as { accessToken?: string };
    const auth = session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}; // cookie flow — the request context carries the cookies

    const res = await page.request.post(`/api/v1/admin/orders/${orderId}/refund`, {
      headers: auth,
      data: { gatewayRefundReference: 're_e2e_MGMT01_double', refundAmountThb: orderTotalThb },
    });
    expect(res.status()).toBe(409);
    expect(((await res.json()) as { error?: string }).error).toBe('ALREADY_REFUNDED');

    expect(await prisma.refund.count({ where: { orderId } }), 'still exactly one refund').toBe(1);
  });
});
