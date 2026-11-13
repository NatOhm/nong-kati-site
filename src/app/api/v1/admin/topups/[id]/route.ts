import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import { getAdminToken } from '@/lib/adminRequest';
import { writeAuditLog } from '@/lib/auditLog';
import { notifyTopUp } from '@/lib/notify';
import { incrementWalletBalance } from '@/lib/walletCredit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/topups/[id] — approve or reject a pending top-up.
 *
 * Body: { action: 'approve' | 'reject', note?: string }.
 *
 * Approval is the ONLY place a bank-transfer top-up becomes credit. The money
 * arrives in the shop's bank account before this is pressed; this endpoint
 * moves the ledger row pending → completed and increments the balance in one
 * transaction, so the customer's ประวัติการเดินเงิน and their balance can never
 * disagree. The status flip is a conditional updateMany, so two admins
 * pressing approve at once credit exactly once.
 *
 * Permission: customers:write — this changes a customer's wallet balance.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const token = getAdminToken(req);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const check = await checkPermission(token, 'customers:write');
  if (!check.allowed) {
    return NextResponse.json({ error: check.error ?? 'FORBIDDEN' }, { status: 403 });
  }
  const adminId = check.payload?.sub ?? 'unknown';
  const adminEmail = check.payload?.email ?? '';

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const action = String(body['action'] ?? '');
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
  }
  const note = typeof body['note'] === 'string' ? body['note'].trim().slice(0, 190) : '';

  const { id } = await ctx.params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const log = await tx.topUpLog.findUnique({
        where: { id },
        include: { customer: { select: { email: true } } },
      });
      if (!log) throw new Error('TOPUP_NOT_FOUND');
      if (log.status !== 'pending') throw new Error('ALREADY_REVIEWED');

      const moved = await tx.topUpLog.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: action === 'approve' ? 'completed' : 'failed',
          // `reference` already holds the transfer slip path
          // (/api/v1/payments/slip-download/…); writing `note` over it erased
          // the only evidence of the transfer the admin just checked. The
          // admin table splits on '|' into slip + note, so append instead.
          ...(note ? { reference: log.reference ? `${log.reference}|${note}` : note } : {}),
        },
      });
      if (moved.count !== 1) throw new Error('ALREADY_REVIEWED');

      let balanceThb: number | null = null;
      if (action === 'approve') {
        balanceThb = await incrementWalletBalance(tx, log.customerId, Number(log.amountThb));
      }

      await writeAuditLog({
        actorType: 'admin',
        actorId: adminId,
        actorEmail: adminEmail,
        action: action === 'approve' ? 'customer_topup_approved' : 'customer_topup_rejected',
        tableName: 'TopUpLog',
        recordId: id,
        diff: {
          before: { status: 'pending' },
          after: { status: action === 'approve' ? 'completed' : 'failed' },
        },
        metadata: {
          customerId: log.customerId,
          amountThb: Number(log.amountThb),
          ...(note ? { note } : {}),
        },
        tx,
      });

      return {
        status: action === 'approve' ? 'completed' : 'failed',
        amountThb: Number(log.amountThb),
        balanceThb,
        customerEmail: log.customer.email,
      };
    });

    // After commit — a hung webhook must never hold the transaction open.
    if (action === 'approve' && result.balanceThb !== null) {
      void notifyTopUp({
        customerEmail: result.customerEmail,
        amountThb: result.amountThb,
        balanceAfterThb: result.balanceThb,
      });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const code = err instanceof Error ? err.message : 'TOPUP_REVIEW_FAILED';
    if (code === 'TOPUP_NOT_FOUND') {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code === 'ALREADY_REVIEWED') {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    return NextResponse.json({ error: 'TOPUP_REVIEW_FAILED' }, { status: 500 });
  }
}
