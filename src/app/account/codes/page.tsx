/**
 * Purchased Codes Page — 12-dashboard.md §7.
 * Flat, searchable, cross-order list of every delivered code — real data
 * from /api/v1/account/codes (decrypted server-side per row).
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Copy, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CodeRow {
  id: string;
  code: string;
  product: string;
  denomination: number;
  orderNumber: string;
  deliveredAt: string | null;
  used: boolean;
}

export default function AccountCodesPage(): React.JSX.Element {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/account/codes', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { codes: CodeRow[] };
      setCodes(data.codes);
    } catch {
      setError('โหลดโค้ดไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCodes = useMemo(
    () =>
      search.trim()
        ? codes.filter(
            (c) =>
              c.code.toLowerCase().includes(search.trim().toLowerCase()) ||
              c.product.toLowerCase().includes(search.trim().toLowerCase()),
          )
        : codes,
    [codes, search],
  );

  const handleCopy = async (code: string, id: string): Promise<void> => {
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
          className="w-full rounded-md border border-line-subtle bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus:border-line-brand"
        />
      </div>

      {error && (
        <p className="bg-error rounded-lg px-3 py-2 text-sm text-fg-error dark:bg-coral-900/20 dark:text-coral-300">
          {error}
        </p>
      )}

      {/* Codes List */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-line-subtle bg-surface p-8 text-sm text-fg-placeholder">
          <Loader2 size={16} className="animate-spin" /> กำลังโหลด…
        </div>
      ) : filteredCodes.length === 0 ? (
        <div className="rounded-md border border-line-subtle bg-surface p-8 text-center">
          <p className="text-fg-placeholder">
            {codes.length === 0
              ? 'ยังไม่มีโค้ด — โค้ดจะแสดงที่นี่เมื่อคำสั่งซื้อสำเร็จและส่งมอบแล้ว'
              : 'ไม่พบโค้ดที่ค้นหา'}
          </p>
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
                  <p className="text-sm font-medium text-fg-secondary">
                    {item.product} · ฿{item.denomination.toLocaleString('th-TH')}
                  </p>
                  {item.code.includes('\n') ? (
                    <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-surface-elevated p-2.5 font-mono text-xs leading-relaxed text-fg-secondary">
                      {item.code}
                    </pre>
                  ) : (
                    <p className="mt-1 font-mono text-sm text-fg-brand">{item.code}</p>
                  )}
                  <p className="mt-1 text-xs text-fg-muted">
                    {item.orderNumber} · ได้รับ{' '}
                    {item.deliveredAt
                      ? new Date(item.deliveredAt).toLocaleDateString('th-TH')
                      : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {item.used && <span className="text-xs text-fg-muted">ใช้แล้ว</span>}
                  {!item.used && (
                    <button
                      type="button"
                      onClick={() => void handleCopy(item.code, item.id)}
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
