'use client';

import { Download } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatThb } from '@/lib/pricing';
import { QRCountdownTimer } from './QRCountdownTimer';

export interface PromptPayQRProps {
  qrDataUrl: string;
  amount: number;
  expiresAt: Date;
  onExpire: () => void;
  onSaveImage?: () => void;
  className?: string;
}

/**
 * 05-components.md §5.5 — PromptPay QR display.
 * QR image with countdown timer, amount, and instructions.
 */
export function PromptPayQR({
  qrDataUrl,
  amount,
  expiresAt,
  onExpire,
  onSaveImage,
  className,
}: PromptPayQRProps): React.JSX.Element {
  return (
    <div className={cn('rounded-md border border-amber-700/30 bg-ink-850 p-6', className)}>
      <h3 className="mb-4 text-center text-lg font-semibold text-ink-100">
        ชำระผ่าน PromptPay
      </h3>

      {/* QR Code */}
      <div className="mx-auto mb-4 flex w-fit flex-col items-center gap-4">
        <div className="rounded-lg bg-white p-4 shadow-code-glow">
          <img
            src={qrDataUrl}
            alt={`PromptPay QR Code สำหรับคำสั่งซื้อ ${formatThb(amount)}`}
            width={220}
            height={220}
            className="h-[220px] w-[220px]"
          />
        </div>

        {/* Amount */}
        <p className="text-lg font-bold text-amber-300">
          จำนวนเงิน: {formatThb(amount)}
        </p>

        {/* Timer */}
        <QRCountdownTimer expiresAt={expiresAt} onExpire={onExpire} />
      </div>

      {/* Save QR button */}
      {onSaveImage && (
        <button
          onClick={onSaveImage}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm font-medium text-ink-200 hover:border-ink-400 hover:text-ink-100"
        >
          <Download size={16} />
          บันทึก QR
        </button>
      )}

      {/* Instructions */}
      <div className="rounded-md border border-ink-700 bg-ink-800 p-4">
        <p className="mb-2 text-xs font-semibold text-ink-300">วิธีการชำระ:</p>
        <ol className="space-y-1 text-xs text-ink-400">
          <li>1. เปิดแอปธนาคาร → สแกน QR</li>
          <li>2. ตรวจสอบจำนวนเงิน → ยืนยัน</li>
          <li>3. รอรับโค้ดภายใน 60 วินาที</li>
        </ol>
      </div>
    </div>
  );
}
