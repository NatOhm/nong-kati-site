/**
 * Purchased Codes Page — 12-dashboard.md §7.
 * Flat, searchable, cross-order list of every delivered code.
 */

'use client';

import { useState } from 'react';
import { Search, Copy, CheckCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

const MOCK_CODES = [
  { id: 'code-001', code: 'STEAM-XXXX-YYYY-ZZZZ', product: 'Steam Wallet ฿100', orderNumber: 'NK-2026-000001', deliveredAt: new Date('2026-08-20T14:00:21Z'), used: false },
  { id: 'code-002', code: 'STEAM-ABCD-EFGH-IJKL', product: 'Steam Wallet ฿100', orderNumber: 'NK-2026-000001', deliveredAt: new Date('2026-08-20T14:00:21Z'), used: false },
  { id: 'code-003', code: 'NETFLIX-MNOP-QRST-UVWX', product: 'Netflix ฿350', orderNumber: 'NK-2026-000002', deliveredAt: new Date('2026-08-15T10:30:18Z'), used: true },
];

export default function AccountCodesPage(): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredCodes = MOCK_CODES.filter(
    (c) =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.product.toLowerCase().includes(search.toLowerCase())
  );

  const handleCopy = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink-100">โค้ดที่ซื้อ</h1>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาโค้ด หรือชื่อสินค้า..."
          className="w-full rounded-md border border-ink-700 bg-ink-850 py-2 pl-9 pr-3 text-sm text-ink-100 placeholder:text-ink-500 focus:border-amber-700 focus:outline-none"
        />
      </div>

      {/* Codes List */}
      {filteredCodes.length === 0 ? (
        <div className="rounded-md border border-ink-700 bg-ink-850 p-8 text-center">
          <p className="text-ink-400">ไม่พบโค้ด</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCodes.map((item) => (
            <div
              key={item.id}
              className={cn(
                'rounded-md border p-4',
                item.used ? 'border-ink-700 bg-ink-850 opacity-60' : 'border-amber-700/30 bg-amber-900/5'
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink-200">{item.product}</p>
                  <p className="mt-1 font-mono text-sm text-amber-300">{item.code}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {item.orderNumber} · ได้รับ {item.deliveredAt.toLocaleDateString('th-TH')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.used && (
                    <span className="text-xs text-ink-500">ใช้แล้ว</span>
                  )}
                  {!item.used && (
                    <button
                      onClick={() => handleCopy(item.code, item.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-ink-700 px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-800"
                    >
                      {copiedId === item.id ? (
                        <><CheckCircle size={12} className="text-jade-400" /> คัดลอกแล้ว</>
                      ) : (
                        <><Copy size={12} /> คัดลอก</>
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
