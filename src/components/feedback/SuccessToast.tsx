'use client';

import { Check } from 'lucide-react';

/**
 * Compact clay success toast with the hamster mascot — used for cart adds.
 * Hamster seed-pops in, cheeks and all; auto-dismisses via the toast store.
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
      {/* Mini clay hamster */}
      <span
        className="inline-flex shrink-0 animate-seed-pop"
        style={{ animationDuration: '400ms' }}
      >
        <svg viewBox="0 0 40 36" width="40" height="36" fill="none" aria-hidden="true">
          <circle cx="12" cy="7" r="5" fill="#FDBA74" />
          <circle cx="28" cy="7" r="5" fill="#FDBA74" />
          <circle cx="12" cy="7" r="2.5" fill="#FFEDD5" />
          <circle cx="28" cy="7" r="2.5" fill="#FFEDD5" />
          <ellipse cx="20" cy="21" rx="15" ry="13" fill="#FDBA74" />
          <ellipse cx="20" cy="26" rx="8" ry="6.5" fill="#FFF7ED" />
          <circle cx="20" cy="24" r="4.5" fill="#FED7AA" />
          <path
            d="M13.5 17 q2.4 2 4.8 0"
            stroke="#4E3820"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M21.7 17 q2.4 2 4.8 0"
            stroke="#4E3820"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <ellipse cx="20" cy="21.5" rx="1.8" ry="1.3" fill="#FB7185" />
          <ellipse cx="8" cy="24" rx="2.6" ry="1.6" fill="#FECDD3" opacity="0.8" />
          <ellipse cx="32" cy="24" rx="2.6" ry="1.6" fill="#FECDD3" opacity="0.8" />
        </svg>
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
