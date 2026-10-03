import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { writeAuditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

type RefundTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Serializable wrapper with retry on write-conflict, mirroring
 * runStaffMutation (api/adminStaff.ts). Two admins refunding the same order
 * must not both pass the `completed` guard; the loser retries and then sees
 * the committed refund.
 */
async function runRefund<T>(fn: (tx: RefundTx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' });
    } catch (e) {
      const isConflict =
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code?: string }).code === 'P2034';
      if (!isConflict || attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
  throw new Error('unreachable'); // loop always returns or throws
}

/** The only source state a refund may move from (VALID_TRANSITIONS in api/orders.ts). */
const REFUNDABLE_FROM = 'completed';

const fail = (code: string, status: number): NextResponse =>
  NextResponse.json({ error: code }, { status });

/**
 * POST /api/v1/admin/orders/[id]/refund — record a refund (orders:refund).
 * 07-api.md §22 — marks the order refunded and voids its delivered codes.
 *
 * RECORD-ONLY, deliberately. The gateway refund is performed by the admin in
 * the gateway dashboard first; this endpoint records that it happened and
 * captures the gateway reference as proof. It never calls the gateway, so a
 * retry or a double-submit cannot refund twice — the irreversible money
 * movement stays a human action.
 *
 * All of it joins ONE serializable transaction: void the codes, insert the
 * Refund row, flip the order, and write the audit row. The audit write is
 * passed `tx` deliberately — a refund row that exists without its audit row
 * (or vice versa) is exactly the drift this endpoint exists to remove.
 *
 * `Refund.orderId` is unique, so a second refund of the same order fails on
 * P2002 even if two requests both pass the status guard; that is mapped to
 * ALREADY_REFUNDED rather than surfacing a raw driver error.
 *
 * KNOWN LIMIT: voiding a code invalidates the store's record of it. A code
 * already delivered to the customer cannot be clawed back — the customer's
 * copy still works. Voiding plus the recorded count is what makes that
 * detectable and reconcilable, not something this endpoint can prevent.
 *
 * Stock is intentionally NOT returned to inventory here: 07-api.md §22 does
 * not define restock semantics for a refund, and guessing wrong would either
 * inflate or deflate available stock. The voided codes remain visible for an
 * operator to re-allocate.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = getAdminToken(req);
  if (!token) return fail('UNAUTHENTICATED', 401);

  const check = await checkPermission(token, 'orders:refund');
  if (!check.allowed) return fail(check.error ?? 'FORBIDDEN', 403);

  const adminId = check.payload?.sub ?? 'unknown';
  const adminEmail = check.payload?.email ?? '';

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail('INVALID_BODY', 400);
  }

  const gatewayRefundReference = String(body['gatewayRefundReference'] ?? '').trim();
  if (!gatewayRefundReference) return fail('GATEWAY_REF_REQUIRED', 400);

  const rawAmount = Number(body['refundAmountThb']);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return fail('INVALID_REFUND_AMOUNT', 400);

  const reasonCategory = String(body['reasonCategory'] ?? 'other').trim() || 'other';
  const reasonDetail = body['reasonDetail'] ? String(body['reasonDetail']) : null;
  // The spec voids delivered codes; `voidCodes: false` is the explicit opt-out.
  const voidCodes = body['voidCodes'] !== false;

  const { id } = await ctx.params;

  try {
    const result = await runRefund(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        select: { id: true, orderNumber: true, status: true, totalAmountThb: true },
      });
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (order.status === 'refunded') throw new Error('ALREADY_REFUNDED');
      if (order.status !== REFUNDABLE_FROM) throw new Error('NOT_REFUNDABLE');

      const total = Number(order.totalAmountThb);
      if (rawAmount > total) throw new Error('REFUND_AMOUNT_EXCEEDS_ORDER');

      // Void BEFORE inserting the Refund row: codesVoidedCount is a column on
      // that row, so the count has to exist first.
      let codesVoided = 0;
      if (voidCodes) {
        const voided = await tx.giftCode.updateMany({
          where: { orderId: id, status: { in: ['reserved', 'delivered'] } },
          data: {
            status: 'voided',
            voidedById: adminId,
            voidReason: reasonDetail ?? reasonCategory,
            voidedAt: new Date(),
          },
        });
        codesVoided = voided.count;
      }

      const refund = await tx.refund.create({
        data: {
          orderId: id,
          amountThb: rawAmount,
          reasonCategory,
          reasonDetail,
          gatewayRefundReference,
          codesVoidedCount: codesVoided,
          initiatedBy: adminId,
        },
      });

      // Conditional update: the status guard and the write are one statement,
      // so a concurrent second refund cannot slip a completed → refunded move
      // past the read above.
      const moved = await tx.order.updateMany({
        where: { id, status: REFUNDABLE_FROM },
        data: { status: 'refunded' },
      });
      if (moved.count !== 1) throw new Error('ALREADY_REFUNDED');

      await writeAuditLog({
        actorType: 'admin',
        actorId: adminId,
        actorEmail: adminEmail,
        action: 'refund_issued',
        tableName: 'Refund',
        recordId: refund.id,
        diff: { before: { status: REFUNDABLE_FROM }, after: { status: 'refunded' } },
        metadata: {
          orderId: id,
          orderNumber: order.orderNumber,
          gatewayRefundReference,
          refundAmountThb: rawAmount,
          reasonCategory,
          codesVoided,
        },
        tx,
      });

      return { refundId: refund.id, codesVoided, orderNumber: order.orderNumber };
    });

    return NextResponse.json({
      success: true,
      data: {
        orderId: id,
        orderNumber: result.orderNumber,
        refundId: result.refundId,
        status: 'refunded',
        codesVoided: result.codesVoided,
      },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : 'REFUND_FAILED';

    // Refund.orderId is unique — this is the real guard against a double
    // refund when two requests pass the status read together.
    const isDuplicate =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002';
    if (isDuplicate) return fail('ALREADY_REFUNDED', 409);

    if (code === 'ORDER_NOT_FOUND') return fail(code, 404);
    if (code === 'ALREADY_REFUNDED' || code === 'NOT_REFUNDABLE') return fail(code, 409);
    if (
      code === 'REFUND_AMOUNT_EXCEEDS_ORDER' ||
      code === 'GATEWAY_REF_REQUIRED' ||
      code === 'INVALID_REFUND_AMOUNT' ||
      code === 'INVALID_BODY'
    ) {
      return fail(code, 400);
    }
    return NextResponse.json({ error: 'REFUND_FAILED' }, { status: 500 });
  }
}
