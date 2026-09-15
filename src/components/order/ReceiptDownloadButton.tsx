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
        'inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:border-line-brand hover:text-fg',
        className,
      )}
    >
      <Download size={16} strokeWidth={1.5} />
      {label}
    </a>
  );
}
