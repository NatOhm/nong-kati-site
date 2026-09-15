/**
 * Invoices Page — 12-dashboard.md §9.
 * Tax invoice downloads.
 */

import { Download } from 'lucide-react';
import { formatThb } from '@/lib/pricing';

const MOCK_INVOICES = [
  {
    id: 'tax-001',
    invoiceNumber: 'TAX-2026-000001',
    orderNumber: 'NK-2026-000001',
    amount: 214,
    date: new Date('2026-08-20T14:00:21Z'),
  },
];

export default function AccountInvoicesPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-clay-900">ใบกำกับภาษี</h1>

      {MOCK_INVOICES.length === 0 ? (
        <div className="rounded-md border border-clay-200 bg-white p-8 text-center">
          <p className="text-clay-500">ยังไม่มีใบกำกับภาษี</p>
        </div>
      ) : (
        <div className="space-y-3">
          {MOCK_INVOICES.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between rounded-md border border-clay-200 bg-white p-4"
            >
              <div>
                <p className="text-sm font-medium text-clay-700">{inv.invoiceNumber}</p>
                <p className="text-clay-9000 text-xs">
                  {inv.orderNumber} · {inv.date.toLocaleDateString('th-TH')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm text-clay-700">{formatThb(inv.amount)}</p>
                <button className="inline-flex items-center gap-1 rounded-md border border-clay-200 px-3 py-1.5 text-xs text-clay-600 hover:bg-clay-100">
                  <Download size={12} /> ดาวน์โหลด
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
