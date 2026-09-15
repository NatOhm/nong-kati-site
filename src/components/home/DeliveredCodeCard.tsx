'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, MailCheck } from 'lucide-react';

/**
 * Hero right-hand visual: a mock "delivered code" email card.
 * The one orchestrated moment: the code types itself in on load
 * (skipped under prefers-reduced-motion). Click-to-copy is the
 * single interaction; everything else stays still.
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
    <div className="relative mx-auto w-full max-w-sm rotate-2 rounded-lg border border-ink-700 bg-ink-900 p-5 shadow-2xl">
      {/* Email header */}
      <div className="flex items-center gap-2 border-b border-ink-800 pb-3">
        <MailCheck size={16} className="text-jade-400" aria-hidden="true" />
        <span className="text-xs text-ink-400">รหัสสินค้าของคุณถูกส่งแล้ว</span>
      </div>

      {/* The code itself */}
      <button
        onClick={handleCopy}
        aria-label={`คัดลอกรหัส ${DEMO_CODE}`}
        className="mt-4 flex w-full items-center justify-between gap-3 rounded-md border border-ink-700 bg-ink-950 px-4 py-3 text-left transition-colors hover:border-amber-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <span className="font-mono text-sm tracking-wider text-amber-300 md:text-base">
          {DEMO_CODE.slice(0, typedCount)}
          {typedCount < DEMO_CODE.length && <span className="text-ink-500 animate-pulse">▍</span>}
        </span>
        {copyState === 'copied' ? (
          <Check size={16} className="shrink-0 text-jade-400" aria-hidden="true" />
        ) : (
          <Copy size={16} className="text-ink-500 shrink-0" aria-hidden="true" />
        )}
      </button>
      <p aria-live="polite" className="mt-2 min-h-4 text-xs">
        {copyState === 'copied' && <span className="text-jade-400">คัดลอกแล้ว</span>}
        {copyState === 'failed' && (
          <span className="text-crimson-300">
            คัดลอกไม่สำเร็จ — เลือกข้อความรหัสด้านบนแล้วคัดลอกเอง
          </span>
        )}
      </p>

      {/* Meta rows */}
      <div className="text-ink-500 mt-1 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span>HBO Max 7 4K — 1 เดือน</span>
          <span>฿25.00</span>
        </div>
        <div className="flex justify-between">
          <span>สถานะ</span>
          <span className="text-jade-400">ส่งสำเร็จ</span>
        </div>
      </div>
    </div>
  );
}
