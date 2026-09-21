import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

const METHOD_TH: Record<string, string> = {
  promptpay: 'พร้อมเพย์',
  credit_card: 'บัตรเครดิต',
  admin_credit: 'แอดมินเพิ่มเครดิต',
  slip: 'สลิปโอนเงิน',
};

/**
 * GET /api/v1/admin/topups — customer top-up history (topups:read).
 * Query: ?status=all|pending|completed|failed (default all), ?take=1-200.
 * Joined with customer email/name so the queue shows who topped up.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const check = await checkPermission(token, 'topups:read');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'all';
  const takeRaw = Number(url.searchParams.get('take') ?? '100');
  const take = Number.isFinite(takeRaw) ? Math.min(Math.max(Math.trunc(takeRaw), 1), 200) : 100;

  const logs = await prisma.topUpLog.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      customer: { select: { email: true, fullName: true } },
    },
  });

  const [totals] = await Promise.all([
    prisma.topUpLog.aggregate({
      where: { status: 'completed' },
      _sum: { amountThb: true },
      _count: true,
    }),
  ]);
  const pending = await prisma.topUpLog.count({ where: { status: 'pending' } });

  return NextResponse.json({
    logs: logs.map((t) => ({
      id: t.id,
      createdAt: t.createdAt.toISOString(),
      customerEmail: t.customer.email,
      customerName: t.customer.fullName,
      amount: Number(t.amountThb),
      method: t.method,
      methodLabel: METHOD_TH[t.method] ?? t.method,
      reference: t.reference,
      status: t.status,
    })),
    summary: {
      completedTotal: totals._sum.amountThb === null ? 0 : Number(totals._sum.amountThb),
      completedCount: totals._count,
      pendingCount: pending,
    },
  });
}
