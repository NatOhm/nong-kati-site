'use client';

import { useEffect, useState } from 'react';
import { PersonStanding, Sparkles, Zap } from 'lucide-react';

import { cn } from '@/utils/cn';
import {
  applyMotionAttribute,
  notifyMotionChanged,
  prefersReducedMotion,
  readStoredMotionChoice,
  setMotionChoice,
  subscribeMotion,
  type MotionChoice,
} from '@/lib/motionPreference';

/**
 * Site-level motion toggle (client ask: play animations even when Windows
 * "animation effects" is off). Three states, cycled on click:
 *   system (default) → follow prefers-reduced-motion, no attribute
 *   on  → animate always, overriding the OS   (html data-motion="on")
 *   off → suppress always, even if OS animates (html data-motion="off")
 * Persisted in localStorage 'nk-motion'; applied pre-paint in app/layout.tsx.
 */
export function MotionToggle(): React.JSX.Element {
  const [choice, setChoice] = useState<MotionChoice | null>(null);

  useEffect(() => {
    setChoice(readStoredMotionChoice());
    // Another tab changed it — follow along.
    return subscribeMotion(() => setChoice(readStoredMotionChoice()));
  }, []);
  const cycle = () => {
    // Read the attribute, not React state — rapid clicks arrive before the
    // re-render, and the html attribute is the actual source of truth.
    const current = document.documentElement.getAttribute('data-motion');
    const next: MotionChoice | null = current === 'on' ? 'off' : current === 'off' ? null : 'on';
    setChoice(next);
    setMotionChoice(next);
    notifyMotionChanged();
  };

  const label =
    choice === 'on'
      ? 'เปิดอนิเมชัน (ทับการตั้งค่าเครื่อง)'
      : choice === 'off'
        ? 'ปิดอนิเมชัน'
        : 'อนิเมชันตามระบบ';

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      aria-pressed={choice === 'on'}
      className="clay-btn flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated text-fg-secondary shadow-clay-xs transition-all duration-interactive ease-ease-out hover:-translate-y-0.5 hover:text-fg-brand hover:shadow-clay active:translate-y-0 active:scale-95 active:shadow-clay-press"
    >
      <span
        key={choice ?? 'system'}
        className="inline-flex animate-seed-pop"
        style={{ animationDuration: '350ms' }}
      >
        {choice === 'on' ? (
          <Zap size={19} strokeWidth={1.75} className="text-topaz-400" />
        ) : choice === 'off' ? (
          <PersonStanding size={19} strokeWidth={1.75} />
        ) : (
          <Sparkles size={19} strokeWidth={1.75} />
        )}
      </span>
    </button>
  );
}

/** Convenience for effects: subscribe + initial read in one call. */
export function useMotionReduced(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(prefersReducedMotion());
    const apply = () => setReduced(prefersReducedMotion());
    const unsub = subscribeMotion(apply);
    apply();
    return unsub;
  }, []);
  return reduced;
}

// applyMotionAttribute is re-exported for tests/tools; the component uses
// setMotionChoice which wraps it.
export { applyMotionAttribute };
