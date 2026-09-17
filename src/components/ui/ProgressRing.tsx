'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';

export interface ProgressRingProps {
  /** 0–100 — how full the ring is. */
  value: number;
  /** Ring size in px (width & height). */
  size?: number;
  /** SVG stroke width in px. */
  stroke?: number;
  /** Tailwind text color class for the ring stroke (e.g. 'text-peach-500'). */
  color?: string;
  /** Tailwind class for the center content wrapper. */
  labelClassName?: string;
  /** Center content; defaults to `${value}%`. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Claymorphism progress ring — soft clay track, peach fill that springs in
 * when the ring scrolls into view. The global reduced-motion rule in
 * globals.css zeroes the transition for users who prefer stillness.
 * The dash offset animates via CSS transition — no per-frame JS.
 */
export function ProgressRing({
  value,
  size = 84,
  stroke = 9,
  color = 'text-peach-500',
  labelClassName,
  children,
  className,
}: ProgressRingProps): React.JSX.Element {
  const clamped = Math.min(100, Math.max(0, value));
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const start = () => {
      if (hasAnimated.current) return;
      hasAnimated.current = true;
      setVisible(true);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          start();
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);

    // Fallback for webviews whose IntersectionObserver never fires.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      start();
    }
    return () => observer.disconnect();
  }, []);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = visible ? (clamped / 100) * circumference : 0;

  return (
    <div
      ref={ref}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${clamped}%`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        {/* Clay track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="text-clay-200"
          stroke="currentColor"
        />
        {/* Progress fill — springs via CSS transition on stroke-dashoffset */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={cn(
            color,
            'transition-[stroke-dashoffset] duration-1000 ease-spring motion-reduce:transition-none',
          )}
          style={{ strokeDasharray: `${dash} ${circumference}` }}
        />
      </svg>
      <span className={cn('absolute inset-0 flex items-center justify-center', labelClassName)}>
        {children ?? `${clamped}%`}
      </span>
    </div>
  );
}
