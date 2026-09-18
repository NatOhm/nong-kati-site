import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
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
        createdAt: true,
        completedAt: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerEmail: o.customerEmail,
      status: o.status,
      paymentMethod: o.paymentMethod,
      subtotalThb: Number(o.subtotalThb),
      discountThb: Number(o.discountThb),
      totalThb: Number(o.totalAmountThb),
      itemCount: o._count.items,
      manualFulfilmentReason: o.manualFulfilmentReason,
      createdAt: o.createdAt.toISOString(),
      completedAt: o.completedAt?.toISOString() ?? null,
    })),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
  });
}
