/**
 * catalogPurge — guarded HARD DELETE of a product and everything that hangs
 * off it, while leaving order history and every money total intact.
 *
 * The FK reality that shapes this file: `OrderItem.variantId` and
 * `GiftCode.variantId` were required `Restrict` FKs, which made an early
 * version of this purge destroy order line items and delivered codes (a
 * playtest on 2026-10-25 caught it — the order modal's item list came back
 * empty). Migration 20261025150000_nullable_catalog_variant_links made both
 * columns nullable, so the purge now DETACHES history from the catalog
 * instead of deleting it:
 *
 *   • Money survives on the parent `Order` — `totalAmountThb`, `vatAmountThb`
 *     and every payment/refund/invoice row are untouched.
 *   • Order line items survive with `variantId = null`: every rendered field
 *     (productNameTh/En, skuCode, denominationThb, unitPriceThb) is an
 *     FK-free snapshot and the dashboard aggregates group by
 *     `productNameTh`, not by the variant FK — so orders render and
 *     product-level revenue reporting keeps working after the catalog is
 *     gone.
 *   • Delivered/reserved gift codes survive with `variantId = null`, still
 *     reachable via orderId/orderItemId — the customer keeps the code they
 *     paid for; only never-sold inventory codes are destroyed.
 *   • Restrict stays on both columns, so a variant still referenced by a
 *     non-detached row cannot be deleted by accident — detachment is always
 *     this explicit statement, made inside this transaction.
 *
 * Guard policy (client-approved 2026-10-13 — "looser"):
 *  - Deleting a product that appears in HISTORICAL orders is ALLOWED.
 *  - We refuse only genuinely dangerous in-flight state:
 *      • a variant referenced by an order in pending_payment / paid /
 *        fulfilling (the sale is still being served); or
 *      • a gift code currently reserved/delivered that has NO order to fall
 *        back on (we cannot prove what the customer paid for).
 *
 * Everything runs in ONE transaction and writes an AuditLog row inside it.
 */
import { prisma } from '@/lib/db';
import { writeAuditLog, type AuditTx } from '@/lib/auditLog';

/** Order states where a still-referenced variant means a live, unfinished sale. */
const LIVE_ORDER_STATUSES = ['pending_payment', 'paid', 'fulfilling'];

export type PurgeActor = { sub: string; email: string };

export type PurgeCounts = {
  products: number;
  variants: number;
  orderItemsDetached: number;
  giftCodesDeleted: number;
  giftCodesDetached: number;
  uploadBatches: number;
  inventorySnapshots: number;
  stockMoves: number;
  cartItems: number;
  aliases: number;
  tags: number;
  wishlist: number;
};

export const emptyPurgeCounts = (): PurgeCounts => ({
  products: 0,
  variants: 0,
  orderItemsDetached: 0,
  giftCodesDeleted: 0,
  giftCodesDetached: 0,
  uploadBatches: 0,
  inventorySnapshots: 0,
  stockMoves: 0,
  cartItems: 0,
  aliases: 0,
  tags: 0,
  wishlist: 0,
});

export type PurgeOutcome =
  | { ok: true; name: string }
  | { ok: false; error: 'NOT_FOUND' }
  | { ok: false; error: 'IN_FLIGHT_ORDER'; orderNumbers: string[] }
  | { ok: false; error: 'ORPHANED_RESERVED_CODE'; count: number };

/**
 * Hard-delete a single product by id inside the caller's transaction.
 * Exported so the category cascade can call it repeatedly; the guard + delete
 * + audit all ride the caller's tx so a partial cascade rolls back as one unit.
 */
export async function purgeProductInTx(
  tx: AuditTx,
  productId: string,
  actor: PurgeActor,
  ipAddress: string | null,
  counts: PurgeCounts,
): Promise<PurgeOutcome> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      slug: true,
      variants: { select: { id: true } },
    },
  });
  if (!product) return { ok: false, error: 'NOT_FOUND' };
  const variantIds = product.variants.map((v) => v.id);

  // ── Guard 1: any variant referenced by an in-flight order blocks the purge.
  if (variantIds.length > 0) {
    const inFlight = await tx.orderItem.findMany({
      where: { variantId: { in: variantIds }, order: { status: { in: LIVE_ORDER_STATUSES } } },
      select: { order: { select: { orderNumber: true } } },
      take: 20,
    });
    const orderNumbers = [...new Set(inFlight.map((i) => i.order.orderNumber))];
    if (orderNumbers.length > 0) {
      return { ok: false, error: 'IN_FLIGHT_ORDER', orderNumbers };
    }
  }

  // ── Guard 2: a reserved/delivered gift code with no order to fall back on
  //             is a customer's paid item we cannot account for — refuse.
  const orphaned = await tx.giftCode.count({
    where: {
      variantId: { in: variantIds },
      status: { in: ['reserved', 'delivered'] },
      orderId: null,
    },
  });
  if (orphaned > 0) {
    return { ok: false, error: 'ORPHANED_RESERVED_CODE', count: orphaned };
  }

  // ── Gift codes: `variantId` became nullable in migration
  //    20261025150000_nullable_catalog_variant_links exactly so a code a
  //    customer already holds survives this purge DETACHED instead of
  //    destroyed. Guard 2 above proved every reserved/delivered code has an
  //    `orderId`, and the order line's snapshot remains the record of what
  //    was sold — so we null only the catalog links (variant + upload batch).
  //    Codes that were never handed to a buyer (available/expired/voided)
  //    are worthless inventory and are deleted outright.
  const detached = await tx.giftCode.updateMany({
    where: { variantId: { in: variantIds }, status: { in: ['reserved', 'delivered'] } },
    data: { variantId: null, uploadBatchId: null },
  });
  const codesDeleted = await tx.giftCode.deleteMany({ where: { variantId: { in: variantIds } } });

  // Upload batches reference the variant with Restrict — remove them (every
  // surviving code already had its uploadBatchId nulled above).
  const batches = await tx.codeUploadBatch.deleteMany({ where: { variantId: { in: variantIds } } });

  // Historical order lines survive the purge: `variantId` is nullable since
  // the same migration, so we DETACH the line from the catalog instead of
  // deleting it. Every rendered field (productName / sku / price / line
  // total) is an FK-free snapshot and the dashboard groups by
  // `productNameTh`, so the order still renders, totals and reports
  // correctly with variantId NULL. Guard 1 ensured only terminal orders
  // reach this line.
  const items = await tx.orderItem.updateMany({
    where: { variantId: { in: variantIds } },
    data: { variantId: null },
  });

  // Cascades / explicit clears on Product delete.
  const snapshots = await tx.inventorySnapshot.deleteMany({ where: { productId } });
  const stockMoves = await tx.stockMove.deleteMany({ where: { variantId: { in: variantIds } } });
  const cartItems = await tx.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
  const aliases = await tx.productAlias.deleteMany({ where: { productId } });
  const tags = await tx.productTag.deleteMany({ where: { productId } });
  const wishlist = await tx.wishlistItem.deleteMany({ where: { productId } });

  // Product.delete cascades variants (onDelete: Cascade).
  await tx.product.delete({ where: { id: productId } });

  counts.products += 1;
  counts.variants += variantIds.length;
  counts.orderItemsDetached += items.count;
  counts.giftCodesDeleted += codesDeleted.count;
  counts.giftCodesDetached += detached.count;
  counts.uploadBatches += batches.count;
  counts.inventorySnapshots += snapshots.count;
  counts.stockMoves += stockMoves.count;
  counts.cartItems += cartItems.count;
  counts.aliases += aliases.count;
  counts.tags += tags.count;
  counts.wishlist += wishlist.count;

  await writeAuditLog({
    actorType: 'admin',
    actorId: actor.sub,
    actorEmail: actor.email,
    action: 'catalog.product_purge',
    tableName: 'Product',
    recordId: productId,
    diff: { before: { name: product.name, slug: product.slug }, after: null },
    ipAddress,
    metadata: {
      productId,
      productName: product.name,
      productSlug: product.slug,
      variants: variantIds.length,
      orderItemsDetached: items.count,
      giftCodesDeleted: codesDeleted.count,
      giftCodesDetached: detached.count,
      uploadBatches: batches.count,
    },
    tx,
  });

  return { ok: true, name: product.name };
}

/**
 * Hard-delete individual variants inside the caller's transaction — the
 * variant-level counterpart of the product purge above, with the same guard
 * philosophy but a non-fatal outcome: a variant that is still serving a
 * live sale (or holds a reserved/delivered code with no order to fall back
 * on) is reported back for deactivation instead of failing the whole save.
 * Everything else (historical order lines, handed-out codes) is detached
 * exactly like the product purge; never-sold codes (available/expired/
 * voided) are destroyed with the variant, as are its upload batches,
 * snapshots and stock moves.
 *
 * A batch shared beyond the variant (it also holds another variant's
 * codes) can neither go down with it nor survive it, so the variant falls
 * back to deactivation instead.
 */
export type VariantRemovalOutcome = {
  deletedIds: string[];
  deactivatedIds: string[];
};

export async function purgeVariantsInTx(
  tx: AuditTx,
  variantIds: string[],
): Promise<VariantRemovalOutcome> {
  const deletedIds: string[] = [];
  const deactivatedIds: string[] = [];
  if (variantIds.length === 0) return { deletedIds, deactivatedIds };

  // ── Per-variant guards (batched reads, per-row decisions) ─────────────
  const liveItems = await tx.orderItem.findMany({
    where: { variantId: { in: variantIds }, order: { status: { in: LIVE_ORDER_STATUSES } } },
    select: { variantId: true },
  });
  const liveByVariant = new Set(liveItems.map((i) => i.variantId));
  const codes = await tx.giftCode.findMany({
    where: { variantId: { in: variantIds } },
    select: { variantId: true, status: true, orderId: true },
  });
  const codesByVariant = new Map<string, { status: string; orderId: string | null }[]>();
  for (const c of codes) {
    const list = codesByVariant.get(c.variantId!) ?? [];
    list.push({ status: c.status, orderId: c.orderId });
    codesByVariant.set(c.variantId!, list);
  }
  // A batch that also holds another variant's codes cannot go down with
  // this variant — deleting it would strand those codes, and keeping it
  // would trip Restrict on the variant delete. Deactivate instead.
  const sharedBatches = await tx.codeUploadBatch.findMany({
    where: {
      variantId: { in: variantIds },
      codes: { some: { variantId: { notIn: variantIds } } },
    },
    select: { variantId: true },
  });
  const sharedByVariant = new Set(sharedBatches.map((b) => b.variantId));

  for (const variantId of variantIds) {
    if (liveByVariant.has(variantId) || sharedByVariant.has(variantId)) {
      deactivatedIds.push(variantId);
      continue;
    }
    const rows = codesByVariant.get(variantId) ?? [];
    const orphaned = rows.some(
      (r) => (r.status === 'reserved' || r.status === 'delivered') && r.orderId === null,
    );
    if (orphaned) {
      deactivatedIds.push(variantId);
      continue;
    }

    // ── Removable: detach history, destroy never-sold inventory ──────────
    await tx.orderItem.updateMany({
      where: { variantId },
      data: { variantId: null },
    });
    await tx.giftCode.updateMany({
      where: { variantId, status: { in: ['reserved', 'delivered'] } },
      data: { variantId: null, uploadBatchId: null },
    });
    await tx.giftCode.deleteMany({ where: { variantId } });
    // The upfront shared-batch check proved no surviving code points at
    // this variant's batches; the `none` guard below is belt-and-braces.
    await tx.codeUploadBatch.deleteMany({
      where: { variantId, codes: { none: {} } },
    });
    await tx.inventorySnapshot.deleteMany({ where: { productVariantId: variantId } });
    await tx.stockMove.deleteMany({ where: { variantId } });
    // Cart items cascade off the variant delete; nothing to do.
    await tx.productVariant.delete({ where: { id: variantId } });
    deletedIds.push(variantId);
  }

  if (deactivatedIds.length > 0) {
    await tx.productVariant.updateMany({
      where: { id: { in: deactivatedIds } },
      data: { isActive: false },
    });
  }
  return { deletedIds, deactivatedIds };
}

/**
 * Hard-delete a product and all its variants in one transaction, with the
 * in-flight / orphaned-code guards. The audit row commits atomically with the
 * mutation.
 */
export async function purgeProduct(params: {
  productId: string;
  actor: PurgeActor;
  ipAddress: string | null;
}): Promise<
  | { ok: true; name: string; counts: PurgeCounts }
  | { ok: false; error: 'NOT_FOUND' }
  | { ok: false; error: 'IN_FLIGHT_ORDER'; orderNumbers: string[] }
  | { ok: false; error: 'ORPHANED_RESERVED_CODE'; count: number }
  | { ok: false; error: 'PURGE_FAILED'; detail?: string }
> {
  const counts = emptyPurgeCounts();
  try {
    const result = await prisma.$transaction(
      async (tx) => purgeProductInTx(tx, params.productId, params.actor, params.ipAddress, counts),
      { timeout: 60000 },
    );
    if (!result.ok) return result;
    return { ok: true, name: result.name, counts };
  } catch (err) {
    console.error('[catalogPurge] product purge failed', err);
    return { ok: false, error: 'PURGE_FAILED', detail: err instanceof Error ? err.message : 'unknown error' };
  }
}
