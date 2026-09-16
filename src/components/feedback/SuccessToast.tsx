'use client';

import { Check } from 'lucide-react';
import { MascotImage } from '@/components/ui/MascotImage';

/**
 * Compact clay success toast with the Nong-Kati hamster mascot — used for
 * cart adds. Mascot seed-pops in alongside the jade check; auto-dismisses
 * via the toast store.
 */
export function SuccessToast({
  title,
  message,
}: {
  title: string;
  message?: string | undefined;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      {/* The real mascot face, seed-popping in */}
      <span
        className="inline-flex shrink-0 animate-seed-pop"
        style={{ animationDuration: '400ms' }}
      >
        <MascotImage size={40} />
      </span>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-jade-500 shadow-clay-xs">
        <Check size={14} strokeWidth={3} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{title}</p>
        {message && <p className="truncate text-xs text-fg-muted">{message}</p>}
      </div>
    </div>
  );
}
