'use client';

import { Download } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface ReceiptDownloadButtonProps {
  orderId: string;
  type: 'receipt' | 'tax_invoice';
  url: string;
  className?: string;
}

/**
 * 05-components.md §6.7 — Receipt Download Button.
 * Opens PDF in new tab. Label varies by type.
 */
export function ReceiptDownloadButton({
  orderId,
  type,
  url,
  className,
}: ReceiptDownloadButtonProps): React.JSX.Element {
  const label = type === 'receipt' ? 'ดาวน์โหลดใบเสร็จ' : 'ดาวน์โหลดใบกำกับภาษี';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-2 rounded-md border border-clay-300 bg-clay-100 px-4 py-2 text-sm font-medium text-clay-700 transition-colors hover:border-peach-300 hover:text-clay-900',
        className,
      )}
    >
      <Download size={16} strokeWidth={1.5} />
      {label}
    </a>
  );
}
