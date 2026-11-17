/**
 * PATCH /api/v1/admin/inventory/codes/:id/void — withdraw ONE stored account.
 *
 * Also declared in the route-permission matrix since the original inventory
 * work but never implemented. Its absence is why there was no way to remove a
 * single pasted account: editing the variant's stock number changes the COUNT
 * while the GiftCode row stays `available`, so the two drift apart and a
 * stray sale can still hand out an account someone believed they'd removed
 * (client report 2026-10-05).
 *
 * Voiding is the honest inverse of restock:
 *  - flips the code to `voided` with who/why/when (columns the schema already
 *    had: voidedById / voidReason / voidedAt);
 *  - decrements the variant stock;
 *  - writes the StockMove, so the inventory history accounts for it.
 * All three happen in ONE transaction, and the audit row rides along in that
 * same transaction — a void that decremented stock without leaving a trail
 * (or vice versa) is exactly the drift this endpoint exists to remove.
 *
 * One row type has no stock to move: a code DETACHED from its product (the
 * catalog purge nulls `variantId`, migration 20261025150000). Before this,
 * such a code could not be retired at all — the endpoint answered
 * CODE_DETACHED — while still counting as `available` and being sellable by
 * nothing (13 of them in production, 2026-11-17). For those the flip and the
 * audit row still happen, and the stock decrement + StockMove deliberately do
 * not: there is no variant, so inventing a movement would corrupt the ledger.
 *
 * Idempotent and safe under concurrency: the status flip is a CAS
 * (`id + status: 'available'`), so two simultaneous voids cannot both
 * decrement, and re-voiding returns 409 rather than double-counting.
 */
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { writeAuditLog } from '@/lib/auditLog';
import { safeJson } from '@/lib/json';

export const dynamic = 'force-dynamic';

/** Only stock that is still sellable may be pulled out of the pool. */
const VOIDABLE = new Set(['available']);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = getAdminToken(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const check = await checkPermission(token, 'inventory:void');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const actor = check.payload!;

  const { id } = await ctx.params;

  let reason = '';
  try {
    const body = await safeJson<Record<string, unknown>>(req);
    if (typeof body['reason'] === 'string') reason = body['reason'].trim();
  } catch {
    // Body is optional — a void with no stated reason is still recorded,
    // just with a default one.
  }
  if (reason.length > 200) reason = reason.slice(0, 200);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const code = await tx.giftCode.findUnique({
        where: { id },
        include: {
          variant: {
            select: { id: true, label: true, stock: true, product: { select: { name: true } } },
          },
        },
      });
      if (!code) return { status: 404 as const, error: 'NOT_FOUND' };
      if (!VOIDABLE.has(code.status)) {
        return { status: 409 as const, error: 'CODE_NOT_VOIDABLE', codeStatus: code.status };
      }
      // A detached code belongs to no variant, so there is no stock to
      // decrement and no StockMove to write. It is still `available` though,
      // which is why it counts toward the code totals while being sellable by
      // nothing. Retiring one is a status flip plus an audit row and
      // deliberately nothing else.
      const target =
        code.variantId && code.variant
          ? { variantId: code.variantId, variant: code.variant }
          : null;
      // The reason lands on the row and in the trail, so it is resolved once.
      const voidReason =
        reason || (target ? 'ยกเลิกโดยแอดมิน' : 'ยกเลิกโค้ดที่ไม่มีสินค้า');

      // CAS: the status predicate is what stops two concurrent voids from
      // both decrementing stock for one code.
      const flipped = await tx.giftCode.updateMany({
        where: { id, status: 'available' },
        data: {
          status: 'voided',
          voidedById: actor.sub,
          voidReason,
          voidedAt: new Date(),
        },
      });
      if (flipped.count !== 1) {
        return { status: 409 as const, error: 'CODE_NOT_VOIDABLE', codeStatus: code.status };
      }

      // Stock work only exists when the code has a variant. Movement and audit
      // stay in the SAME transaction as the flip and the decrement: count,
      // ledger and trail cannot disagree.
      let stockAfter: number | null = null;
      if (target) {
        const variant = await tx.productVariant.findUnique({
          where: { id: target.variantId },
          select: { stock: true },
        });
        stockAfter = Math.max((variant?.stock ?? 0) - 1, 0);
        await tx.productVariant.update({
          where: { id: target.variantId },
          data: { stock: stockAfter },
        });
        await tx.stockMove.create({
          data: {
            variantId: target.variantId,
            delta: -1,
            reason: 'void',
            refType: 'manual',
            note: voidReason,
            stockAfter,
            actorType: 'admin',
            actorId: actor.sub,
          },
        });
      }

      // One trail row either way — `detached` is what says whether stock moved.
      await writeAuditLog({
        actorType: 'admin',
        actorId: actor.sub,
        actorEmail: actor.email,
        action: 'inventory.code_void',
        tableName: 'GiftCode',
        recordId: code.id,
        diff: { before: { status: code.status }, after: { status: 'voided' } },
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        metadata: {
          variantId: target?.variantId ?? null,
          variantLabel: target?.variant.label ?? '—',
          productName: target?.variant.product.name ?? '—',
          detached: target === null,
          reason: voidReason,
        },
        tx,
      });

      if (!target) return { status: 200 as const, ok: true, id: code.id, detached: true };
      return {
        status: 200 as const,
        ok: true,
        id: code.id,
        stockAfter,
        productName: target.variant.product.name,
        variantLabel: target.variant.label,
      };
    });

    if (result.status !== 200) {
      return NextResponse.json(
        { error: result.error, ...('codeStatus' in result ? { status: result.codeStatus } : {}) },
        { status: result.status },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[inventory] code void failed', err);
    return NextResponse.json({ error: 'VOID_FAILED' }, { status: 500 });
  }
}