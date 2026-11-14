/**
 * Shared fixture for the /management reconciliation spec
 * (`e2e/management.spec.ts`), used by both `seed-management-smoke.mjs` and the
 * spec's own `beforeAll` so a second run of the suite starts from exactly the
 * same state as the first.
 *
 * The stranded order has to be *repaired*, not just flipped back to
 * pending_payment: `OrderItem.variantId` is nullable since the 2026-10-25
 * catalog purge, so once the variant was deleted the item kept its snapshot
 * name but lost the only link fulfilment can deliver against. The queue row
 * still looked like the right webhook gap, every rerun failed, and the order
 * drifted to `expired` — the spec then failed with "order must reach completed
 * after rerun" for a fixture reason, not a product one.
 */
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

function giftKey(): Buffer {
  const keyHex = process.env['NK_GIFT_CODE_ENCRYPTION_KEY'];
  if (!keyHex) throw new Error('NK_GIFT_CODE_ENCRYPTION_KEY environment variable is not set');
  return Buffer.from(keyHex, 'hex');
}

export function encryptCode(plainCode: string): { ciphertext: Buffer; nonce: Buffer } {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', giftKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(plainCode, 'utf8'), cipher.final()]);
  return { ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]), nonce };
}

export function hashCode(plainCode: string): Buffer {
  return crypto.createHash('sha256').update(plainCode.trim().toUpperCase()).digest();
}

/** Stranded paid order number used by the spec (year-scoped like the app). */
export function strandedOrderNumber(): string {
  return `NK-${new Date().getFullYear()}-MGMT01`;
}

/**
 * Put the stranded fixture back to "money in, order stuck": pending_payment,
 * a succeeded manual-transfer attempt, a live variant on the line, and one
 * available code so the rerun can actually deliver.
 */
export async function resetStrandedOrder(db: PrismaClient) {
  const variant = await db.productVariant.findFirst({
    where: { isActive: true, stock: { gt: 0 } },
    include: { product: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!variant) throw new Error('no active stocked variant found — run seed-smoke.mjs first');

  const orderNumber = strandedOrderNumber();
  const totalThb = Number(variant.price ?? 25);
  const existing = await db.order.findUnique({ where: { orderNumber } });

  const order = existing
    ? await db.order.update({
        where: { orderNumber },
        data: {
          status: 'pending_payment',
          customerEmail: 'mgmt-smoke-customer@test.local',
          paymentMethod: 'manual_transfer',
          subtotalThb: totalThb,
          vatAmountThb: 0,
          totalAmountThb: totalThb,
          expiredAt: null,
          completedAt: null,
          manualFulfilmentReason: null,
        },
      })
    : await db.order.create({
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
        },
      });

  // Re-attach the line to a real variant and reset its delivery state.
  const lineData = {
    variantId: variant.id,
    productNameTh: variant.product.name,
    productNameEn: variant.product.name,
    skuCode: variant.product.sku ?? variant.id,
    denominationThb: totalThb,
    unitPriceThb: totalThb,
    unitPriceExVat: totalThb,
    unitVatAmount: 0,
    lineTotalThb: totalThb,
    quantity: 1,
    deliveryStatus: 'pending',
    deliveredAt: null,
  };
  const items = await db.orderItem.findMany({ where: { orderId: order.id } });
  if (items.length === 0) {
    await db.orderItem.create({ data: { ...lineData, orderId: order.id } });
  } else {
    for (const item of items) {
      await db.orderItem.update({ where: { id: item.id }, data: lineData });
    }
  }

  // A previous pass delivered codes against this order; hand them back so the
  // rerun has stock. Scoped to this fixture order only.
  await db.giftCode.updateMany({
    where: { orderId: order.id },
    data: { orderId: null, orderItemId: null, status: 'available', deliveredAt: null },
  });

  // Succeeded manual-transfer attempt = the "money in, order stuck" signal.
  const current = await db.paymentAttempt.findFirst({ where: { orderId: order.id } });
  if (current) {
    await db.paymentAttempt.update({
      where: { id: current.id },
      data: { status: 'succeeded', failureReason: null, webhookReceivedAt: new Date() },
    });
  } else {
    await db.paymentAttempt.create({
      data: {
        orderId: order.id,
        paymentMethod: 'manual_transfer',
        status: 'succeeded',
        amountThb: totalThb,
        gatewayName: 'manual',
        gatewayRef: `mgmt-smoke-${orderNumber}`,
        webhookReceivedAt: new Date(),
      },
    });
  }

  const codesAvailable = await db.giftCode.count({
    where: { variantId: variant.id, status: 'available', orderId: null },
  });
  let codesCreated = 0;
  for (let i = codesAvailable; i < 1; i++) {
    const plain = `MGMTSMOKE-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const enc = encryptCode(plain);
    await db.giftCode.create({
      data: {
        variantId: variant.id,
        codeEncrypted: enc.ciphertext,
        codeHash: hashCode(plain),
        nonce: enc.nonce,
        status: 'available',
      },
    });
    codesCreated += 1;
  }

  return { variant, totalThb, orderId: order.id, codesCreated, codesAvailable };
}
