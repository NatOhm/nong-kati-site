'use client';

/**
 * Delivered-codes receipt, shown the moment a wallet payment commits
 * (client ask 2026-11-05: "ตัดเครดิตมันเด้งมาให้ก้อปเลยก็สะดวก").
 *
 * Before this, paying with credit redirected to the confirmation page and the
 * codes were there — but one navigation away, which on a phone means scrolling
 * and hunting. This puts the thing they bought in front of them with a copy
 * button, and keeps the "ไปที่คำสั่งซื้อ" link for everything else (receipt,
 * resend, order details).
 *
 * Plain <pre> text, not a code block: these can be multi-line account blocks and
 * a customer copying an account wants the exact bytes, label lines included.
 */

import { useEffect, useId, useRef } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

import { CopyButton } from './CopyButton';

export interface DeliveredCode {
  code: string;
  productName: string;
  denomination: number;
}

export interface DeliveredCodesDialogProps {
  orderNumber: string;
  orderUrl: string;
  codes: DeliveredCode[];
  onClose: () => void;
}

export function DeliveredCodesDialog({
  orderNumber,
  orderUrl,
  codes,
  onClose,
}: DeliveredCodesDialogProps): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  // R6: no literal DOM ids — twin mounts must not duplicate one.
  const titleId = `${useId()}-delivered-codes-title`;

  // Escape closes; focus starts on the close button so a keyboard user is not
  // dumped at the top of the page behind the overlay.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allCodes = codes.map((c) => c.code).join('\n');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={(e) => {
        // Backdrop tap closes; taps inside the panel must not.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line-subtle bg-surface-base p-5 shadow-clay"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-base font-bold text-fg">
              ชำระด้วยเครดิตสำเร็จ — โค้ดพร้อมใช้
            </h2>
            <p className="mt-0.5 text-xs text-fg-muted">
              {orderNumber} · ส่งสำเนาเข้าอีเมลของคุณแล้ว
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="shrink-0 rounded-md p-1 text-fg-placeholder hover:text-fg"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {codes.map((item, idx) => (
            <div
              key={`${item.code}-${idx}`}
              className="rounded-lg border border-line-brand bg-surface-brand-subtle p-3"
            >
              <p className="text-xs font-medium text-fg-secondary">
                {item.productName}
                {item.denomination > 0 ? ` · ฿${item.denomination.toLocaleString('th-TH')}` : ''}
              </p>
              <pre className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-surface p-2.5 font-mono text-xs leading-relaxed text-fg">
                {item.code}
              </pre>
              <div className="mt-2 flex justify-end">
                <CopyButton text={item.code} size="sm" />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {codes.length > 1 ? (
            <CopyButton text={allCodes} size="md" label="คัดลอกทั้งหมด" />
          ) : (
            <span />
          )}
          <Link
            href={orderUrl}
            className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-fg-secondary hover:bg-surface"
          >
            ไปที่คำสั่งซื้อ
          </Link>
        </div>
      </div>
    </div>
  );
}
