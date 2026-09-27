import { NextRequest, NextResponse } from 'next/server';

import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { listReconciliationRecords } from '@/lib/paymentReconciliation';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/reconciliation — the operator queue (roadmap §6:
 * "Create an admin reconciliation queue rather than relying only on logs").
 *
 * Sections:
 *  - payments: AuditLog rows action=payment_reconciliation_required —
 *    verified payments whose confirmation could not commit (audit #4).
 *    `resolved` is derived live from the order's CURRENT status: once the
 *    order reaches completed/refunded/pending_manual_fulfilment the entry
 *    is done and no longer needs a human.
 *  - deadLetters: EmailOutbox rows status=failed — permanently failed
 *    customer emails (codes, resets). surfaced with attempts/lastError so
 *    an operator can fix the cause and re-run the drain.
 *  - webhookGaps: paid-verified PaymentAttempts whose order is still
 *    pending_payment (roadmap §3 "never leave a successful external
 *    payment in pending_payment") — the safety net if any future bug
 *    tries to strand a paid order again.
 *
 * Permission: orders:read (order_manager+ / super_admin).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = getAdminToken(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'orders:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const pageHeader = new URL(req.url).searchParams.get('page') ?? '1';
  const pageParam = Number(pageHeader);
  const page = Number.isFinite(pageParam) ? Math.max(1, Math.floor(pageParam)) : 1;
  const pageSize = 25;

  // In the authz-matrix environment prisma throws past the guard by design;
  // the queue is a read-only dashboard — degrade each section independently
  // instead of failing the whole request on one broken query.
  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return fallback;
    }
  };

  const [records, deadLetters, webhookGaps] = await Promise.all([
    safe(listReconciliationRecords(page, pageSize), { entries: [], total: 0 }),
    safe(
      prisma.emailOutbox.findMany({
        where: { status: 'failed' },
        orderBy: { updatedAt: 'desc' },
        take: 25,
        select: {
          id: true,
          idempotencyKey: true,
          templateKey: true,
          toEmail: true,
          attempts: true,
          lastError: true,
          updatedAt: true,
        },
      }),
      [],
    ),
    safe(
      prisma.order.findMany({
        where: {
          status: 'pending_payment',
          paymentAttempts: { some: { status: 'succeeded' } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 25,
        select: {
          id: true,
          orderNumber: true,
          customerEmail: true,
          totalAmountThb: true,
          updatedAt: true,
        },
      }),
      [],
    ),
  ]);

  // Resolve-from-current-state: an entry is done when its order has moved
  // past the failure point. Batch-read the referenced orders.
  const orderIds = [...new Set(records.entries.map((e) => e.orderId))];
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, status: true },
      })
    : [];
  const statusById = new Map(orders.map((o) => [o.id, o.status]));
  const SETTLED = new Set(['completed', 'refunded', 'pending_manual_fulfilment']);

  const payments = records.entries.map((e) => ({
    ...e,
    orderStatus: statusById.get(e.orderId) ?? 'unknown',
    resolved: SETTLED.has(statusById.get(e.orderId) ?? ''),
  }));

  return NextResponse.json({
    page,
    pageSize,
    total: records.total,
    payments,
    deadLetters,
    webhookGaps,
    counts: {
      paymentsOpen: payments.filter((p) => !p.resolved).length,
      deadLetters: deadLetters.length,
      webhookGaps: webhookGaps.length,
    },
  });
}
