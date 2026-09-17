'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HamsterMascot } from '@/components/ui/ClayIcons';
import { cn } from '@/utils/cn';

/**
 * Cute clay hamster grass-field band — sits under the main content as a
 * cartoonish ground line. Adapts to dark mode via semantic tokens and
 * respects reduced motion through the global rule.
 *
 * Easter egg: click the grass hamster and it pops up with a squeak,
 * scattering clay seeds that arc into the grass.
 */

interface ScatterSeed {
  id: number;
  x: number; // px offset from hamster center
  rot: number;
  delay: number;
}

/** Tiny WebAudio squeak — two quick rising chirps. No audio files needed. */
function playSqueak(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    for (const [start, base] of [
      [0, 900],
      [0.12, 1200],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(base, now + start);
      osc.frequency.exponentialRampToValueAtTime(base * 1.6, now + start + 0.08);
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.06, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + 0.12);
    }
    setTimeout(() => void ctx.close().catch(() => {}), 400);
  } catch {
    /* audio unavailable — the visual squeak still plays */
  }
}

const HAMSTER_POP_KEYFRAMES = `@keyframes hamster-pop {
  0% { transform: translateY(0) scale(1); }
  30% { transform: translateY(-16px) scale(1.15); }
  50% { transform: translateY(-6px) scale(0.95); }
  70% { transform: translateY(-10px) scale(1.05); }
  100% { transform: translateY(0) scale(1); }
}
@keyframes seed-scatter {
  0% { opacity: 0; transform: translate(0, 0) scale(0.4) rotate(0deg); }
  25% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--sx), var(--sy)) scale(1) rotate(var(--sr)); }
}`;

export function HamsterGrassScene({ className }: { className?: string }): React.JSX.Element {
  const [seeds, setSeeds] = useState<ScatterSeed[]>([]);
  const [squeaking, setSqueaking] = useState(false);
  const seedId = useRef(0);
  const coolDown = useRef(false);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = HAMSTER_POP_KEYFRAMES;
    document.head.appendChild(style);
    return () => void style.remove();
  }, []);

  const handleHamsterClick = useCallback(() => {
    if (coolDown.current) return;
    coolDown.current = true;
    setTimeout(() => (coolDown.current = false), 900);

    // Visual squeak: hamster pops up
    setSqueaking(true);
    setTimeout(() => setSqueaking(false), 900);
    playSqueak();

    // Scatter 7 seeds in a fan
    const batch: ScatterSeed[] = Array.from({ length: 7 }, (_, i) => ({
      id: seedId.current++,
      x: (i - 3) * 26 + (Math.random() * 10 - 5),
      rot: Math.random() * 260 - 130,
      delay: i * 40,
    }));
    setSeeds((s) => [...s, ...batch]);
    setTimeout(() => {
      setSeeds((s) => s.filter((seed) => !batch.includes(seed)));
    }, 1400);
  }, []);

  return (
    <div className={cn('absolute inset-x-0 bottom-0 z-0', className)} aria-hidden="true">
      {/* Rolling clay hills */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-28">
        {/* back hill */}
        <div className="absolute bottom-6 left-[8%] h-24 w-72 rounded-[100%] bg-jade-200/50 dark:bg-jade-900/40" />
        <div className="absolute bottom-4 right-[6%] h-28 w-96 rounded-[100%] bg-jade-200/40 dark:bg-jade-900/30" />
        {/* front grass */}
        <div className="absolute bottom-0 left-0 right-0 h-14 rounded-t-[100%] bg-jade-500/25 dark:bg-jade-900/50" />
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-jade-500/35 dark:bg-jade-900/60" />
      </div>

      {/* Swaying grass blades */}
      <svg
        viewBox="0 0 120 40"
        className="pointer-events-none absolute bottom-4 left-[12%] h-8 w-24 origin-bottom animate-grass-sway"
        fill="none"
      >
        <path
          d="M10 40 Q8 20 16 8"
          stroke="#16A257"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M30 40 Q30 16 24 4"
          stroke="#16A257"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path
          d="M52 40 Q56 22 50 10"
          stroke="#16A257"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
      <svg
        viewBox="0 0 120 40"
        className="pointer-events-none absolute bottom-6 right-[14%] h-8 w-24 origin-bottom animate-grass-sway"
        style={{ animationDelay: '1.2s' }}
        fill="none"
      >
        <path
          d="M20 40 Q16 18 26 6"
          stroke="#16A257"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path
          d="M44 40 Q46 20 40 8"
          stroke="#16A257"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.4"
        />
      </svg>

      {/* Scattered seeds (rendered behind the hamster) */}
      {seeds.map((seed) => (
        <span
          key={seed.id}
          className="pointer-events-none absolute h-2.5 w-2 rounded-[40%] bg-fawn-500 shadow-sm"
          style={{
            bottom: 10,
            right: 'calc(9% + 8px)',
            ['--sx' as string]: `${seed.x}px`,
            ['--sy' as string]: `${-30 - Math.random() * 34}px`,
            ['--sr' as string]: `${seed.rot}deg`,
            animation: `seed-scatter 900ms cubic-bezier(0, 0, 0.2, 1) ${seed.delay}ms both`,
            transform: `rotate(${seed.rot}deg)`,
          }}
        />
      ))}

      {/* The Nong-Kati mascot hiding in the grass — click me! */}
      <button
        type="button"
        onClick={handleHamsterClick}
        aria-label="สัตว์เลี้ยงตัวน้อย: ลองกดจิ๊กเกอร์ดูสิ!"
        title="กดดูสิ!"
        className="absolute bottom-1 right-[8%] cursor-pointer border-0 bg-transparent p-0"
      >
        <span
          className={cn(
            'block transition-transform duration-fast',
            squeaking ? 'scale-110' : 'animate-hamster-peek hover:scale-105',
          )}
          style={
            squeaking
              ? { animation: 'hamster-pop 900ms cubic-bezier(0.34, 1.56, 0.64, 1)' }
              : undefined
          }
        >
          <HamsterMascot
            size={64}
            className={cn(
              'drop-shadow-[0_4px_6px_rgba(147,107,73,0.3)] transition-all duration-500',
              squeaking ? 'rotate-0 saturate-100' : 'rotate-3 saturate-[0.55]',
            )}
          />
        </span>
      </button>

      {/* Tiny seed sprinkles */}
      <div className="pointer-events-none absolute bottom-3 left-[26%] h-2 w-1.5 rotate-45 rounded-full bg-clay-500/50" />
      <div className="pointer-events-none absolute bottom-6 left-[58%] h-2 w-1.5 -rotate-12 rounded-full bg-clay-500/40" />
      <div className="pointer-events-none absolute bottom-2 right-[30%] h-2 w-1.5 rotate-12 rounded-full bg-clay-500/50" />
    </div>
  );
}
