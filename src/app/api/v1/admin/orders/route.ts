import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission, maskEmail } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

/**
 * GET /api/v1/admin/orders?status=&take= — real order list (orders:read).
 * Returns orders newest-first with item counts and the payment state,
 * plus per-status counts for the filter tabs.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'orders:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const take = Math.min(Number(url.searchParams.get('take') ?? 100), 200);

  // Permission-based PII shaping (finding #5): list responses mask the
  // customer email unless the caller holds orders:read:full.
  const fullAccess = check.payload!.perms.includes('orders:read:full');

  const where = status ? { status } : {};
  const [orders, statusCounts] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        orderNumber: true,
        customerEmail: true,
        status: true,
        paymentMethod: true,
        subtotalThb: true,
        discountThb: true,
        totalAmountThb: true,
        manualFulfilmentReason: true,
        slipImageUrl: true,
        createdAt: true,
        completedAt: true,
        _count: { select: { items: true } },
        // Latest promptpay attempt so the list can show the auto-check
        // status (success ref/amount + provider, or last fail reason)
        // without a detail fetch.
        paymentAttempts: {
          where: { paymentMethod: 'promptpay' },
          select: {
            slipVerifiedRef: true,
            amountThb: true,
            slipVerifiedAt: true,
            slipVerifiedBy: true,
            failureReason: true,
            gatewayStatusCode: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerEmail: fullAccess ? o.customerEmail : maskEmail(o.customerEmail),
      status: o.status,
      paymentMethod: o.paymentMethod,
      subtotalThb: Number(o.subtotalThb),
      discountThb: Number(o.discountThb),
      totalThb: Number(o.totalAmountThb),
      itemCount: o._count.items,
      manualFulfilmentReason: o.manualFulfilmentReason,
      /** Customer sent a slip for manual check (ส่งสลิปให้แอดมินตรวจ). */
      slipImageUrl: o.slipImageUrl,
      /** Auto-verification success, when the slip passed the bank check. */
      slip: o.paymentAttempts[0]?.slipVerifiedRef
        ? {
            ref: o.paymentAttempts[0].slipVerifiedRef ?? '',
            amountThb: Number(o.paymentAttempts[0].amountThb),
            verifiedAt: o.paymentAttempts[0].slipVerifiedAt?.toISOString() ?? null,
            by: o.paymentAttempts[0].slipVerifiedBy ?? null,
          }
        : null,
      /** Last auto-check (success or fail) — null when never checked. */
      slipCheck: o.paymentAttempts[0]?.slipVerifiedRef
        ? {
            provider: o.paymentAttempts[0].slipVerifiedBy ?? null,
            error: null,
            checkedAt: o.paymentAttempts[0].slipVerifiedAt?.toISOString() ?? null,
          }
        : o.paymentAttempts[0]?.failureReason
          ? {
              provider: o.paymentAttempts[0].gatewayStatusCode ?? null,
              error: o.paymentAttempts[0].failureReason ?? '',
              checkedAt: o.paymentAttempts[0].updatedAt?.toISOString() ?? null,
            }
          : null,
      createdAt: o.createdAt.toISOString(),
      completedAt: o.completedAt?.toISOString() ?? null,
    })),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
  });
}
