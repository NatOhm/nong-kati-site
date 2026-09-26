'use client';

/**
 * Admin PDPA Request Queue — 11-admin.md §12, 02-user-flow.md UF-17.
 * Super Admin only — manages data subject requests.
 */

import { useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminFetch } from '@/lib/adminSession';
import { cn } from '@/utils/cn';
import type { DataRequest, DataRequestStatus } from '@/api/dataRequests';

const STATUS_LABELS: Record<
  DataRequestStatus,
  { label: string; icon: React.ReactNode; color: string }
> = {
  pending: {
    label: 'รอดำเนินการ',
    icon: <Clock size={14} />,
    color: 'text-fg-brand bg-peach-100',
  },
  processing: {
    label: 'กำลังดำเนินการ',
    icon: <Clock size={14} />,
    color: 'text-sapphire-200 bg-sapphire-400/15',
  },
  completed: {
    label: 'เสร็จสิ้น',
    icon: <CheckCircle size={14} />,
    color: 'text-jade-600 bg-jade-500/15',
  },
  rejected: {
    label: 'ปฏิเสธ',
    icon: <XCircle size={14} />,
    color: 'text-coral-700 bg-coral-500/15',
  },
};

const TYPE_LABELS: Record<string, string> = {
  access: 'ขอเข้าถึง',
  correct: 'ขอแก้ไข',
  delete: 'ขอลบ',
  port: 'ขอโอนย้าย',
};

export default function AdminPdpaPage(): React.JSX.Element {
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<DataRequestStatus | ''>('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleLoad = useCallback(
    async (status?: DataRequestStatus) => {
      setLoading(true);
      setActionMessage(null);
      try {
        const filter = status ?? (statusFilter as DataRequestStatus | '');
        const qs = filter ? `?status=${encodeURIComponent(filter)}` : '';
        const res = await adminFetch(`/api/v1/pdpa/data-requests${qs}`);
        const result = (await res.json().catch(() => ({}))) as {
          data?: DataRequest[];
          total?: number;
        };
        if (!res.ok) throw new Error('load failed');
        setRequests(result.data ?? []);
        setTotal(result.total ?? 0);
      } catch {
        setActionMessage('โหลดคำขอไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    void handleLoad();
  }, [handleLoad]);

  const handleUpdateStatus = async (
    requestId: string,
    status: DataRequestStatus,
    notes?: string,
  ) => {
    try {
      await adminFetch(`/api/v1/pdpa/data-requests/${encodeURIComponent(requestId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNotes: notes }),
      });
      setActionMessage('อัปเดตสถานะสำเร็จ');
      void handleLoad();
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ');
    }
  };

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'PDPA Requests' }]}
    >
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-fg">คำขอ PDPA</h1>

        {actionMessage && (
          <div className="rounded-md border border-jade-500/40 bg-jade-500/10 px-4 py-3 text-sm text-jade-700">
            {actionMessage}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DataRequestStatus | '')}
            className="rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-fg-secondary focus:border-line-brand"
          >
            <option value="">ทุกสถานะ</option>
            <option value="pending">รอดำเนินการ</option>
            <option value="processing">กำลังดำเนินการ</option>
            <option value="completed">เสร็จสิ้น</option>
            <option value="rejected">ปฏิเสธ</option>
          </select>
          <button
            onClick={() => handleLoad()}
            disabled={loading}
            className="rounded-md bg-peach-500 px-4 py-2 text-sm font-medium text-fg hover:bg-peach-400 disabled:opacity-50"
          >
            {loading ? 'กำลังโหลด...' : 'โหลด'}
          </button>
        </div>

        <div className="text-sm text-fg-placeholder">พบ {total} รายการ</div>

        {/* Requests Table */}
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface">
                <th className="px-4 py-3 text-left font-medium text-fg-muted">ID</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">ประเภท</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">อีเมล</th>
                <th className="px-4 py-3 text-left font-medium text-fg-muted">รายละเอียด</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">สถานะ</th>
                <th className="px-4 py-3 text-center font-medium text-fg-muted">วันที่</th>
                <th className="px-4 py-3 text-right font-medium text-fg-muted">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-clay-400">
                    {loading ? 'กำลังโหลด...' : 'กด "โหลด" เพื่อแสดงคำขอ'}
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="border-b border-line-subtle hover:bg-surface">
                    <td className="px-4 py-3 font-mono text-xs text-fg-placeholder">
                      {req.id.slice(0, 12)}...
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">
                      {TYPE_LABELS[req.type] ?? req.type}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">{req.email}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-fg-placeholder">
                      {req.details}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_LABELS[req.status].color,
                        )}
                      >
                        {STATUS_LABELS[req.status].icon}
                        {STATUS_LABELS[req.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-fg-placeholder">
                      {req.createdAt.toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {req.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'processing')}
                            className="rounded bg-sapphire-400/15 px-2 py-1 text-xs text-sapphire-700 hover:bg-sapphire-400/30"
                          >
                            รับดำเนินการ
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'rejected')}
                            className="rounded bg-coral-500/15 px-2 py-1 text-xs text-coral-600 hover:bg-coral-100"
                          >
                            ปฏิเสธ
                          </button>
                        </div>
                      )}
                      {req.status === 'processing' && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'completed')}
                            className="text-jade-600 rounded bg-jade-500/15 px-2 py-1 text-xs hover:bg-jade-900/50"
                          >
                            เสร็จสิ้น
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
