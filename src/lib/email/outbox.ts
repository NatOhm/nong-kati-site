/**
 * Email Outbox — external audit #2 (2026-09-27).
 *
 * The old bug: after a successful payment the system TOLD the customer the
 * codes were emailed (slip-verify's success message) while nobody sent any
 * mail. Prod without NK_RESEND_API_KEY walked mock mode that returned fake
 * success (`mock_...`), and the "would-be" email sat outside the payment
 * transaction — any hiccup and a paying customer simply never got codes.
 *
 * Fix: the outbox pattern, tx-bound like writeAuditLog (finding #5 fix):
 *  - enqueueEmail happens INSIDE the caller's transaction → code delivery
 *    commits/rolls back atomically with the fulfilment unit (payment,
 *    codes, stock, outbox row: one fate). A rolled-back payment can never
 *    enqueue mail; a committed payment can never lose the row.
 *  - delivery is decoupled: processDueEmails atomically CLAIMS rows
 *    (pending→sending, guarded on attempts/availableAt) and sends via
 *    sendEmailWithRetry, so concurrent workers never double-send and a
 *    crash mid-send just leaves the row back in pending (at-least-once).
 *  - failures are honest: attempts/lastError/availableAt back off
 *    exponentially; MAX_OUTBOX_ATTEMPTS exhaustion parks the row as failed
 *    for the admin outbox view — never fake success again.
 *
 * Idempotency: one row per idempotencyKey (e.g. code_delivery:<orderId>).
 * A repeat enqueue inside any later transaction catches the unique
 * violation (P2002) and no-ops — retried webhooks/admin confirmations
 * never duplicate mail.
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { sendEmailWithRetry } from '@/lib/email/resend';

/** Delivery attempt budget per row before it parks as failed. */
export const MAX_OUTBOX_ATTEMPTS = 8;

/**
 * Dead-letter alert (roadmap §2): an outbox row that exhausted every retry
 * is an UNDELIVERED customer email — codes, password reset, order confirm.
 * Beyond logs, drop a best-effort AuditLog row (action
 * `email_outbox_dead_letter`) so it shows up in the admin audit trail and
 * the ops health endpoint; the outbox row itself stays retryable.
 */
export function recordOutboxDeadLetter(
  outboxId: string,
  idempotencyKey: string,
  toEmail: string,
  attempts: number,
  error: string,
): void {
  // The alert must NEVER break the delivery loop — every failure mode
  // (sync throw, rejected write) collapses into a console trail.
  try {
    void prisma.auditLog
      .create({
        data: {
          actorType: 'system',
          actorId: 'email-outbox',
          actorEmail: 'system@nong-kati.local',
          action: 'email_outbox_dead_letter',
          tableName: 'EmailOutbox',
          recordId: outboxId,
          metadata: { idempotencyKey, toEmail, attempts, error },
        },
      })
      .catch((err: unknown) => {
        console.error(
          `[email-outbox] FAILED to record dead-letter for ${outboxId}:`,
          err instanceof Error ? err.message : err,
        );
      });
  } catch (err) {
    console.error(
      `[email-outbox] FAILED to record dead-letter for ${outboxId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Rows to drain per invocation. */
const BATCH_SIZE = 20;

/** A claimed row stuck in 'sending' longer than this is fair game to re-claim. */
const STALE_SENDING_MS = 5 * 60_000;

export type OutboxTx = Prisma.TransactionClient;

export interface EnqueueEmailInput {
  /** Logical identity of the email — one row per key, forever (e.g. code_delivery:<orderId>). */
  idempotencyKey: string;
  templateKey: 'code_delivery' | 'magic_link' | 'password_reset' | 'order_confirm';
  to: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * Transaction client — makes the outbox row ATOMIC with the caller's
   * mutation (fulfilment, payment confirmation). Callers MUST pass their
   * tx; enqueueing inside a transaction that later rolls back discards the
   * email with it (exactly what we want: no mail for money never taken).
   */
  tx: OutboxTx;
}

export interface EnqueueEmailResult {
  enqueued: boolean;
  /** Present only when this call created the row. */
  id?: string;
}

/**
 * Enqueue an email inside the caller's transaction. Idempotent on
 * idempotencyKey: the row is created exactly once no matter how many
 * racers commit, and repeats are silent no-ops.
 *
 * Implementation note: a caught-and-ignored unique violation is NOT an
 * option here — PostgreSQL aborts a transaction after ANY failed
 * statement, so swallowing a P2002 mid-transaction would poison every
 * subsequent write in the caller's unit. The duplicate-safe primitive is
 * a native upsert (INSERT … ON CONFLICT DO NOTHING via the empty update).
 */
export async function enqueueEmail(input: EnqueueEmailInput): Promise<EnqueueEmailResult> {
  // Fast path: the logical email already exists (a previous confirmation
  // committed) — skip the write entirely. Retried webhooks and admin
  // re-presses land here and never touch the table.
  const existing = await input.tx.emailOutbox.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true },
  });
  if (existing) {
    return { enqueued: false, id: existing.id };
  }

  // Atomic backstop for a true simultaneous race: never throws on
  // duplicates, so it can never poison the caller's transaction.
  const row = await input.tx.emailOutbox.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      idempotencyKey: input.idempotencyKey,
      templateKey: input.templateKey,
      toEmail: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text !== undefined ? { text: input.text } : {}),
    },
    update: {},
    select: { id: true },
  });
  return { enqueued: true, id: row.id };
}

/**
 * Claim due rows atomically and send them. Safe to run from any request
 * (Next after()), a cron ping, or a script: the status CAS (pending→sending)
 * guarded on attempts/availableAt makes concurrent workers exclusive per row.
 * A worker crash between claim and send leaves the row in 'sending' — the
 * stale-claim re-arm below requeues it instead of losing the mail.
 */
export async function processDueEmails(limit: number = BATCH_SIZE): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_SENDING_MS);

  // Claim predicate: pending and due, OR a previous worker died mid-send
  // ('sending' with updatedAt older than the stale cutoff).
  const claimable = [
    { status: 'pending', availableAt: { lte: now } },
    { status: 'sending', updatedAt: { lt: staleCutoff } },
  ];

  // Per-row CAS: listing candidates first, then flipping ONE row with a
  // guarded updateMany (count must be 1), makes concurrent workers
  // exclusive per row — a racer that loses the flip sees count 0 and just
  // moves on. (A blind "update many + guess which row" is NOT safe here.)
  const candidates = await prisma.emailOutbox.findMany({
    where: { OR: claimable },
    orderBy: { availableAt: 'asc' },
    select: { id: true },
    take: limit,
  });

  const claimed: { id: string }[] = [];
  for (const candidate of candidates) {
    const flip = await prisma.emailOutbox.updateMany({
      where: { id: candidate.id, OR: claimable },
      data: { status: 'sending', updatedAt: now },
    });
    if (flip.count === 1) claimed.push(candidate);
  }

  let sent = 0;
  let failed = 0;

  for (const row of claimed) {
    const current = await prisma.emailOutbox.findUnique({
      where: { id: row.id },
      select: {
        id: true,
        toEmail: true,
        subject: true,
        html: true,
        text: true,
        attempts: true,
        idempotencyKey: true,
      },
    });
    if (!current) {
      continue;
    }

    const result = await sendEmailWithRetry({
      to: current.toEmail,
      subject: current.subject,
      html: current.html,
      ...(current.text !== null ? { text: current.text } : {}),
      // Provider-side dedup: a lost success (network blip after Resend
      // accepted the send) retried with the same key can never duplicate
      // the email — Resend recognizes the key.
      idempotencyKey: current.idempotencyKey,
    });

    if (result.success) {
      await prisma.emailOutbox.update({
        where: { id: current.id },
        data: { status: 'sent', sentAt: new Date(), lastError: null, updatedAt: new Date() },
      });
      sent++;
      continue;
    }

    const attempts = current.attempts + 1;
    const exhausted = attempts >= MAX_OUTBOX_ATTEMPTS;
    // Exponential backoff between attempts: 1, 2, 4, 8, ... minutes (capped at 1h).
    const backoffMs = Math.min(60_000 * 2 ** (attempts - 1), 3_600_000);
    await prisma.emailOutbox.update({
      where: { id: current.id },
      data: {
        status: exhausted ? 'failed' : 'pending',
        attempts,
        lastError: result.error ?? 'UNKNOWN_ERROR',
        availableAt: new Date(Date.now() + (exhausted ? 0 : backoffMs)),
        updatedAt: new Date(),
      },
    });
    failed++;
    console.error(
      `[email-outbox] delivery ${exhausted ? 'parked as FAILED' : 'retry scheduled'} ` +
        `id=${current.id} to=${current.toEmail} attempts=${attempts} error=${result.error ?? '?'}`,
    );
    if (exhausted) {
      // Roadmap §2 — alerts for permanently failed entries: a dead-letter
      // row is an UNDELIVERED customer email (codes, password reset, …),
      // so it must be visible outside logs. Best-effort audit row (same
      // pattern as payment reconciliation); the outbox row itself remains
      // the retryable source of truth (admin re-runs reset it).
      recordOutboxDeadLetter(
        current.id,
        current.idempotencyKey,
        current.toEmail,
        attempts,
        result.error ?? 'UNKNOWN_ERROR',
      );
    }
  }

  return { processed: claimed.length, sent, failed };
}

/**
 * Schedule delivery work after the response (serverless-safe — a bare
 * floating promise can be frozen away once the handler returns). Resolves
 * `next/server` at runtime so bundling this module into client graphs
 * stays safe (same indirection as writeAuditLog).
 */ async function nextAfter(): Promise<((cb: () => Promise<unknown>) => void) | null> {
  try {
    const load = new Function('m', 'return import(m)') as (
      m: string,
    ) => Promise<{ after: (cb: () => Promise<unknown>) => void }>;
    const mod = await load('next/server');
    return typeof mod?.after === 'function' ? mod.after : null;
  } catch {
    return null;
  }
}

/**
 * Kick a drain run after the current response finishes. Never throws:
 * delivery failures are recorded on the row, not surfaced into the
 * completed business action.
 */
export async function scheduleOutboxDrain(): Promise<void> {
  try {
    const after = await nextAfter();
    const run = processDueEmails().catch((err: unknown) => {
      console.error('[email-outbox] drain failed:', err instanceof Error ? err.message : err);
    });
    if (after) {
      after(() => run);
    } else {
      // Outside a request scope (scripts/tests): still fire the drain —
      // the row-level claim keeps it safe against concurrent workers.
      await run;
    }
  } catch {
    // Scheduler unavailable — the next enqueue or cron tick will drain.
  }
}
