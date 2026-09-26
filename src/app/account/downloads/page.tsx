/**
 * Downloads Page — 12-dashboard.md §8.
 * Receipts for the signed-in customer's paid orders, from
 * /api/v1/account/documents — download renders the real document.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

import { formatThb } from '@/lib/pricing';

interface DocRow {
  id: string;
  type: 'receipt' | 'tax_invoice';
  documentNumber: string;
  orderNumber: string;
  amountThb: number;
  date: string;
  orderId: string;
}

export default function AccountDownloadsPage(): React.JSX.Element {
  const [receipts, setReceipts] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/account/documents', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { documents: DocRow[] };
      setReceipts(data.documents.filter((d) => d.type === 'receipt'));
    } catch {
      setError('โหลดใบเสร็จไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const download = async (doc: DocRow): Promise<void> => {
    setDownloadingId(doc.id);
    try {
      const res = await fetch('/api/v1/account/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: doc.orderId, type: doc.type }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.documentNumber}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-fg">ใบเสร็จรับเงิน</h1>

      {error && (
        <p className="bg-error rounded-lg px-3 py-2 text-sm text-fg-error dark:bg-coral-900/20 dark:text-coral-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-line-subtle bg-surface p-8 text-sm text-fg-placeholder">
          <Loader2 size={16} className="animate-spin" /> กำลังโหลด…
        </div>
      ) : receipts.length === 0 ? (
        <div className="rounded-md border border-line-subtle bg-surface p-8 text-center">
          <p className="text-fg-placeholder">
            ยังไม่มีใบเสร็จ — ใบเสร็จจะแสดงที่นี่เมื่อมีคำสั่งซื้อที่ชำระเงินแล้ว
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {receipts.map((receipt) => (
            <div
              key={receipt.id}
              className="flex items-center justify-between rounded-md border border-line-subtle bg-surface p-4"
            >
              <div>
                <p className="text-sm font-medium text-fg-secondary">{receipt.orderNumber}</p>
                <p className="text-xs text-fg-muted">
                  {receipt.documentNumber} · {new Date(receipt.date).toLocaleDateString('th-TH')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm text-fg-secondary">{formatThb(receipt.amountThb)}</p>
                <button
                  type="button"
                  onClick={() => void download(receipt)}
                  disabled={downloadingId === receipt.id}
                  className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-3 py-1.5 text-xs text-fg-muted hover:bg-surface disabled:opacity-50"
                >
                  {downloadingId === receipt.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Download size={12} />
                  )}
                  ดาวน์โหลด
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
