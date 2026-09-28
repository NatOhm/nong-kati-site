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
  console.log(`[mgmt-smoke] admin login: ${admin.email} / ${PASSWORD} (TOTP from DB secret)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
