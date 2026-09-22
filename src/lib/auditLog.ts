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
 * Write an audit log entry to the DB. Synchronous signature so every
 * existing call site stays valid; internally queues the insert and
 * reports failures via console.error only.
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

  // Fire-and-forget insert. Never awaited by callers today; failures are
  // logged rather than propagated so audit cannot break the action itself.
  void prisma.auditLog
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
