/**
 * Audit Log Helper — 06-database.md §14, 11-admin.md.
 * Append-only audit trail for every mutating admin action.
 *
 * Audit fix 2026-09-27 (external finding, High): the old helper returned
 * synchronously and started the insert behind a floating promise, so (a)
 * privileged mutations could commit with no durable audit row and (b) rows
 * could outlive a rolled-back mutation. The helper is now **async and must
 * be awaited**:
 *
 *  - `tx` supplied  → the audit row is written INSIDE the caller's
 *    transaction and is awaited: mutation and evidence commit/roll back as
 *    one unit (role changes, staff deactivation, wallet adjustments,
 *    password resets, fulfilment confirmations).
 *  - no `tx`        → the insert is awaited and scheduled via Next's
 *    `after()` so the row survives the response (serverless-safe); failures
 *    are logged but do not fail the (non-privileged) action.
 *
 * A forced insert failure inside a transactional caller now rolls the whole
 * mutation back (asserted by tests/audit-atomicity.test.ts).
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';

/**
 * Resolve Next's `after` at runtime. writeAuditLog only ever runs on the
 * server, but this module is also *bundled* into client components (via
 * isomorphic api/ helpers), where a static `import { after } from
 * 'next/server'` is a build error. The indirection keeps webpack from
 * linking it into the client graph; on the server it behaves exactly like
 * the static import.
 */
async function nextAfter(): Promise<((cb: () => Promise<unknown>) => void) | null> {
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

/** Prisma Json input accepts our loose records; cast at the DB boundary. */
type JsonInput = Prisma.InputJsonValue;
const asJson = (v: Record<string, unknown>): JsonInput => v as JsonInput;

export type AuditActorType = 'admin' | 'customer' | 'system';

export type AuditLogEntry = {
  id: string;
  actorType: AuditActorType;
  actorId: string;
  actorEmail: string;
  action: string;
  tableName: string;
  recordId: string;
  diff: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  } | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

/**
 * The Prisma interactive-transaction client — the audit write accepts the
 * exact client type `prisma.$transaction(async (tx) => …)` hands to callers,
 * so `tx` can be passed through with no casts anywhere.
 */
export type AuditTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function writeAuditLog(params: {
  actorType: AuditActorType;
  actorId: string;
  actorEmail: string;
  action: string;
  tableName: string;
  recordId: string;
  diff?: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  } | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Transaction client — makes the audit row ATOMIC with the caller's
   * mutation: awaited, and rolled back together with it. Every
   * security- or money-sensitive mutation MUST pass its tx here.
   */
  tx?: AuditTx;
}): Promise<AuditLogEntry> {
  const entry: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    actorType: params.actorType,
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    action: params.action,
    tableName: params.tableName,
    recordId: params.recordId,
    diff: params.diff ?? null,
    ipAddress: params.ipAddress ?? null,
    metadata: params.metadata ?? null,
    createdAt: new Date(),
  };

  const data = {
    actorType: entry.actorType,
    actorId: entry.actorId,
    actorEmail: entry.actorEmail,
    action: entry.action,
    tableName: entry.tableName,
    recordId: entry.recordId,
    ...(entry.diff?.before && { diffBefore: asJson(entry.diff.before) }),
    ...(entry.diff?.after && { diffAfter: asJson(entry.diff.after) }),
    ...(entry.ipAddress && { ipAddress: entry.ipAddress }),
    ...(entry.metadata && { metadata: asJson(entry.metadata) }),
  };

  // Transactional path: awaited, atomic with the caller's mutation. A
  // failure here throws INTO the transaction → the whole mutation rolls
  // back with its evidence missing.
  if (params.tx) {
    await params.tx.auditLog.create({ data });
    return entry;
  }

  // Durable-after-response insert (finding: a bare floating promise can be
  // frozen away on serverless once the response returns, losing the audit
  // row of a SUCCESSFUL action). The insert itself is awaited here so
  // callers observe persistence; `after` keeps the invocation alive when
  // the call happens inside a request scope. Failures are logged, not
  // thrown — non-transactional audit must not take the action down.
  const insert = prisma.auditLog.create({ data }).then(() => entry);
  try {
    const after = await nextAfter();
    if (after) {
      after(() => insert);
    }
    // Outside a request context (scripts/tests) — the awaited insert below
    // still persists the row synchronously with respect to the caller.
  } catch {
    // Scheduler unavailable — fall through to the awaited insert.
  }
  try {
    return await insert;
  } catch (err) {
    console.error('[audit] write failed:', err instanceof Error ? err.message : err);
    return entry;
  }
}

/**
 * Query audit log entries from the DB (admin audit viewer, 07-api.md §27).
 * Filters mirror the old mock exactly; pagination is page-1-based.
 */
export async function queryAuditLog(params: {
  actorType?: string;
  actorId?: string;
  action?: string;
  tableName?: string;
  recordId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const where = {
    ...(params.actorType ? { actorType: params.actorType } : {}),
    ...(params.actorId ? { actorId: params.actorId } : {}),
    ...(params.action ? { action: { contains: params.action } } : {}),
    ...(params.tableName ? { tableName: { contains: params.tableName } } : {}),
    ...(params.recordId ? { recordId: params.recordId } : {}),
    ...(params.dateFrom || params.dateTo
      ? {
          createdAt: {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    total,
    entries: rows.map((r) => ({
      id: r.id,
      actorType: r.actorType as AuditActorType,
      actorId: r.actorId,
      actorEmail: r.actorEmail,
      action: r.action,
      tableName: r.tableName,
      recordId: r.recordId,
      diff:
        r.diffBefore || r.diffAfter
          ? {
              before: (r.diffBefore as Record<string, unknown> | null) ?? null,
              after: (r.diffAfter as Record<string, unknown> | null) ?? null,
            }
          : null,
      ipAddress: r.ipAddress,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt,
    })),
  };
}
