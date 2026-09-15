/**
 * Purchased Codes Page — 12-dashboard.md §7.
 * Flat, searchable, cross-order list of every delivered code.
 */

'use client';

import { useState } from 'react';
import { Search, Copy, CheckCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

const MOCK_CODES = [
  {
    id: 'code-001',
    code: 'STEAM-XXXX-YYYY-ZZZZ',
    product: 'Steam Wallet ฿100',
    orderNumber: 'NK-2026-000001',
    deliveredAt: new Date('2026-08-20T14:00:21Z'),
    used: false,
  },
  {
    id: 'code-002',
    code: 'STEAM-ABCD-EFGH-IJKL',
    product: 'Steam Wallet ฿100',
    orderNumber: 'NK-2026-000001',
    deliveredAt: new Date('2026-08-20T14:00:21Z'),
    used: false,
  },
  {
    id: 'code-003',
    code: 'NETFLIX-MNOP-QRST-UVWX',
    product: 'Netflix ฿350',
    orderNumber: 'NK-2026-000002',
    deliveredAt: new Date('2026-08-15T10:30:18Z'),
    used: true,
  },
];

export default function AccountCodesPage(): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredCodes = MOCK_CODES.filter(
    (c) =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.product.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCopy = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-clay-900">โค้ดที่ซื้อ</h1>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-clay-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาโค้ด หรือชื่อสินค้า..."
          className="placeholder:text-clay-9000 w-full rounded-md border border-clay-200 bg-white py-2 pl-9 pr-3 text-sm text-clay-900 focus:border-peach-300 focus:outline-none"
        />
      </div>

      {/* Codes List */}
      {filteredCodes.length === 0 ? (
        <div className="rounded-md border border-clay-200 bg-white p-8 text-center">
          <p className="text-clay-500">ไม่พบโค้ด</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCodes.map((item) => (
            <div
              key={item.id}
              className={cn(
                'rounded-md border p-4',
                item.used ? 'border-clay-200 bg-white opacity-60' : 'border-peach-300 bg-peach-50',
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-clay-700">{item.product}</p>
                  <p className="mt-1 font-mono text-sm text-peach-600">{item.code}</p>
                  <p className="text-clay-9000 mt-1 text-xs">
                    {item.orderNumber} · ได้รับ {item.deliveredAt.toLocaleDateString('th-TH')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.used && <span className="text-clay-9000 text-xs">ใช้แล้ว</span>}
                  {!item.used && (
                    <button
                      onClick={() => handleCopy(item.code, item.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-clay-200 px-3 py-1.5 text-xs text-clay-600 hover:bg-clay-100"
                    >
                      {copiedId === item.id ? (
                        <>
                          <CheckCircle size={12} className="text-jade-600" /> คัดลอกแล้ว
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> คัดลอก
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
