'use client';

/**
 * Admin Reports Page — 11-admin.md §13.
 * Report catalogue with export functionality.
 */

import { Download, FileText } from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';

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
  const handleExport = (reportId: string) => {
    // Mock: trigger CSV export
    alert(`ส่งออกรายงาน "${reportId}" เป็น CSV — ฟังก์ชันนี้จะเชื่อมต่อกับ API ในอนาคต`);
  };

  return (
    <AdminShell staffName="Founder" staffRole="super_admin" breadcrumbs={[{ label: 'รายงาน' }]}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-fg">รายงาน</h1>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((report) => (
            <div
              key={report.id}
              className="rounded-md border border-line-subtle bg-white p-6 transition-colors hover:border-line-brand"
            >
              <div className="mb-3 text-2xl">{report.icon}</div>
              <h3 className="mb-1 text-sm font-semibold text-fg">{report.name}</h3>
              <p className="mb-4 text-xs text-fg-placeholder">{report.description}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExport(report.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-3 py-1.5 text-xs text-fg-muted hover:bg-surface"
                >
                  <Download size={12} /> CSV
                </button>
                <button
                  onClick={() => handleExport(report.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-3 py-1.5 text-xs text-fg-muted hover:bg-surface"
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
