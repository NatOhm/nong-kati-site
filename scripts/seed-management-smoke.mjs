/**
 * Seed the management-smoke environment (CI browser-smoke job, /management
 * coverage). Idempotent — safe to re-run and to skip when a prior pass
 * already created everything.
 *
 * 1. A throwaway super-admin (`mgmt-smoke-*@test.local`) with a KNOWN TOTP
 *    secret, so the browser spec can complete the real 2FA login. Confirmed
 *    secret (no enrollment step) — the spec logs in with the 6-digit code
 *    directly.
 * 2. One stranded order: status `pending_payment` + a SUCCEEDED
 *    manual-transfer PaymentAttempt (the exact webhookGap the reconciliation
 *    queue surfaces as "เงินเข้าแต่ออเดอร์ยังค้าง").
 * 3. Gift codes on the order's variant, encrypted with the runtime
 *    NK_GIFT_CODE_ENCRYPTION_KEY, so the operator's rerun-fulfilment can
 *    actually complete and deliver.
 * 4. A second, already-COMPLETED order with one DELIVERED code
 *    (`NK-...-RFND01`). The stranded order above cannot exercise the admin
 *    refund or resend controls: a refund is only valid from `completed`, and
 *    the resend button only renders for `completed` / `refunded`. Without this
 *    the order-detail modal's refund and resend paths have no fixture at all,
 *    which is how they shipped with no browser coverage.
 * 5. Two role-scoped admins for the A1–A3 permission legs
 *    (`e2e/admin-search-history-reveal.spec.ts`): `support_agent` (orders:read
 *    MASKED + customers:read + orders:delivery:reveal → the allowed browser
 *    journey) and `finance_viewer` (orders:read:full but neither
 *    customers:read nor orders:delivery:reveal → the denied journey).
 * 6. A customer linked to a COMPLETED order with one DELIVERED code whose
 *    plaintext is KNOWN (`HISTSMOKE-E2E-CODE-0001`): the reveal spec asserts
 *    this exact string appears only after the audited reveal and that customer
 *    history never contains it. A random plaintext could prove neither.
 *
 * Run: node scripts/seed-management-smoke.mjs
 */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Gift-code crypto (mirrors src/lib/crypto/giftCode.ts exactly) ──────
// Inlined because this is an .mjs script and the lib is TypeScript; the
// CI job exports NK_GIFT_CODE_ENCRYPTION_KEY for the server under test, so
// codes written here decrypt with the same key at fulfilment time.
function giftKey() {
  const keyHex = process.env['NK_GIFT_CODE_ENCRYPTION_KEY'];
  if (!keyHex) throw new Error('NK_GIFT_CODE_ENCRYPTION_KEY environment variable is not set');
  return Buffer.from(keyHex, 'hex');
}

function encryptCode(plainCode) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', giftKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(plainCode, 'utf8'), cipher.final()]);
  return { ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]), nonce };
}

function hashCode(plainCode) {
  return crypto.createHash('sha256').update(plainCode.trim().toUpperCase()).digest();
}

const EMAIL_PREFIX = 'mgmt-smoke';
const PASSWORD = 'MgmtSmoke!2026x';
// Fixed base32 secret (matches the checklist-e2e pattern) — the spec reads
// the created admin row from the DB anyway, so this is only a default.
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

function scryptHash(password) {
  const saltBuf = Buffer.from('a1b2c3d4e5f60718293a4b5c6d7e8f90', 'hex');
  const key = crypto.scryptSync(password, saltBuf, 64);
  // Must match src/lib/password.ts format: scrypt$N$r$p$salt$hash
  return `scrypt$16384$8$1$a1b2c3d4e5f60718293a4b5c6d7e8f90$${key.toString('hex')}`;
}

async function main() {
  // ── 1. Throwaway confirmed-TOTP super-admin ─────────────────────────
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const email = `${EMAIL_PREFIX}-${stamp}@test.local`;
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash: scryptHash(PASSWORD), totpSecret: TOTP_SECRET, status: 'active' },
    create: {
      email,
      fullName: 'Management Smoke Runner',
      role: 'super_admin',
      status: 'active',
      passwordHash: scryptHash(PASSWORD),
      totpSecret: TOTP_SECRET,
      totpConfirmed: true,
    },
  });
  console.log(`[mgmt-smoke] admin: ${admin.email}`);

  // ── 2. Stranded order + succeeded manual-transfer attempt ───────────
  const variant = await prisma.productVariant.findFirst({
    where: { isActive: true, stock: { gt: 0 } },
    include: { product: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!variant) throw new Error('no active stocked variant found — run seed-smoke.mjs first');

  const orderNumber = `NK-${new Date().getFullYear()}-MGMT01`;
  const totalThb = Number(variant.price ?? 25);
  const existing = await prisma.order.findUnique({ where: { orderNumber } });

  const order = existing
    ? await prisma.order.update({
        where: { orderNumber },
        data: {
          status: 'pending_payment',
          customerEmail: 'mgmt-smoke-customer@test.local',
          totalAmountThb: totalThb,
        },
      })
    : await prisma.order.create({
        data: {
          orderNumber,
          customerEmail: 'mgmt-smoke-customer@test.local',
          status: 'pending_payment',
          paymentMethod: 'manual_transfer',
          subtotalThb: totalThb,
          vatAmountThb: 0,
          totalAmountThb: totalThb,
          tosAcceptedAt: new Date(),
          confirmationUuid: crypto.randomUUID(),
          items: {
            create: [
              {
                variantId: variant.id,
                productNameTh: variant.product.name,
                productNameEn: variant.product.name,
                skuCode: variant.product.sku ?? variant.id,
                denominationThb: totalThb,
                quantity: 1,
                unitPriceThb: totalThb,
                unitPriceExVat: totalThb,
                unitVatAmount: 0,
                lineTotalThb: totalThb,
              },
            ],
          },
        },
      });

  // Succeeded manual-transfer attempt = the "money in, order stuck" signal.
  const attempt = await prisma.paymentAttempt.upsert({
    where: {
      id: (await prisma.paymentAttempt.findFirst({ where: { orderId: order.id } }))?.id ?? '',
    },
    update: { status: 'succeeded', failureReason: null, webhookReceivedAt: new Date() },
    create: {
      orderId: order.id,
      paymentMethod: 'manual_transfer',
      status: 'succeeded',
      amountThb: totalThb,
      gatewayName: 'manual',
      gatewayRef: `mgmt-smoke-${orderNumber}`,
      webhookReceivedAt: new Date(),
    },
  });
  console.log(`[mgmt-smoke] stranded order ${orderNumber} (${order.id}) attempt ${attempt.id}`);

  // ── 3. Gift codes so fulfilment can complete ────────────────────────
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  const availableCodes = await prisma.giftCode.count({
    where: { variantId: variant.id, status: 'available', orderId: null },
  });
  const need = Math.max(0, items.reduce((sum, it) => sum + it.quantity, 0) - availableCodes);
  for (let i = 0; i < need; i++) {
    const plain = `MGMTSMOKE-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const enc = encryptCode(plain);
    await prisma.giftCode.create({
      data: {
        variantId: variant.id,
        codeEncrypted: enc.ciphertext,
        codeHash: hashCode(plain),
        nonce: enc.nonce,
        status: 'available',
      },
    });
  }
  console.log(`[mgmt-smoke] gift codes ready (created ${need}, available ${availableCodes})`);

  // ── 4. Refund fixture — a COMPLETED order with a DELIVERED code ─────
  // Written straight to the final state rather than produced by clicking
  // through fulfilment: the spec needs a deterministic starting point, and
  // the fulfilment path itself is already covered by management.spec.ts.
  const refundOrderNumber = `NK-${new Date().getFullYear()}-RFND01`;
  const refundOrder = await prisma.order.upsert({
    where: { orderNumber: refundOrderNumber },
    update: {
      status: 'completed',
      customerEmail: 'mgmt-smoke-refund@test.local',
    },
    create: {
      orderNumber: refundOrderNumber,
      customerEmail: 'mgmt-smoke-refund@test.local',
      status: 'completed',
      paymentMethod: 'manual_transfer',
      subtotalThb: totalThb,
      vatAmountThb: 0,
      totalAmountThb: totalThb,
      tosAcceptedAt: new Date(),
      confirmationUuid: crypto.randomUUID(),
      items: {
        create: [
          {
            variantId: variant.id,
            productNameTh: variant.product.name,
            productNameEn: variant.product.name,
            skuCode: variant.product.sku ?? variant.id,
            denominationThb: totalThb,
            quantity: 1,
            unitPriceThb: totalThb,
            unitPriceExVat: totalThb,
            unitVatAmount: 0,
            lineTotalThb: totalThb,
            deliveryStatus: 'delivered',
            deliveredAt: new Date(),
          },
        ],
      },
    },
  });

  // One delivered code attached to the order. The refund endpoint voids
  // `reserved`/`delivered` codes, and this is what proves it did — an order
  // with no codes would let a broken void step pass unnoticed.
  const delivered = await prisma.giftCode.count({
    where: { orderId: refundOrder.id, status: { in: ['reserved', 'delivered'] } },
  });
  if (delivered < 1) {
    const plain = `RFNDSMOKE-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const enc = encryptCode(plain);
    await prisma.giftCode.create({
      data: {
        variantId: variant.id,
        orderId: refundOrder.id,
        codeEncrypted: enc.ciphertext,
        codeHash: hashCode(plain),
        nonce: enc.nonce,
        status: 'delivered',
      },
    });
  }
  console.log(`[mgmt-smoke] refund fixture ${refundOrderNumber} (${refundOrder.id}) completed`);

  // ── 5. Role-scoped admins — the allowed/denied legs of the A1–A3 spec ──
  // Same password and TOTP pattern as the super admin so the spec varies only
  // the account it signs in as. Roles come straight from ROLE_PERMISSIONS in
  // src/types/auth.ts: support_agent is the staff member who MAY search,
  // read history and reveal codes; finance_viewer is the auditor who may
  // search (with full PII) but may NOT read history or reveal codes.
  const roleAdmins = [
    {
      email: `${EMAIL_PREFIX}-support-${stamp}@test.local`,
      role: 'support_agent',
      fullName: 'Management Smoke Support',
    },
    {
      email: `${EMAIL_PREFIX}-finance-${stamp}@test.local`,
      role: 'finance_viewer',
      fullName: 'Management Smoke Finance',
    },
  ];
  for (const ra of roleAdmins) {
    await prisma.adminUser.upsert({
      where: { email: ra.email },
      update: {
        passwordHash: scryptHash(PASSWORD),
        totpSecret: TOTP_SECRET,
        status: 'active',
        role: ra.role,
      },
      create: {
        email: ra.email,
        fullName: ra.fullName,
        role: ra.role,
        status: 'active',
        passwordHash: scryptHash(PASSWORD),
        totpSecret: TOTP_SECRET,
        totpConfirmed: true,
      },
    });
    console.log(`[mgmt-smoke] role admin ${ra.role}: ${ra.email}`);
  }

  // ── 6. History/reveal fixture — customer + COMPLETED order + DELIVERED
  // code with a KNOWN plaintext. Written to final state (like RFND01) because
  // the spec needs a deterministic starting point; the fulfilment path itself
  // is already covered by management.spec.ts. Rerun-safe: restores the
  // completed/delivered state a prior pass may have disturbed.
  const HISTORY_EMAIL = 'mgmt-smoke-history@test.local';
  const HIST_CODE = 'HISTSMOKE-E2E-CODE-0001';
  const historyCustomer = await prisma.customer.upsert({
    where: { email: HISTORY_EMAIL },
    update: { status: 'active' },
    create: {
      email: HISTORY_EMAIL,
      fullName: 'MGMT Smoke History',
      emailVerified: true,
    },
  });

  const histOrderNumber = `NK-${new Date().getFullYear()}-HIST1`;
  const histItemData = {
    variantId: variant.id,
    productNameTh: variant.product.name,
    productNameEn: variant.product.name,
    skuCode: variant.product.sku ?? variant.id,
    denominationThb: totalThb,
    quantity: 1,
    unitPriceThb: totalThb,
    unitPriceExVat: totalThb,
    unitVatAmount: 0,
    lineTotalThb: totalThb,
    deliveryStatus: 'delivered',
    deliveredAt: new Date(),
  };
  let histOrder = await prisma.order.findUnique({
    where: { orderNumber: histOrderNumber },
    include: { items: true },
  });
  if (!histOrder) {
    histOrder = await prisma.order.create({
      data: {
        orderNumber: histOrderNumber,
        customerEmail: HISTORY_EMAIL,
        customerId: historyCustomer.id,
        status: 'completed',
        paymentMethod: 'manual_transfer',
        subtotalThb: totalThb,
        vatAmountThb: 0,
        totalAmountThb: totalThb,
        tosAcceptedAt: new Date(),
        completedAt: new Date(),
        confirmationUuid: crypto.randomUUID(),
        items: { create: [histItemData] },
      },
      include: { items: true },
    });
  } else {
    histOrder = await prisma.order.update({
      where: { id: histOrder.id },
      data: {
        status: 'completed',
        customerEmail: HISTORY_EMAIL,
        customerId: historyCustomer.id,
        completedAt: histOrder.completedAt ?? new Date(),
      },
      include: { items: true },
    });
    if (histOrder.items.length === 0) {
      await prisma.orderItem.create({ data: { ...histItemData, orderId: histOrder.id } });
    } else {
      await prisma.orderItem.updateMany({
        where: { orderId: histOrder.id },
        data: { deliveryStatus: 'delivered', deliveredAt: new Date() },
      });
    }
  }

  // The reveal endpoint reads codes THROUGH THE ITEM (giftCode.orderItemId);
  // an order-only attachment renders `0 โค้ด` in the reveal modal. Resolve the
  // item first (created above in either branch) and bind the code to it.
  const histItem = await prisma.orderItem.findFirst({ where: { orderId: histOrder.id } });
  if (!histItem) throw new Error('history fixture order has no item — seed script invariant broken');

  const histCode = await prisma.giftCode.findFirst({ where: { orderId: histOrder.id } });
  if (histCode) {
    await prisma.giftCode.update({
      where: { id: histCode.id },
      data: {
        status: 'delivered',
        orderItemId: histItem.id,
        voidedById: null,
        voidReason: null,
        voidedAt: null,
      },
    });
  } else {
    const enc = encryptCode(HIST_CODE);
    await prisma.giftCode.create({
      data: {
        variantId: variant.id,
        orderId: histOrder.id,
        orderItemId: histItem.id,
        codeEncrypted: enc.ciphertext,
        codeHash: hashCode(HIST_CODE),
        nonce: enc.nonce,
        status: 'delivered',
      },
    });
  }
  console.log(
    `[mgmt-smoke] history/reveal fixture ${histOrderNumber} (${histOrder.id}) for ${HISTORY_EMAIL}`,
  );

  console.log(`[mgmt-smoke] admin login: ${admin.email} / ${PASSWORD} (TOTP from DB secret)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
