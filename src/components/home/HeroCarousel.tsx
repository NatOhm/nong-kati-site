'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/utils/cn';
import { useMotionReduced } from '@/components/layout/MotionToggle';
import type { HeroSlideContent } from '@/lib/data';

/**
 * Homepage hero carousel (clay style, modeled on the GAME ON reference:
 * wide promo banners, side arrows, elongated active dot). Autoplays every
 * 5s unless the user is interacting or prefers reduced motion; slides
 * translate with the site's 550ms ease-out-quart motion token. Fully
 * keyboard navigable; swipe works on touch screens.
 */

const AUTOPLAY_MS = 5000;

export function HeroCarousel({ slides }: { slides: HeroSlideContent[] }): React.JSX.Element {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  // Reactive: site-level override (navbar toggle) + OS, so flipping the
  // toggle live actually starts/stops the autoplay timer and transitions.
  const reducedMotion = useMotionReduced();
  const touchStartX = useRef<number | null>(null);

  const count = slides.length;
  const goTo = useCallback((i: number) => setActive(((i % count) + count) % count), [count]);
  const next = useCallback(() => goTo(activeRef.current + 1), [goTo]);
  const prev = useCallback(() => goTo(activeRef.current - 1), [goTo]);

  // Mirror for callbacks used inside effects (autoplay timer).
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return;
    const t = window.setInterval(() => goTo(activeRef.current + 1), AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [count, paused, goTo, reducedMotion]);

  if (count === 0) return <></>;

  return (
    <section
      className="px-4 pt-8 md:px-8"
      aria-roledescription="carousel"
      aria-label="โปรโมชั่นแนะนำ"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(dx) > 48) (dx < 0 ? next : prev)();
      }}
    >
      <div className="relative mx-auto max-w-5xl">
        {/* Viewport — clay rounded frame */}
        <div className="clay-card overflow-hidden rounded-3xl p-0">
          <div
            className="flex"
            style={{
              transform: `translateX(-${active * 100}%)`,
              transition: reducedMotion
                ? 'none'
                : 'transform var(--duration-interactive, 550ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1))',
            }}
          >
            {slides.map((s, i) => {
              // A slide is either an image banner, a text deal card (label
              // only — the old ticker's promo role), or an image with a deal
              // chip overlay. Image-only slides render exactly as before.
              const media =
                s.imageUrl && s.label ? (
                  <div className="relative">
                    <img
                      src={s.imageUrl}
                      alt={s.alt}
                      className="aspect-[16/6] w-full object-cover sm:aspect-[21/8]"
                      loading={i === 0 ? 'eager' : 'lazy'}
                      draggable={false}
                    />
                    <span className="bg-surface/95 absolute bottom-3 left-3 rounded-full px-4 py-1.5 text-sm font-bold text-fg shadow-clay-sm">
                      {s.label}
                    </span>
                  </div>
                ) : s.imageUrl ? (
                  <img
                    src={s.imageUrl}
                    alt={s.alt}
                    className="aspect-[16/6] w-full object-cover sm:aspect-[21/8]"
                    loading={i === 0 ? 'eager' : 'lazy'}
                    draggable={false}
                  />
                ) : (
                  <div
                    role="img"
                    aria-label={s.alt}
                    className="flex aspect-[16/6] w-full items-center justify-center bg-gradient-to-br from-peach-100 via-surface-base to-peach-50 sm:aspect-[21/8]"
                  >
                    <p className="px-6 text-center font-display text-xl font-bold text-fg sm:text-3xl">
                      {s.label}
                    </p>
                  </div>
                );
              return (
                <div
                  key={s.id}
                  className="w-full shrink-0"
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} / ${count}`}
                  aria-hidden={i !== active}
                >
                  {s.href ? (
                    <Link href={s.href} tabIndex={i === active ? 0 : -1} className="block">
                      {media}
                    </Link>
                  ) : (
                    media
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Arrows — clay squish buttons straddling the viewport */}
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="สไลด์ก่อนหน้า"
              className="shadow-clay-md absolute left-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-fg transition-transform duration-fast ease-out-quart hover:scale-105 active:scale-90 active:shadow-clay-press"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="สไลด์ถัดไป"
              className="shadow-clay-md absolute right-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-fg transition-transform duration-fast ease-out-quart hover:scale-105 active:scale-90 active:shadow-clay-press"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      {/* Dots — elongated active pill (GAME ON style) */}
      {count > 1 && (
        <div
          className="mt-4 flex items-center justify-center gap-2"
          role="tablist"
          aria-label="เลือกสไลด์"
        >
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`สไลด์ที่ ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                'h-2.5 rounded-full transition-all duration-fast ease-out-quart',
                i === active
                  ? 'w-8 bg-fg-brand shadow-clay-sm'
                  : 'w-2.5 bg-clay-600 hover:bg-fg-placeholder',
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
