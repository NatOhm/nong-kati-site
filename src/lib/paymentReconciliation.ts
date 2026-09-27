/**
 * Payment reconciliation records — external audit #4 (2026-09-27).
 *
 * When a payment was PROVEN received (SlipOK verified the bank slip, or the
 * gateway webhook said charge.complete) but the confirmation transaction
 * failed AND the recovery transaction could not commit either, the old code
 * swallowed the failure (`.catch(() => undefined)`) and answered 200 anyway
 * — money taken, order untouched, and NO trace anywhere.
 *
 * The recovery is now awaited and verified before any success-shaped
 * response; if it still cannot commit, this helper writes a durable
 * reconciliation row into AuditLog (the append-only evidence table used by
 * the admin audit viewer) with action `payment_reconciliation_required`:
 * actor system, order id, payment ref, the failure reason, and the full
 * context an operator needs (attempt ids, slip ref, recovery error).
 *
 * If even the reconciliation row cannot be written, the error is logged
 * loudly (console.error) — every log line is the last-resort trail.
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';

export type ReconciliationTrigger =
  | 'slip_verify_recovery_failed'
  | 'admin_verify_recovery_failed'
  | 'admin_resume_recovery_failed'
  | 'webhook_recovery_failed';

export interface PaymentReconciliationInput {
  trigger: ReconciliationTrigger;
  orderId: string;
  orderNumber?: string | null;
  paymentRef?: string | null;
  paymentAttemptId?: string | null;
  failureReason: string;
  recoveryError: string;
}

/**
 * Record that a verified payment needs manual reconciliation. Best-effort
 * by design (the caller cannot do better than try again) but never silent:
 * failures land in console.error. Resolves to the created entry id, or null
 * when the write itself failed.
 */
export async function recordPaymentReconciliation(
  input: PaymentReconciliationInput,
): Promise<string | null> {
  const metadata: Record<string, unknown> = {
    trigger: input.trigger,
    paymentRef: input.paymentRef ?? null,
    paymentAttemptId: input.paymentAttemptId ?? null,
    recoveryError: input.recoveryError,
  };

  try {
    const row = await prisma.auditLog.create({
      data: {
        actorType: 'system',
        actorId: 'payment-reconciliation',
        actorEmail: 'system@nong-kati.local',
        action: 'payment_reconciliation_required',
        tableName: 'Order',
        recordId: input.orderId,
        metadata: metadata as Prisma.InputJsonValue,
        ipAddress: null,
      },
    });
    console.error(
      `[reconciliation] UNRECONCILED VERIFIED PAYMENT recorded: order=${input.orderId} ` +
        `ref=${input.paymentRef ?? '-'} trigger=${input.trigger} ` +
        `recoveryError=${input.recoveryError}`,
    );
    return row.id;
  } catch (err) {
    // The evidence row itself failed — the console trail is all that's left.
    console.error(
      `[reconciliation] FAILED TO RECORD reconciliation row for order=${input.orderId}:`,
      err instanceof Error ? err.message : err,
      '| context:',
      JSON.stringify(input),
    );
    return null;
  }
}

/** Query reconciliation rows that have no matching completion entry (admin viewer). */
export async function listReconciliationRecords(
  page = 1,
  pageSize = 20,
): Promise<{
  entries: Array<{
    id: string;
    orderId: string;
    trigger: string;
    paymentRef: string | null;
    recoveryError: string;
    createdAt: Date;
  }>;
  total: number;
}> {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: 'payment_reconciliation_required' },
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
    }),
    prisma.auditLog.count({ where: { action: 'payment_reconciliation_required' } }),
  ]);
  return {
    total,
    entries: rows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        orderId: r.recordId,
        trigger: String(meta['trigger'] ?? 'unknown'),
        paymentRef: (meta['paymentRef'] as string | null) ?? null,
        recoveryError: String(meta['recoveryError'] ?? ''),
        createdAt: r.createdAt,
      };
    }),
  };
}
