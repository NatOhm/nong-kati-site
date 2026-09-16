'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, MailCheck } from 'lucide-react';

/**
 * Hero right-hand visual: a mock "delivered code" email card (clay style).
 * The one orchestrated moment: the code types itself in on load
 * (skipped under prefers-reduced-motion). Click-to-copy is the
 * single interaction; the card floats gently.
 */

const DEMO_CODE = 'NKTX-7H2K-9QW4-PLM8';

export function DeliveredCodeCard(): React.JSX.Element {
  const [typedCount, setTypedCount] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setTypedCount(DEMO_CODE.length);
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setTypedCount(i);
      if (i >= DEMO_CODE.length) clearInterval(timer);
    }, 70);
    return () => clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(DEMO_CODE);
      setCopyState('copied');
    } catch {
      // Clipboard unavailable (permission denied / document unfocused) — say so
      setCopyState('failed');
    }
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => setCopyState('idle'), 2000);
  }, []);

  return (
    <div className="clay-card relative mx-auto w-full max-w-sm rotate-2 animate-float rounded-2xl p-5">
      {/* Email header */}
      <div className="flex items-center gap-2 border-b border-line-subtle pb-3">
        <MailCheck size={16} className="text-jade-700" aria-hidden="true" />
        <span className="text-xs text-fg-muted">รหัสสินค้าของคุณถูกส่งแล้ว</span>
      </div>

      {/* The code itself */}
      <button
        onClick={handleCopy}
        aria-label={`คัดลอกรหัส ${DEMO_CODE}`}
        className="mt-4 flex w-full items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 text-left shadow-clay-press transition-all duration-interactive ease-ease-out hover:-translate-y-0.5 hover:bg-surface-sunken hover:shadow-clay-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-peach-500 active:translate-y-0 active:scale-[0.98] active:shadow-clay-press"
      >
        <span className="text-fg-code font-mono text-sm tracking-wider md:text-base">
          {DEMO_CODE.slice(0, typedCount)}
          {typedCount < DEMO_CODE.length && (
            <span className="animate-pulse text-fg-placeholder">▍</span>
          )}
        </span>
        {copyState === 'copied' ? (
          <Check size={16} className="shrink-0 text-jade-700" aria-hidden="true" />
        ) : (
          <Copy size={16} className="shrink-0 text-fg-placeholder" aria-hidden="true" />
        )}
      </button>
      <p aria-live="polite" className="mt-2 min-h-4 text-xs">
        {copyState === 'copied' && <span className="text-jade-700">คัดลอกแล้ว</span>}
        {copyState === 'failed' && (
          <span className="text-coral-600">
            คัดลอกไม่สำเร็จ — เลือกข้อความรหัสด้านบนแล้วคัดลอกเอง
          </span>
        )}
      </p>

      {/* Meta rows */}
      <div className="mt-1 space-y-1.5 text-xs text-fg-placeholder">
        <div className="flex justify-between">
          <span>HBO Max 7 4K — 1 เดือน</span>
          <span>฿25.00</span>
        </div>
        <div className="flex justify-between">
          <span>สถานะ</span>
          <span className="text-jade-700">ส่งสำเร็จ</span>
        </div>
      </div>
    </div>
  );
}
