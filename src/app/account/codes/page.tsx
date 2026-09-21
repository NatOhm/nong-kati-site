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
      <h1 className="text-2xl font-bold text-fg">โค้ดที่ซื้อ</h1>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-placeholder"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาโค้ด หรือชื่อสินค้า..."
          className="w-full rounded-md border border-line-subtle bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand focus:outline-none"
        />
      </div>

      {/* Codes List */}
      {filteredCodes.length === 0 ? (
        <div className="rounded-md border border-line-subtle bg-surface p-8 text-center">
          <p className="text-fg-placeholder">ไม่พบโค้ด</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCodes.map((item) => (
            <div
              key={item.id}
              className={cn(
                'rounded-md border p-4',
                item.used
                  ? 'border-line-subtle bg-surface opacity-60'
                  : 'border-line-brand bg-surface-brand-subtle',
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-fg-secondary">{item.product}</p>
                  <p className="mt-1 font-mono text-sm text-fg-brand">{item.code}</p>
                  <p className="mt-1 text-xs text-fg-muted">
                    {item.orderNumber} · ได้รับ {item.deliveredAt.toLocaleDateString('th-TH')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.used && <span className="text-xs text-fg-muted">ใช้แล้ว</span>}
                  {!item.used && (
                    <button
                      onClick={() => handleCopy(item.code, item.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-3 py-1.5 text-xs text-fg-muted hover:bg-surface"
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
