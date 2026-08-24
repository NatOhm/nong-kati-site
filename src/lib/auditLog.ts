/**
 * Audit Log Helper — 06-database.md §14, 11-admin.md.
 * Append-only write helper for every mutating admin action.
 * In production: writes to audit.audit_logs (RULE/trigger-protected, no UPDATE/DELETE).
 * For M7 mock: stores in-memory array (resets on server restart).
 */

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

// In-memory mock store (resets on restart — fine for dev/staging)
const auditLogStore: AuditLogEntry[] = [];

/**
 * Write an audit log entry.
 * Called after every mutating admin action.
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

  auditLogStore.push(entry);
  return entry;
}

/**
 * Query audit log entries (for the admin audit log viewer).
 * 07-api.md §27 — GET /admin/audit-log
 */
export function queryAuditLog(params: {
  actorType?: string;
  actorId?: string;
  action?: string;
  tableName?: string;
  recordId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}): { entries: AuditLogEntry[]; total: number } {
  let filtered = [...auditLogStore];

  if (params.actorType) {
    filtered = filtered.filter((e) => e.actorType === params.actorType);
  }
  if (params.actorId) {
    filtered = filtered.filter((e) => e.actorId === params.actorId);
  }
  if (params.action) {
    filtered = filtered.filter((e) => e.action === params.action);
  }
  if (params.tableName) {
    filtered = filtered.filter((e) => e.tableName === params.tableName);
  }
  if (params.recordId) {
    filtered = filtered.filter((e) => e.recordId === params.recordId);
  }
  if (params.dateFrom) {
    const from = new Date(params.dateFrom);
    filtered = filtered.filter((e) => e.createdAt >= from);
  }
  if (params.dateTo) {
    const to = new Date(params.dateTo);
    filtered = filtered.filter((e) => e.createdAt <= to);
  }

  // Sort by most recent first
  filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const page = params.page ?? 1;
  const pageSize = Math.min(params.pageSize ?? 50, 100);
  const total = filtered.length;
  const entries = filtered.slice((page - 1) * pageSize, page * pageSize);

  return { entries, total };
}

/**
 * Export audit log as CSV string.
 * 07-api.md §27 — GET /admin/audit-log/export
 */
export function exportAuditLogCsv(params: {
  dateFrom?: string;
  dateTo?: string;
}): string {
  const queryParams: Parameters<typeof queryAuditLog>[0] = { pageSize: 10000 };
  if (params.dateFrom) queryParams.dateFrom = params.dateFrom;
  if (params.dateTo) queryParams.dateTo = params.dateTo;
  const { entries } = queryAuditLog(queryParams);

  const header = 'id,actor_type,actor_id,actor_email,action,table_name,record_id,diff_before,diff_after,ip_address,metadata,created_at';
  const rows = entries.map((e) => {
    const diffBefore = e.diff?.before ? JSON.stringify(e.diff.before) : '';
    const diffAfter = e.diff?.after ? JSON.stringify(e.diff.after) : '';
    const metadata = e.metadata ? JSON.stringify(e.metadata) : '';

    return [
      e.id,
      e.actorType,
      e.actorId,
      e.actorEmail,
      e.action,
      e.tableName,
      e.recordId,
      `"${diffBefore}"`,
      `"${diffAfter}"`,
      e.ipAddress ?? '',
      `"${metadata}"`,
      e.createdAt.toISOString(),
    ].join(',');
  });

  return [header, ...rows].join('\n');
}
