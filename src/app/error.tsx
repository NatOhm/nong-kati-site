'use client';

import { useEffect } from 'react';
import { HamsterSleeping } from '@/components/ui/ClayIcons';

/**
 * Global error boundary — same sleepy mascot as the 404, with a retry.
 * Logs to the console so Vercel runtime errors surface in deployment logs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error('[AppErrorBoundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="relative mb-6">
        <HamsterSleeping size={150} className="drop-shadow-[0_8px_14px_rgba(147,107,73,0.3)]" />
        <div
          aria-hidden="true"
          className="zzz absolute -right-2 -top-2 font-display text-lg font-bold text-fg-placeholder"
        >
          <span className="absolute">Z</span>
          <span className="absolute">z</span>
          <span className="absolute">z</span>
        </div>
      </div>
      <h1 className="font-display text-3xl font-bold text-fg-brand-strong">เกิดข้อผิดพลาด</h1>
      <p className="mt-3 max-w-sm text-base text-fg-muted">
        บางอย่างผิดพลาดชั่วคราว — น้องแฮมสเตอร์กำลังพยายามอีกครั้ง
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex items-center justify-center rounded-full bg-peach-500 px-6 py-2.5 text-sm font-semibold text-white shadow-clay-brand transition-all hover:scale-[1.03] hover:bg-peach-400 hover:shadow-clay-lg active:scale-[0.96] active:shadow-clay-press"
      >
        ลองอีกครั้ง
      </button>
    </div>
  );
}
