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
 * Idempotent and safe under concurrency: the status flip is a CAS
 * (`id + status: 'available'`), so two simultaneous voids cannot both
 * decrement, and re-voiding returns 409 rather than double-counting.
 */
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { writeAuditLog } from '@/lib/auditLog';

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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
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

      // CAS: the status predicate is what stops two concurrent voids from
      // both decrementing stock for one code.
      const flipped = await tx.giftCode.updateMany({
        where: { id, status: 'available' },
        data: {
          status: 'voided',
          voidedById: actor.sub,
          voidReason: reason || 'ยกเลิกโดยแอดมิน',
          voidedAt: new Date(),
        },
      });
      if (flipped.count !== 1) {
        return { status: 409 as const, error: 'CODE_NOT_VOIDABLE', codeStatus: code.status };
      }

      const variant = await tx.productVariant.findUnique({
        where: { id: code.variantId },
        select: { stock: true },
      });
      const stockAfter = Math.max((variant?.stock ?? 0) - 1, 0);
      await tx.productVariant.update({
        where: { id: code.variantId },
        data: { stock: stockAfter },
      });

      // Movement + audit in the SAME transaction as the flip and the
      // decrement — that is the whole point: count, ledger and trail cannot
      // disagree.
      await tx.stockMove.create({
        data: {
          variantId: code.variantId,
          delta: -1,
          reason: 'void',
          refType: 'manual',
          note: reason || 'ยกเลิกโดยแอดมิน',
          stockAfter,
          actorType: 'admin',
          actorId: actor.sub,
        },
      });
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
          variantId: code.variantId,
          variantLabel: code.variant.label,
          productName: code.variant.product.name,
          reason: reason || 'ยกเลิกโดยแอดมิน',
        },
        tx,
      });

      return {
        status: 200 as const,
        ok: true,
        id: code.id,
        stockAfter,
        productName: code.variant.product.name,
        variantLabel: code.variant.label,
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