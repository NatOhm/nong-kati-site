/**
 * Audit Log Helper — 06-database.md §14, 11-admin.md.
 * Append-only audit trail for every mutating admin action.
 *
 * Review M5: entries persist to the `AuditLog` table (was an in-memory
 * mock that reset on every serverless instance). Writes are fire-and-
 * forget: they never throw, never block the guarded mutation, and a DB
 * hiccup degrades to a console warning instead of failing the request —
 * an audit helper must not take business actions down with it. Callers
 * inside prisma.$transaction blocks keep their current fire-after-write
 * shape (the audit row then commits with the caller's transaction).
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
 * Write an audit log entry to the DB. Returns synchronously with the entry
 * (so every existing call site stays valid); the insert itself is scheduled
 * to run after the response via Next's after() — keeping the serverless
 * invocation alive so the row cannot be frozen away. Failures are reported
 * via console.error only.
 */
export function writeAuditLog(params: {
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
}): AuditLogEntry {
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

  // Durable-after-response insert (finding: a bare floating promise can be
  // frozen away on serverless once the response returns, losing the audit
  // row of a SUCCESSFUL mutation). `after` keeps the invocation alive until
  // the insert settles; failures are logged rather than propagated so audit
  // cannot break the action itself.
  const insert = prisma.auditLog
    .create({
      data: {
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
      },
    })
    .catch((err: unknown) => {
      console.error('[audit] write failed:', err instanceof Error ? err.message : err);
    });

  void (async () => {
    try {
      const after = await nextAfter();
      if (after) {
        after(() => insert);
      }
      // Outside a request context (scripts/tests) — degrade to floating
      // promise as before.
    } catch {
      // Scheduler unavailable — degrade to floating promise as before.
    }
  })();

  return entry;
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
