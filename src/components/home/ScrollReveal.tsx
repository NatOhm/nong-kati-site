'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

/**
 * Scroll-triggered reveal (550ms ease-out). Primary path is an
 * IntersectionObserver; a scroll+resize fallback covers embedded webviews
 * whose observers never fire. Also reveals immediately when the section is
 * already in view at mount (no scroll needed above the fold).
 */
export function ScrollReveal({ children, className, delay = 0 }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Already visible at mount (above the fold)? Reveal without waiting.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      const t = setTimeout(() => setIsVisible(true), delay);
      return () => clearTimeout(t);
    }

    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      setTimeout(() => setIsVisible(true), delay);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          reveal();
          observer.disconnect();
          window.removeEventListener('scroll', onScroll);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);

    // Fallback for webviews where IntersectionObserver never fires: a cheap
    // passive scroll check using getBoundingClientRect.
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9 && r.bottom > 0) {
        reveal();
        window.removeEventListener('scroll', onScroll);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [delay]);

  return (
    <div
      ref={ref}
      className={cn(
        'transition-smart duration-interactive ease-out-quart will-change-transform',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 scale-[0.99] opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
