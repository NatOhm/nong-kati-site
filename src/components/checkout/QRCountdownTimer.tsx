'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/utils/cn';

export interface QRCountdownTimerProps {
  expiresAt: Date;
  onExpire: () => void;
  className?: string;
}

/**
 * 05-components.md §5.6 — QR Countdown Timer.
 * SVG circle stroke animation + MM:SS display.
 * Ring colour: amber → crimson in last 2 minutes.
 */
export function QRCountdownTimer({
  expiresAt,
  onExpire,
  className,
}: QRCountdownTimerProps): React.JSX.Element {
  const [remaining, setRemaining] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const totalSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    setRemaining(totalSeconds);

    if (totalSeconds <= 0) {
      setIsExpired(true);
      onExpire();
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const secs = Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000));
      setRemaining(secs);

      if (secs <= 0) {
        clearInterval(interval);
        setIsExpired(true);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // SVG circle params
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const totalSeconds = 15 * 60; // 15 minutes
  const progress = remaining / totalSeconds;
  const dashOffset = circumference * (1 - progress);
  const isWarning = remaining <= 120; // Last 2 minutes

  return (
    <div
      className={cn('flex items-center gap-3', className)}
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`เหลือเวลา ${minutes} นาที ${seconds} วินาที`}
    >
      {/* SVG Ring */}
      <svg width="64" height="64" viewBox="0 0 64 64">
        {/* Background ring */}
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-ink-700"
        />
        {/* Progress ring */}
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={cn(
            'transition-colors duration-300',
            isWarning ? 'text-crimson-400' : 'text-amber-400',
          )}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '32px 32px',
          }}
        />
      </svg>

      {/* Time display */}
      <span
        className={cn(
          'font-mono text-xl font-medium',
          isExpired ? 'text-crimson-400' : isWarning ? 'text-crimson-300' : 'text-ink-100',
        )}
      >
        {isExpired ? 'หมดเวลา' : timeStr}
      </span>
    </div>
  );
}
