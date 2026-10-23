/**
 * POST /api/v1/admin/stock/bulk-void — undo ONE bulk paste.
 *
 * A paste lands hundreds of credentials in one click; before this, undoing a
 * bad one meant voiding codes one at a time (or worse, adjusting the stock
 * number and leaving every GiftCode `available` — the drift the single-code
 * void exists to prevent). This is the honest inverse of POST /stock/bulk,
 * scoped by the batch id the paste recorded:
 *
 *  - flips every still-`available` code of that upload batch to `voided`
 *    with who/why/when (columns the schema already had);
 *  - decrements the variant stock by the number ACTUALLY flipped — codes
 *    already reserved/delivered belong to the customer and are skipped;
 *  - writes one StockMove + one audit row, both carrying the same batchId,
 *    so paste and undo correlate in the stock history and the audit trail.
 *
 * All three in ONE transaction, exactly like the single-code void.
 * Idempotent and race-safe: the status flip is a CAS on
 * `uploadBatchId + status: 'available'`, so a double-click or a concurrent
 * sale cannot double-decrement; re-voiding flips 0 rows and changes nothing.
 *
 * Gated on `inventory:void` — the SAME permission as the single-code void:
 * undoing a paste is voiding, just n codes instead of 1.
 */
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { writeAuditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = getAdminToken(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const check = await checkPermission(token, 'inventory:void');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const actor = check.payload!;

  let batchId = '';
  let reason = '';
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body['batchId'] === 'string') batchId = body['batchId'].trim();
    if (typeof body['reason'] === 'string') reason = body['reason'].trim();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  if (batchId.length === 0) {
    return NextResponse.json({ error: 'BATCH_ID_REQUIRED' }, { status: 400 });
  }
  if (reason.length > 200) reason = reason.slice(0, 200);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.codeUploadBatch.findUnique({
        where: { id: batchId },
        include: {
          variant: {
            select: { id: true, label: true, stock: true, product: { select: { name: true } } },
          },
        },
      });
      if (!batch) return { status: 404 as const, error: 'BATCH_NOT_FOUND' };

      // CAS: only still-available codes flip. The count returned IS the
      // number of units coming out of stock — no second read, no race window
      // where a sale slips between count and decrement.
      const flipped = await tx.giftCode.updateMany({
        where: { uploadBatchId: batchId, status: 'available' },
        data: {
          status: 'voided',
          voidedById: actor.sub,
          voidReason: reason || 'ยกเลิกการวางรหัสชุด',
          voidedAt: new Date(),
        },
      });

      // Nothing left available (already voided, or all sold): a no-op must
      // not burn a StockMove/audit row — idempotent re-void is 200 + 0.
      if (flipped.count === 0) {
        const total = await tx.giftCode.count({ where: { uploadBatchId: batchId } });
        if (total === 0) {
          return { status: 404 as const, error: 'BATCH_NOT_FOUND' };
        }
        return {
          status: 200 as const,
          ok: true,
          voided: 0,
          alreadyProcessed: true,
          stockAfter: batch.variant.stock,
          variantLabel: batch.variant.label,
          productName: batch.variant.product.name,
        };
      }

      const stockAfter = Math.max(batch.variant.stock - flipped.count, 0);
      await tx.productVariant.update({
        where: { id: batch.variantId },
        data: { stock: stockAfter },
      });

      // Movement + audit in the SAME transaction as the flip and decrement —
      // count, ledger and trail cannot disagree.
      await tx.stockMove.create({
        data: {
          variantId: batch.variantId,
          delta: -flipped.count,
          reason: 'void',
          refType: 'upload',
          refId: batchId,
          note: reason || 'ยกเลิกการวางรหัสชุด',
          stockAfter,
          actorType: 'admin',
          actorId: actor.sub,
        },
      });
      await writeAuditLog({
        actorType: 'admin',
        actorId: actor.sub,
        actorEmail: actor.email,
        action: 'inventory.bulk_void',
        tableName: 'GiftCode',
        recordId: batchId,
        diff: {
          before: { available: flipped.count },
          after: { available: 0 },
        },
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        metadata: {
          batchId,
          variantId: batch.variantId,
          variantLabel: batch.variant.label,
          productName: batch.variant.product.name,
          accountsVoided: flipped.count,
          reason: reason || 'ยกเลิกการวางรหัสชุด',
        },
        tx,
      });

      return {
        status: 200 as const,
        ok: true,
        voided: flipped.count,
        alreadyProcessed: false,
        stockAfter,
        variantLabel: batch.variant.label,
        productName: batch.variant.product.name,
      };
    });

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[stock] bulk void failed', err);
    return NextResponse.json({ error: 'VOID_FAILED' }, { status: 500 });
  }
}
