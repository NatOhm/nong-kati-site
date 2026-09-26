'use client';

/**
 * Admin Reports Page — 11-admin.md §13.
 * Report catalogue with export functionality.
 */

import { useState } from 'react';
import { AlertCircle, Download, FileText } from 'lucide-react';

import { AdminShell } from '@/components/layout/AdminShell';
import { adminFetchJson } from '@/lib/adminSession';

const REPORTS = [
  {
    id: 'revenue',
    name: 'รายงานรายได้',
    description: 'รายได้รวม สุทธิ VAT คืนเงิน แยกตามวัน',
    icon: '💰',
  },
  {
    id: 'products',
    name: 'รายงานสินค้า',
    description: 'สินค้าขายดี กำไรต่อสินค้า ยอดขายแยกตามหมวด',
    icon: '📦',
  },
  {
    id: 'payments',
    name: 'รายงานการชำระเงิน',
    description: 'PromptPay vs บัตรเครดิต สำเร็จ vs ล้มเหลว',
    icon: '💳',
  },
  {
    id: 'inventory',
    name: 'รายงานคลังสินค้า',
    description: 'Stock levels, codes remaining, low stock alerts',
    icon: '🔑',
  },
  {
    id: 'refunds',
    name: 'รายงานการคืนเงิน',
    description: 'จำนวน ยอดรวม สาเหตุ แยกตามช่วงเวลา',
    icon: '↩️',
  },
  {
    id: 'customers',
    name: 'รายงานลูกค้า',
    description: 'ลูกค้าใหม่ vs กลับมา ยอดซื้อเฉลี่ย CLV',
    icon: '👤',
  },
];

export default function AdminReportsPage(): React.JSX.Element {
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Review: real CSV export from the live report APIs (reports:read gated).
  const handleExport = async (reportId: string) => {
    const endpoints: Record<string, string> = {
      customers: '/api/v1/admin/reports/customer-sales',
      inventory: '/api/v1/admin/reports/slow-stock',
    };
    const endpoint = endpoints[reportId];
    if (!endpoint) {
      setExportError('รายงานนี้ยังไม่เปิดให้ส่งออก');
      return;
    }
    setExporting(reportId);
    setExportError(null);
    try {
      const res = await adminFetchJson(endpoint, 'GET', undefined);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        rows?: Record<string, unknown>[];
        customers?: Record<string, unknown>[];
      };
      const rows = data.rows ?? data.customers ?? [];
      if (rows.length === 0) {
        setExportError('ไม่มีข้อมูลสำหรับส่งออก');
        return;
      }
      const headers = Object.keys(rows[0]!);
      const csv = [
        headers.join(','),
        ...rows.map((r) =>
          headers
            .map((h) => {
              const v = r[h];
              const s = v === null || v === undefined ? '' : String(v);
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(','),
        ),
      ].join('\n');
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportId}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('ส่งออกไม่สำเร็จ — ลองใหม่อีกครั้ง');
    } finally {
      setExporting(null);
    }
  };

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'รายงาน' }]}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-fg">รายงาน</h1>

        {exportError && (
          <div
            role="alert"
            className="border-error bg-error flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm text-fg-error"
          >
            <AlertCircle size={15} /> {exportError}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((report) => (
            <div
              key={report.id}
              className="rounded-md border border-line-subtle bg-surface p-6 transition-colors hover:border-line-brand"
            >
              <div className="mb-3 text-2xl">{report.icon}</div>
              <h3 className="mb-1 text-sm font-semibold text-fg">{report.name}</h3>
              <p className="mb-4 text-xs text-fg-placeholder">{report.description}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleExport(report.id)}
                  disabled={exporting === report.id}
                  className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-3 py-1.5 text-xs text-fg-muted hover:bg-surface disabled:opacity-50"
                >
                  <Download size={12} />
                  {exporting === report.id ? 'กำลังส่งออก…' : 'CSV'}
                </button>
                {exporting === report.id && null}
                <button
                  disabled
                  title="ยังไม่รองรับ — ใช้ปุ่ม CSV ก่อนได้เลย"
                  className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-line-subtle px-3 py-1.5 text-xs text-fg-placeholder opacity-60"
                >
                  <FileText size={12} /> PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
