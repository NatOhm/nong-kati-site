'use client';

import { useState } from 'react';
import { Search, Download, Filter } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminJson } from '@/lib/adminSession';
import { cn } from '@/utils/cn';

/** Serialized AuditLogEntry as delivered by GET /api/v1/admin/audit-log. */
interface AuditLogRow {
  id: string;
  actorType: string;
  actorId: string;
  actorEmail: string;
  action: string;
  tableName: string;
  recordId: string;
  diff: { before: Record<string, unknown> | null; after: Record<string, unknown> | null } | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  resend_email: 'ส่งอีเมลอีกครั้ง',
  assign_code: 'กำหนดโค้ด',
  update_notes: 'อัปเดตหมายเหตุ',
  refund_issued: 'คืนเงิน',
  customer_blocked: 'บล็อคลูกค้า',
  customer_unblocked: 'ปลดบล็อค',
  staff_created: 'สร้างพนักงาน',
  role_change: 'เปลี่ยนบทบาท',
  staff_deactivated: 'ปิดใช้งานพนักงาน',
  staff_activated: 'เปิดใช้งานพนักงาน',
  order_created: 'สร้างคำสั่งซื้อ',
  payment_succeeded: 'ชำระเงินสำเร็จ',
  code_delivered: 'ส่งโค้ดสำเร็จ',
};

const ACTOR_TYPE_LABELS: Record<string, string> = {
  admin: 'Admin',
  customer: 'ลูกค้า',
  system: 'ระบบ',
};

export default function AdminAuditPage(): React.JSX.Element {
  const [entries, setEntries] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [actorTypeFilter, setActorTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const pageSize = 20;

  const handleSearch = async (p: number = 1) => {
    setLoading(true);
    setPage(p);
    try {
      const qs = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
      if (actionFilter) qs.set('action', actionFilter);
      if (tableFilter) qs.set('tableName', tableFilter);
      if (actorTypeFilter) qs.set('actorType', actorTypeFilter);
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      const result = await adminJson<{ entries: AuditLogRow[]; total: number }>(
        `/api/v1/admin/audit-log?${qs.toString()}`,
      );
      setEntries(result.entries);
      setTotal(result.total);
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const qs = new URLSearchParams({ page: '1', pageSize: '100' });
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      const result = await adminJson<{ entries: AuditLogRow[]; total: number }>(
        `/api/v1/admin/audit-log?${qs.toString()}`,
      );
      const header = 'timestamp,actorType,actorEmail,action,tableName,recordId';
      const rows = result.entries.map((e) =>
        [
          e.createdAt,
          e.actorType,
          e.actorEmail,
          e.action,
          e.tableName,
          e.recordId,
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(','),
      );
      const csv = [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Export is best-effort; the viewer itself remains usable.
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'Audit Log' }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg">Audit Log</h1>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-md border border-line-subtle px-4 py-2 text-sm text-fg-secondary hover:bg-surface"
          >
            <Download size={14} /> ส่งออก CSV
          </button>
        </div>

        {/* Filters */}
        <div className="rounded-md border border-line-subtle bg-surface p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-fg-muted">
            <Filter size={14} /> ตัวกรอง
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs text-fg-placeholder">การกระทำ</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full rounded border border-line-subtle bg-surface px-2 py-1.5 text-sm text-fg-secondary focus:border-line-brand focus:outline-none"
              >
                <option value="">ทั้งหมด</option>
                {Object.entries(ACTION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-placeholder">ตาราง</label>
              <input
                type="text"
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                placeholder="store.orders"
                className="w-full rounded border border-line-subtle bg-surface px-2 py-1.5 text-sm text-fg-secondary placeholder:text-clay-400 focus:border-line-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-placeholder">ผู้กระทำ</label>
              <select
                value={actorTypeFilter}
                onChange={(e) => setActorTypeFilter(e.target.value)}
                className="w-full rounded border border-line-subtle bg-surface px-2 py-1.5 text-sm text-fg-secondary focus:border-line-brand focus:outline-none"
              >
                <option value="">ทั้งหมด</option>
                <option value="admin">Admin</option>
                <option value="customer">ลูกค้า</option>
                <option value="system">ระบบ</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-placeholder">จากวันที่</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded border border-line-subtle bg-surface px-2 py-1.5 text-sm text-fg-secondary focus:border-line-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-placeholder">ถึงวันที่</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded border border-line-subtle bg-surface px-2 py-1.5 text-sm text-fg-secondary focus:border-line-brand focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-3">
            <button
              onClick={() => handleSearch(1)}
              disabled={loading}
              className="rounded-md bg-peach-500 px-4 py-2 text-sm font-medium text-fg hover:bg-peach-400 disabled:opacity-50"
            >
              {loading ? 'กำลังโหลด...' : 'ค้นหา'}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="text-sm text-fg-placeholder">พบ {total} รายการ</div>

        {/* Audit Log Table */}
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface">
                <th className="px-4 py-3 text-left font-medium text-fg-muted">วันที่</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">ผู้กระทำ</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">การกระทำ</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">ตาราง</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">Record ID</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">รายละเอียด</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-clay-400">
                    {loading ? 'กำลังโหลด...' : 'กด "ค้นหา" เพื่อแสดง Audit Log'}
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-line-subtle hover:bg-surface">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-fg-placeholder">
                      {new Date(entry.createdAt).toLocaleString('th-TH')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-fg-muted">{entry.actorEmail}</div>
                      <div className="text-[10px] text-clay-400">
                        {ACTOR_TYPE_LABELS[entry.actorType] ?? entry.actorType}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          entry.action.includes('refund')
                            ? 'bg-coral-500/15 text-coral-700'
                            : entry.action.includes('block')
                              ? 'bg-peach-100 text-fg-brand'
                              : 'bg-surface text-fg-muted',
                        )}
                      >
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-fg-placeholder">
                      {entry.tableName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-fg-placeholder">
                      {entry.recordId.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-placeholder">
                      {entry.diff ? (
                        <span>
                          {entry.diff.before && <span className="text-coral-600/70">-</span>}
                          {entry.diff.after && <span className="text-jade-600/70">+</span>}
                        </span>
                      ) : entry.metadata ? (
                        <span className="text-clay-400">
                          {JSON.stringify(entry.metadata).slice(0, 50)}...
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-clay-400">{entry.ipAddress ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => handleSearch(page - 1)}
              disabled={page <= 1}
              className="rounded border border-line-subtle px-3 py-1 text-sm text-fg-muted hover:bg-surface disabled:opacity-50"
            >
              ก่อนหน้า
            </button>
            <span className="text-sm text-fg-placeholder">
              หน้า {page} / {totalPages}
            </span>
            <button
              onClick={() => handleSearch(page + 1)}
              disabled={page >= totalPages}
              className="rounded border border-line-subtle px-3 py-1 text-sm text-fg-muted hover:bg-surface disabled:opacity-50"
            >
              ถัดไป
            </button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
