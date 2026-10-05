/**
 * POST /api/v1/admin/orders/:id/assign-code — hand a CHOSEN account to a
 * CHOSEN customer.
 *
 * Declared in ROUTE_PERMISSIONS since the original inventory work and never
 * implemented (the new declared-vs-built ratchet in admin-stored-accounts
 * caught it). It closes the loop the client asked for: stock accounts could
 * be stocked, viewed and voided, but the only way an account ever reached a
 * customer was fulfilOrder's FIFO pick — and an order that had fallen into
 * `pending_manual_fulfilment` (stock shortfall) could not be completed at
 * all without manual DB surgery.
 *
 * This does NOT reuse fulfilOrder. That path allocates its own codes FIFO
 * over the whole order; here the caller names ONE code for ONE item. Mixing
 * the two would hand out a second, different account by surprise.
 *
 * Guarantees:
 *  - The code must belong to a variant that is actually ON this order.
 *    Assigning a Netflix account to a Spotify order is the obvious failure
 *    mode of a manual override, so it is refused rather than trusted.
 *  - CAS on `status: 'available'`, so two admins assigning the same account
 *    cannot both win.
 *  - Stock decrement + StockMove + audit + order-item update all commit in
 *    ONE transaction, matching how the restock/void pair behaves.
 *  - Refuses to deliver an unpaid order: the account is the product.
 */
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { writeAuditLog } from '@/lib/auditLog';

/**
 * States in which handing over an account is legitimate. `pending_payment`
 * is deliberately absent — giving the product away before the money is the
 * one thing this endpoint must never do.
 */
const ASSIGNABLE_ORDER_STATES = new Set([
  'payment_confirmed',
  'pending_manual_fulfilment',
  'code_delivered',
]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = getAdminToken(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const check = await checkPermission(token, 'orders:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const actor = check.payload!;

  const { id: orderId } = await ctx.params;

  let codeId = '';
  let replaceCodeId: string | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    codeId = typeof body['codeId'] === 'string' ? body['codeId'].trim() : '';
    replaceCodeId =
      typeof body['replaceCodeId'] === 'string' && body['replaceCodeId'].trim()
        ? body['replaceCodeId'].trim()
        : null;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (!codeId) return NextResponse.json({ error: 'CODE_ID_REQUIRED' }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { variant: { include: { product: true } } } } },
      });
      if (!order) return { status: 404 as const, error: 'ORDER_NOT_FOUND' };
      if (!ASSIGNABLE_ORDER_STATES.has(order.status)) {
        return { status: 409 as const, error: 'ORDER_NOT_ASSIGNABLE', orderStatus: order.status };
      }

      const code = await tx.giftCode.findUnique({
        where: { id: codeId },
        include: { variant: { include: { product: true } } },
      });
      if (!code) return { status: 404 as const, error: 'CODE_NOT_FOUND' };
      if (code.status !== 'available') {
        return { status: 409 as const, error: 'CODE_NOT_AVAILABLE', codeStatus: code.status };
      }

      // The code must be something this order actually bought.
      const item = order.items.find((i) => i.variantId === code.variantId);
      if (!item) return { status: 422 as const, error: 'CODE_NOT_IN_ORDER' };

      // Replacement: pull the previously-delivered account back out first, so
      // a swapped account does not silently double-count against stock.
      if (replaceCodeId) {
        const old = await tx.giftCode.findUnique({ where: { id: replaceCodeId } });
        if (!old) return { status: 404 as const, error: 'REPLACED_CODE_NOT_FOUND' };
        if (old.orderId !== order.id) {
          return { status: 422 as const, error: 'REPLACED_CODE_NOT_ON_ORDER' };
        }
        if (old.status !== 'delivered') {
          return { status: 409 as const, error: 'REPLACED_CODE_NOT_DELIVERED' };
        }
        await tx.giftCode.update({
          where: { id: old.id },
          data: {
            status: 'voided',
            orderId: null,
            orderItemId: null,
            voidedById: actor.sub,
            voidReason: 'เปลี่ยนบัญชี (แทนที่ด้วยบัญชีใหม่)',
            voidedAt: new Date(),
          },
        });
        // Give the stock back before taking the new one, so the net movement
        // for this item stays correct.
        const restored = await tx.productVariant.update({
          where: { id: old.variantId },
          data: { stock: { increment: 1 } },
          select: { stock: true },
        });
        await tx.stockMove.create({
          data: {
            variantId: old.variantId,
            delta: 1,
            reason: 'adjust',
            refType: 'order',
            refId: order.id,
            note: `คืนสต๊อกจากการเปลี่ยนบัญชี ออเดอร์ ${order.orderNumber}`,
            stockAfter: restored.stock,
            actorType: 'admin',
            actorId: actor.sub,
          },
        });
      }

      // CAS — the same account cannot be handed to two customers.
      const assigned = await tx.giftCode.updateMany({
        where: { id: code.id, status: 'available' },
        data: {
          status: 'delivered',
          orderId: order.id,
          orderItemId: item.id,
          deliveredAt: new Date(),
        },
      });
      if (assigned.count !== 1) {
        return { status: 409 as const, error: 'CODE_NOT_AVAILABLE', codeStatus: code.status };
      }

      const variant = await tx.productVariant.update({
        where: { id: code.variantId },
        data: { stock: { decrement: 1 } },
        select: { stock: true },
      });
      if (variant.stock < 0) {
        await tx.productVariant.update({
          where: { id: code.variantId },
          data: { stock: 0 },
        });
      }
      await tx.stockMove.create({
        data: {
          variantId: code.variantId,
          delta: -1,
          reason: 'sale',
          refType: 'order',
          refId: order.id,
          note: `ส่งบัญชีให้ลูกค้า ออเดอร์ ${order.orderNumber}`,
          stockAfter: Math.max(variant.stock, 0),
          actorType: 'admin',
          actorId: actor.sub,
        },
      });

      // All items delivered → the order is genuinely complete.
      const others = await tx.orderItem.count({
        where: { orderId: order.id, id: { not: item.id }, deliveryStatus: { not: 'delivered' } },
      });
      await tx.orderItem.update({
        where: { id: item.id },
        data: { deliveryStatus: 'delivered', deliveredAt: new Date() },
      });
      const orderComplete = others === 0;
      if (orderComplete) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'completed', completedAt: new Date() },
        });
      }

      await writeAuditLog({
        actorType: 'admin',
        actorId: actor.sub,
        actorEmail: actor.email,
        action: 'order.assign_code',
        tableName: 'GiftCode',
        recordId: code.id,
        diff: {
          before: { status: code.status, orderId: null },
          after: { status: 'delivered', orderId: order.id },
        },
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerEmail: order.customerEmail,
          variantId: code.variantId,
          productName: code.variant.product.name,
          replacedCodeId: replaceCodeId,
        },
        tx,
      });

      return {
        status: 200 as const,
        ok: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        codeId: code.id,
        productName: code.variant.product.name,
        variantLabel: code.variant.label,
        stockAfter: Math.max(variant.stock, 0),
        orderComplete,
        // The plaintext is NOT returned. Assigning hands the account to the
        // customer; the delivery email/panel is where staff read it back,
        // through the audited reveal endpoint.
        deliveryHint: 'โอเดอร์ได้รับบัญชีแล้ว — ดูบัญชีได้จากรายการออเดอร์',
      };
    });

    if (result.status !== 200) {
      return NextResponse.json(
        {
          error: result.error,
          ...('orderStatus' in result ? { orderStatus: result.orderStatus } : {}),
          ...('codeStatus' in result ? { codeStatus: result.codeStatus } : {}),
        },
        { status: result.status },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[orders] manual code assignment failed', err);
    return NextResponse.json({ error: 'ASSIGN_FAILED' }, { status: 500 });
  }
}