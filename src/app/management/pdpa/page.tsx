'use client';

/**
 * Admin PDPA Request Queue — 11-admin.md §12, 02-user-flow.md UF-17.
 * Super Admin only — manages data subject requests.
 */

import { useState } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { cn } from '@/utils/cn';
import { listDataRequests, updateDataRequest, type DataRequest, type DataRequestStatus } from '@/api/dataRequests';

const STATUS_LABELS: Record<DataRequestStatus, { label: string; icon: React.ReactNode; color: string }> = {
  pending: {
    label: 'รอดำเนินการ',
    icon: <Clock size={14} />,
    color: 'text-amber-400 bg-amber-900/30',
  },
  processing: {
    label: 'กำลังดำเนินการ',
    icon: <Clock size={14} />,
    color: 'text-sky-400 bg-sky-900/30',
  },
  completed: {
    label: 'เสร็จสิ้น',
    icon: <CheckCircle size={14} />,
    color: 'text-jade-400 bg-jade-900/30',
  },
  rejected: {
    label: 'ปฏิเสธ',
    icon: <XCircle size={14} />,
    color: 'text-crimson-400 bg-crimson-900/30',
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

  const handleLoad = async (status?: DataRequestStatus) => {
    setLoading(true);
    setActionMessage(null);
    try {
      const filter = status ?? (statusFilter as DataRequestStatus | '');
      const params: Parameters<typeof listDataRequests>[0] = {};
      if (filter) params.status = filter;
      const result = await listDataRequests(params);
      setRequests(result.data);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (
    requestId: string,
    status: DataRequestStatus,
    notes?: string
  ) => {
    const updateParams: Parameters<typeof updateDataRequest>[1] = { status };
    if (notes) updateParams.adminNotes = notes;
    const result = await updateDataRequest(
      requestId,
      updateParams,
      'staff-001',
      'founder@nong-kati.co.th'
    );
    if (result.success) {
      setActionMessage('อัปเดตสถานะสำเร็จ');
      handleLoad();
    }
  };

  return (
    <AdminShell
      staffName="Founder"
      staffRole="super_admin"
      breadcrumbs={[{ label: 'PDPA Requests' }]}
    >
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink-100">คำขอ PDPA</h1>

        {actionMessage && (
          <div className="rounded-md border border-jade-700/50 bg-jade-900/10 px-4 py-3 text-sm text-jade-300">
            {actionMessage}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DataRequestStatus | '')}
            className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-ink-200 focus:border-amber-700 focus:outline-none"
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
            className="rounded-md bg-amber-400 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-amber-300 disabled:opacity-50"
          >
            {loading ? 'กำลังโหลด...' : 'โหลด'}
          </button>
        </div>

        <div className="text-sm text-ink-400">
          พบ {total} รายการ
        </div>

        {/* Requests Table */}
        <div className="overflow-x-auto rounded-md border border-ink-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 bg-ink-800">
                <th className="px-4 py-3 text-left font-medium text-ink-300">ID</th>
                <th className="px-4 py-3 text-left font-medium text-ink-300">ประเภท</th>
                <th className="px-4 py-3 text-left font-medium text-ink-300">อีเมล</th>
                <th className="px-4 py-3 text-left font-medium text-ink-300">รายละเอียด</th>
                <th className="px-4 py-3 text-center font-medium text-ink-300">สถานะ</th>
                <th className="px-4 py-3 text-center font-medium text-ink-300">วันที่</th>
                <th className="px-4 py-3 text-right font-medium text-ink-300">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-500">
                    {loading ? 'กำลังโหลด...' : 'กด "โหลด" เพื่อแสดงคำขอ'}
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="border-b border-ink-700/50 hover:bg-ink-850">
                    <td className="px-4 py-3 font-mono text-xs text-ink-400">{req.id.slice(0, 12)}...</td>
                    <td className="px-4 py-3 text-ink-200">{TYPE_LABELS[req.type] ?? req.type}</td>
                    <td className="px-4 py-3 text-ink-200">{req.email}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-ink-400">{req.details}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_LABELS[req.status].color
                      )}>
                        {STATUS_LABELS[req.status].icon}
                        {STATUS_LABELS[req.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-ink-400">
                      {req.createdAt.toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {req.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'processing')}
                            className="rounded bg-sky-900/30 px-2 py-1 text-xs text-sky-400 hover:bg-sky-900/50"
                          >
                            รับดำเนินการ
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'rejected')}
                            className="rounded bg-crimson-900/30 px-2 py-1 text-xs text-crimson-400 hover:bg-crimson-900/50"
                          >
                            ปฏิเสธ
                          </button>
                        </div>
                      )}
                      {req.status === 'processing' && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'completed')}
                            className="rounded bg-jade-900/30 px-2 py-1 text-xs text-jade-400 hover:bg-jade-900/50"
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
