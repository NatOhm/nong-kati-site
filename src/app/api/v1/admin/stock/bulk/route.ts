import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { encryptCode, hashCode } from '@/lib/crypto/giftCode';
import { writeAuditLog } from '@/lib/auditLog';
import { parseBulkRecords, routeBulkRecords } from '@/lib/bulkRecords';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

/**
 * POST /api/v1/admin/stock/bulk — paste-in stock for a product (products:write).
 *
 * Body:
 *   { productId, format: 'short' | 'long', separator: ',' | ';' | 'tab' | 'newline',
 *     raw: string, apply?: boolean, variantId?: string }
 *
 * - variantId (optional): pin EVERY record to that variant instead of the
 *   round-robin — the inventory panel's "เติมบัญชี" button passes it so a
 *   paste opened from a variant lands in that variant, not spread across all.
 *   Unknown/inactive variant → 400 UNKNOWN_VARIANT (never a silent fallback).
 *
 * - short   → one account per line: "user:pass" (whole line = the code text)
 * - long    → fields joined by `separator`: code[,code,...][,ref] — every field
 *             except the ref keeps its own text; trailing ref column is dropped.
 * - Preview (apply=false) parses and returns per-variant plans without writing.
 * - apply=true creates encrypted available GiftCodes + StockMove(restock) in one
 *   transaction per variant, updating ProductVariant.stock.
 *
 * Returns 400 NO_VARIANTS when the product has no active variants; every variant
 * with unparsed lines gets them echoed back so the modal can highlight them.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'products:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const productId = typeof b['productId'] === 'string' ? b['productId'] : '';
  const format = b['format'] === 'long' ? 'long' : 'short';
  const separator = [';', 'tab', 'newline'].includes(b['separator'] as string)
    ? (b['separator'] as string)
    : ',';
  const raw = typeof b['raw'] === 'string' ? b['raw'] : '';
  const apply = b['apply'] === true;
  const variantId = typeof b['variantId'] === 'string' ? b['variantId'] : '';

  if (!productId || !raw.trim()) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, label: true, stock: true },
      },
    },
  });
  if (!product) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (product.variants.length === 0) {
    return NextResponse.json({ error: 'NO_VARIANTS' }, { status: 400 });
  }
  if (variantId && !product.variants.some((v) => v.id === variantId)) {
    return NextResponse.json({ error: 'UNKNOWN_VARIANT' }, { status: 400 });
  }

  // ── Parse ────────────────────────────────────────────────
  // Split + round-robin live in lib/bulkRecords (shared with the dialog's
  // live distribution preview) so client estimate and server write cannot
  // drift apart.
  const records = parseBulkRecords(raw, format);
  const routed = routeBulkRecords(
    records,
    product.variants.map((v) => ({ id: v.id, label: v.label })),
    format,
    variantId,
  );

  // Dedupe: within the pasted batch, and against codes already stored.
  // Re-pasting the same file must be a no-op for duplicates, never a 500.
  const seen = new Set<string>();
  for (const plan of routed) {
    plan.codes = plan.codes.filter((c) => {
      const h = hashCode(c).toString('hex');
      if (seen.has(h)) return false;
      seen.add(h);
      return true;
    });
  }
  const hashList = [...seen].map((h) => Buffer.from(h, 'hex'));
  const existingRows =
    hashList.length > 0
      ? await prisma.giftCode.findMany({
          where: { codeHash: { in: hashList } },
          select: { codeHash: true },
        })
      : [];
  const existingHashes = new Set(existingRows.map((r) => r.codeHash.toString('hex')));
  let duplicates = 0;
  for (const plan of routed) {
    const fresh = plan.codes.filter((c) => {
      const isDup = existingHashes.has(hashCode(c).toString('hex'));
      if (isDup) duplicates += 1;
      return !isDup;
    });
    plan.codes = fresh;
  }

  const plans = routed
    .map((p) => ({
      variantId: p.variantId,
      label: p.label,
      count: p.codes.length,
      currentStock: product.variants.find((v) => v.id === p.variantId)!.stock,
      codes: p.codes,
    }))
    .filter((p) => p.count > 0);

  if (!apply) {
    return NextResponse.json({
      product: { id: product.id, name: product.name },
      plans,
      duplicates,
    });
  }

  // ── Apply ────────────────────────────────────────────────
  const results: { variantId: string; label: string; added: number; batchId: string }[] = [];
  const adminId = check.payload?.sub ?? null;

  for (const plan of plans) {
    if (plan.codes.length === 0) continue;
    const applied = await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { id: plan.variantId },
        select: { stock: true },
      });
      if (!variant) throw new Error('VARIANT_DELETED');

      // One batch row per variant-plan: GiftCode.uploadBatchId is a real FK,
      // so a void must be able to find "every code this paste added to this
      // variant" after the fact. This is also what the stock-history chip
      // points at (StockMove.refId below) — paste and undo share one id.
      const batch = await tx.codeUploadBatch.create({
        data: {
          variantId: plan.variantId,
          uploadedById: adminId ?? 'unknown',
          // Paste has no file; the column is NOT NULL, so name the source.
          originalFilename: 'pasted text',
          totalRows: plan.codes.length,
          importedCount: plan.codes.length,
          status: 'completed',
          completedAt: new Date(),
        },
      });

      const rows = plan.codes.map((code) => {
        const { ciphertext, nonce, keyVersion } = encryptCode(code);
        return {
          variantId: plan.variantId,
          codeEncrypted: ciphertext,
          codeHash: hashCode(code),
          nonce,
          keyVersion,
          status: 'available',
          uploadedById: adminId,
          uploadBatchId: batch.id,
        };
      });
      await tx.giftCode.createMany({ data: rows });
      const stockAfter = variant.stock + rows.length;
      await tx.productVariant.update({
        where: { id: plan.variantId },
        data: { stock: { increment: rows.length } },
      });
      await tx.stockMove.create({
        data: {
          variantId: plan.variantId,
          delta: rows.length,
          reason: 'restock',
          refType: 'upload',
          refId: batch.id,
          note: `bulk paste ${rows.length} accounts`,
          stockAfter,
          actorId: adminId,
        },
      });
      // Restocking is how accounts enter the shop, so "who added these, and how
      // many" has to be as durable as the stock movement — same transaction, or
      // a crash between the two leaves unattributable credentials in stock.
      // Only counts and ids: never a code, even masked.
      await writeAuditLog({
        actorType: 'admin',
        actorId: adminId ?? 'unknown',
        actorEmail: check.payload?.email ?? 'unknown',
        action: 'inventory.restock',
        tableName: 'GiftCode',
        recordId: plan.variantId,
        diff: {
          before: { stock: variant.stock },
          after: { stock: stockAfter },
        },
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        metadata: {
          productId: product.id,
          productName: product.name,
          variantId: plan.variantId,
          variantLabel: plan.label,
          accountsAdded: rows.length,
          duplicatesSkipped: duplicates,
          batchId: batch.id,
        },
        tx,
      });
      return { added: rows.length, batchId: batch.id };
    });
    results.push({ variantId: plan.variantId, label: plan.label, added: applied.added, batchId: applied.batchId });
  }

  return NextResponse.json({
    product: { id: product.id, name: product.name },
    results,
    duplicates,
    totalAdded: results.reduce((s, r) => s + r.added, 0),
  });
}
