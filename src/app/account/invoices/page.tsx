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
      <h1 className="text-2xl font-bold text-fg">ใบกำกับภาษี</h1>

      {MOCK_INVOICES.length === 0 ? (
        <div className="rounded-md border border-line-subtle bg-white p-8 text-center">
          <p className="text-fg-placeholder">ยังไม่มีใบกำกับภาษี</p>
        </div>
      ) : (
        <div className="space-y-3">
          {MOCK_INVOICES.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between rounded-md border border-line-subtle bg-white p-4"
            >
              <div>
                <p className="text-sm font-medium text-fg-secondary">{inv.invoiceNumber}</p>
                <p className="text-clay-9000 text-xs">
                  {inv.orderNumber} · {inv.date.toLocaleDateString('th-TH')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm text-fg-secondary">{formatThb(inv.amount)}</p>
                <button className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-3 py-1.5 text-xs text-fg-muted hover:bg-surface">
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
