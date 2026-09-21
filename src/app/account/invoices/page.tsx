/**
 * Invoices Page — 12-dashboard.md §9.
 * Tax invoices for the signed-in customer's paid orders that requested one
 * at checkout (requiresTaxInvoice), from /api/v1/account/documents.
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

export default function AccountInvoicesPage(): React.JSX.Element {
  const [invoices, setInvoices] = useState<DocRow[]>([]);
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
      setInvoices(data.documents.filter((d) => d.type === 'tax_invoice'));
    } catch {
      setError('โหลดใบกำกับภาษีไม่สำเร็จ กรุณาลองใหม่');
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
      <h1 className="text-2xl font-bold text-fg">ใบกำกับภาษี</h1>

      {error && (
        <p className="rounded-lg bg-coral-50 px-3 py-2 text-sm text-coral-700 dark:bg-coral-900/20 dark:text-coral-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-line-subtle bg-surface p-8 text-sm text-fg-placeholder">
          <Loader2 size={16} className="animate-spin" /> กำลังโหลด…
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-md border border-line-subtle bg-surface p-8 text-center">
          <p className="text-fg-placeholder">
            ยังไม่มีใบกำกับภาษี — ใบกำกับจะแสดงที่นี่เมื่อสั่งซื้อโดยขอใบกำกับภาษีไว้ตอนชำระเงิน
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between rounded-md border border-line-subtle bg-surface p-4"
            >
              <div>
                <p className="text-sm font-medium text-fg-secondary">{inv.documentNumber}</p>
                <p className="text-xs text-fg-muted">
                  {inv.orderNumber} · {new Date(inv.date).toLocaleDateString('th-TH')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm text-fg-secondary">{formatThb(inv.amountThb)}</p>
                <button
                  type="button"
                  onClick={() => void download(inv)}
                  disabled={downloadingId === inv.id}
                  className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-3 py-1.5 text-xs text-fg-muted hover:bg-surface disabled:opacity-50"
                >
                  {downloadingId === inv.id ? (
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
