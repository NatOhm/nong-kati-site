import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { WALLET_METHOD_LABEL } from '@/lib/walletCredit';

export const dynamic = 'force-dynamic';

function bearer(req: NextRequest): string | null {
  const token = getAdminToken(req);
  if (!token) return null;
  return token;
}

const METHOD_TH: Record<string, string> = WALLET_METHOD_LABEL;

/**
 * GET /api/v1/admin/topups — customer top-up history (topups:read).
 * Query: ?status=all|pending|completed|failed (default all), ?type=all|credit|spend,
 * ?take=1-200.
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
  // credit = money in (top-ups, admin grants, refunds), spend = wallet debits.
  // Mixing them made the table read as "top-ups" while showing −฿1 purchase
  // rows, and the lifetime total beside it looked unrelated to any row.
  const type = url.searchParams.get('type') ?? 'all';
  const takeRaw = Number(url.searchParams.get('take') ?? '100');
  const take = Number.isFinite(takeRaw) ? Math.min(Math.max(Math.trunc(takeRaw), 1), 200) : 100;
  const typeFilter =
    type === 'credit' ? { amountThb: { gt: 0 } } : type === 'spend' ? { amountThb: { lt: 0 } } : {};

  // Review [High]: full identity requires customers:read:full. Roles with
  // only topups:read (support_agent) get masked emails and no full names.
  const canSeeFullPii = check.payload?.perms.includes('customers:read:full') ?? false;
  const maskEmail = (email: string) =>
    canSeeFullPii ? email : email.replace(/^(.).*(@.*)$/, (_m, a, b) => `${a}***${b as string}`);

  const logs = await prisma.topUpLog.findMany({
    where: { ...typeFilter, ...(status === 'all' ? {} : { status }) },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      customer: { select: { email: true, fullName: true } },
    },
  });

  // The summary now follows the applied type filter, so the number beside the
  // table always describes the rows being looked at.
  const [totals] = await Promise.all([
    prisma.topUpLog.aggregate({
      where: {
        status: 'completed',
        ...(type === 'spend' ? { amountThb: { lt: 0 } } : { amountThb: { gt: 0 } }),
      },
      _sum: { amountThb: true },
      _count: true,
    }),
  ]);
  const pending = await prisma.topUpLog.count({ where: { status: 'pending' } });

  return NextResponse.json({
    logs: logs.map((t) => ({
      id: t.id,
      createdAt: t.createdAt.toISOString(),
      customerEmail: maskEmail(t.customer.email),
      ...(canSeeFullPii ? { customerName: t.customer.fullName } : {}),
      amount: Number(t.amountThb),
      method: t.method,
      methodLabel: METHOD_TH[t.method] ?? t.method,
      reference: t.reference,
      status: t.status,
    })),
    summary: {
      completedTotal:
        totals._sum.amountThb === null ? 0 : Math.abs(Number(totals._sum.amountThb)),
      completedCount: totals._count,
      pendingCount: pending,
    },
  });
}
