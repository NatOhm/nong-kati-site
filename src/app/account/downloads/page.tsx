/**
 * Downloads Page — 12-dashboard.md §8.
 * Receipt downloads.
 */

import { Download } from 'lucide-react';
import { formatThb } from '@/lib/pricing';

const MOCK_RECEIPTS = [
  {
    id: 'inv-001',
    orderNumber: 'NK-2026-000001',
    type: 'receipt',
    amount: 214,
    date: new Date('2026-08-20T14:00:21Z'),
  },
  {
    id: 'inv-002',
    orderNumber: 'NK-2026-000002',
    type: 'receipt',
    amount: 107,
    date: new Date('2026-08-15T10:30:18Z'),
  },
];

export default function AccountDownloadsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-clay-900">ใบเสร็จรับเงิน</h1>

      {MOCK_RECEIPTS.length === 0 ? (
        <div className="rounded-md border border-clay-200 bg-white p-8 text-center">
          <p className="text-clay-500">ยังไม่มีใบเสร็จ</p>
        </div>
      ) : (
        <div className="space-y-3">
          {MOCK_RECEIPTS.map((receipt) => (
            <div
              key={receipt.id}
              className="flex items-center justify-between rounded-md border border-clay-200 bg-white p-4"
            >
              <div>
                <p className="text-sm font-medium text-clay-700">{receipt.orderNumber}</p>
                <p className="text-clay-9000 text-xs">{receipt.date.toLocaleDateString('th-TH')}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm text-clay-700">{formatThb(receipt.amount)}</p>
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
