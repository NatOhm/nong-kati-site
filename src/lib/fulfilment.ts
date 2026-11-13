/**
 * Order fulfilment core — single transaction that:
 * 1. Verifies every variant still has enough available gift codes
 * 2. Assigns codes FIFO (available → delivered, stamped with order/item)
 * 3. Decrements ProductVariant.stock
 * 4. Writes a StockMove row (sale) per variant
 * 5. Marks OrderItems delivered + order completed
 *
 * Concurrency: conditional giftCode.updateMany guards make double-allocation
 * impossible even under racing confirmations — each update only matches rows
 * still in 'available', so a losing racer updates 0 rows and aborts.
 *
 * Plaintext codes are decrypted in memory only, never logged or persisted
 * (10-digital-code.md §12).
 */

import { prisma } from '@/lib/db';
import { siteUrl } from '@/lib/siteUrl';
import { decryptCode } from '@/lib/crypto/giftCode';
import { enqueueEmail, scheduleOutboxDrain } from '@/lib/email/outbox';
import { orderConfirmationTemplate } from '@/lib/email/templates';

/** Re-export for route callers: schedule a delivery-worker run after the
 * response (serverless-safe). Keeps route imports one-deep. */
export { scheduleOutboxDrain };

/**
 * External audit #2 (2026-09-27): after a successful payment the customer
 * MUST receive their codes by email. The enqueue is TX-BOUND — it joins
 * the fulfilment transaction, so the email is promised exactly when the
 * codes/stock/order-status commit, across every confirmation path
 * (gateway webhook, wallet, slip-verify, admin verify). A transaction that
 * rolls back discards the email with it; a committed one always leaves a
 * durable outbox row behind for the delivery worker.
 *
 * Idempotent: code_delivery:<orderId> is unique — a repeat confirmation
 * (webhook redelivery, admin re-press, racing paths) never duplicates.
 */
export async function enqueueCodeDeliveryEmail(
  tx: PrismaTx,
  order: {
    id: string;
    confirmationUuid: string;
    orderNumber: string;
    customerEmail: string;
    items: Array<{
      id: string;
      productNameTh: string;
      denominationThb: unknown;
      quantity: number;
    }>;
    subtotalThb: unknown;
    vatAmountThb: unknown;
    vatEnabled?: boolean;
    vatRate?: unknown;
    totalAmountThb: unknown;
  },
  /** Plaintext codes allocated by the fulfilment transaction — the whole
   * point of this email (production review HIGH-1: the payload used to drop
   * them, so customers paid and received nothing by mail). */
  delivered: Array<{
    /** The order line this code was allocated for (see DeliveredCode). */
    orderItemId?: string;
    code: string;
    productName: string;
    denomination: number;
  }>,
): Promise<void> {
  // HIGH-1: the order page resolves by confirmationUuid, not by internal id —
  // the old /orders/<id> link 404'd for every customer.
  const confirmationUrl = `${siteUrl()}/orders/${order.confirmationUuid}`;
  // Attribute each code to the LINE it was allocated for (review 2026-11-06).
  // Matching by product name + denomination mislabelled any product that has
  // two variants at the same price: every line listed every code, so the mail
  // showed the same code twice and a customer could not tell which line a code
  // belonged to. The fulfilment transaction now stamps `orderItemId` on each
  // delivered code, and that is the match.
  //
  // Callers that pass no ids (template-level tests) keep the old name+price
  // match: without ids there is nothing better to use, and those callers
  // render a single line.
  const hasItemIds = delivered.every((d) => typeof d.orderItemId === 'string');
  const lines = order.items.map((item) => {
    const mine = hasItemIds
      ? delivered.filter((d) => d.orderItemId === item.id)
      : delivered.filter(
          (d) =>
            d.productName === item.productNameTh &&
            d.denomination === Number(item.denominationThb),
        );
    return {
      productNameTh: item.productNameTh,
      denomination: Number(item.denominationThb),
      quantity: item.quantity,
      ...(mine.length > 0 ? { codes: mine.map((d) => d.code) } : {}),
    };
  });
  const template = orderConfirmationTemplate({
    orderNumber: order.orderNumber,
    customerEmail: order.customerEmail,
    items: lines,
    subtotalThb: Number(order.subtotalThb),
    vatAmountThb: Number(order.vatAmountThb),
    vatEnabled: order.vatEnabled === true,
    vatRate: Number(order.vatRate ?? 0),
    totalAmountThb: Number(order.totalAmountThb),
    confirmationUrl,
  });
  await enqueueEmail({
    idempotencyKey: `code_delivery:${order.id}`,
    templateKey: 'code_delivery',
    to: order.customerEmail,
    subject: template.subject,
    html: template.html,
    tx,
  });
}

/** A delivered code as carried INSIDE the transaction, tied to its order line. */
export interface DeliveredCode {
  orderItemId: string;
  code: string;
  productName: string;
  denomination: number;
}

export interface FulfilmentResult {
  success: boolean;
  codes?: { code: string; productName: string; denomination: number }[];
  error?: 'INSUFFICIENT_STOCK' | 'ALREADY_FULFILLED' | 'ORDER_NOT_FOUND';
}

export type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Fulfil an order. When `tx` is supplied (webhook confirmation path), every
 * write joins the CALLER's transaction so payment confirmation + fulfilment
 * commit or roll back as one unit (finding #7). INSUFFICIENT_STOCK is
 * returned, not thrown, so a shared transaction can commit the
 * pending_manual_fulfilment state instead of losing the confirmation.
 */
export async function fulfilOrder(
  orderId: string,
  tx: PrismaTx = prisma,
  opts?: { strict?: boolean },
): Promise<FulfilmentResult> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { variant: { include: { product: true } } } } },
  });
  if (!order) return { success: false, error: 'ORDER_NOT_FOUND' };
  if (order.status === 'completed') return { success: false, error: 'ALREADY_FULFILLED' };

  try {
    const run = async (tx: PrismaTx): Promise<DeliveredCode[]> => {
      const delivered: DeliveredCode[] = [];

      for (const item of order.items) {
        const needed = item.quantity;

        // A detached line (variantId nulled by the catalog purge, migration
        // 20261025150000) has no variant to draw stock from. Unreachable
        // while the purge guards hold (they refuse live orders), but never
        // mislabel it as a stock hole: callers route an unknown error to
        // their honest failure path (reconciliation evidence / rollback),
        // not to manual restock and a wrong diagnosis.
        if (!item.variantId) {
          throw new Error('CATALOG_LINE_DETACHED');
        }

        // FIFO pick of available codes, guarded per-row.
        const candidates = await tx.giftCode.findMany({
          where: { variantId: item.variantId, status: 'available' },
          orderBy: { createdAt: 'asc' },
          take: needed,
          select: { id: true, codeEncrypted: true, nonce: true, keyVersion: true },
        });
        if (candidates.length < needed) {
          throw new Error('INSUFFICIENT_STOCK');
        }

        for (const c of candidates) {
          const updated = await tx.giftCode.updateMany({
            where: { id: c.id, status: 'available' },
            data: {
              status: 'delivered',
              orderId: order.id,
              orderItemId: item.id,
              deliveredAt: new Date(),
            },
          });
          if (updated.count !== 1) throw new Error('INSUFFICIENT_STOCK'); // lost the race
          delivered.push({
            orderItemId: item.id,
            code: decryptCode(c.codeEncrypted, c.nonce, c.keyVersion),
            productName: item.productNameTh,
            denomination: Number(item.denominationThb),
          });
        }

        // Decrement stock with a floor guard; stock may be stale vs codes.
        // The clamp must be CONDITIONAL (audit 2026-11-06): the decrement and
        // the floor are two separate statements, so an admin restock that
        // commits in between (`stock: 10`) was overwritten by a blind write of
        // 0 and the restock disappeared. Only clamp while the row is negative.
        const variant = await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { decrement: needed } },
          select: { stock: true },
        });
        if (variant.stock < 0) {
          await tx.productVariant.updateMany({
            where: { id: item.variantId, stock: { lt: 0 } },
            data: { stock: 0 },
          });
        }

        await tx.stockMove.create({
          data: {
            variantId: item.variantId,
            delta: -needed,
            reason: 'sale',
            refType: 'order',
            refId: order.id,
            note: `ออเดอร์ ${order.orderNumber}`,
            stockAfter: Math.max(variant.stock, 0),
            actorType: 'system',
          },
        });

        await tx.orderItem.update({
          where: { id: item.id },
          data: { deliveryStatus: 'delivered', deliveredAt: new Date() },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: 'completed', completedAt: new Date() },
      });

      // Audit #2: promise the customer their codes INSIDE the same unit —
      // delivery itself is decoupled (outbox worker), but the row commits
      // or rolls back with the codes themselves. Idempotent per order.
      // Production review HIGH-1: the plaintext codes go INTO the payload
      // (they never did before) and the link uses confirmationUuid.
      await enqueueCodeDeliveryEmail(tx, order, delivered);

      return delivered;
    };

    // Standalone callers keep the original single-transaction behaviour;
    // a supplied tx (webhook path) joins the caller's transaction instead.
    const result = tx === prisma ? await prisma.$transaction((t) => run(t)) : await run(tx);
    // The line id stays internal: `codes` is part of the API response and
    // its shape is asserted by callers/tests, so strip it back to the
    // original three fields.
    return {
      success: true,
      codes: result.map(({ code, productName, denomination }) => ({
        code,
        productName,
        denomination,
      })),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'INSUFFICIENT_STOCK') {
      // Review H3: in strict mode (wallet payment) a stock hole must roll
      // back the WHOLE payment — a partial allocation charged the customer
      // for codes that were never delivered. Re-throwing aborts the caller's
      // transaction, undoing the debit, ledger row, claim and any codes
      // already marked. The webhook path keeps the non-strict fallback
      // (payment confirmed → pending_manual_fulfilment for admin retry).
      if (opts?.strict) throw err;
      return { success: false, error: 'INSUFFICIENT_STOCK' };
    }
    throw err;
  }
}
