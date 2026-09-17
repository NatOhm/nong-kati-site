'use client';

import { useState, useEffect } from 'react';
import { AcornIcon } from '@/components/ui/ClayIcons';
import { cn } from '@/utils/cn';

/** Scroll-to-top: clay acorn that pops in with a bounce when you've scrolled down. */
export function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      setIsVisible(window.scrollY > 300);
    };

    window.addEventListener('scroll', toggleVisibility, { passive: true });
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      onClick={scrollToTop}
      className={cn(
        'clay-btn fixed bottom-[9.5rem] right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated shadow-clay transition-all duration-interactive ease-spring hover:scale-110 hover:shadow-clay-lg active:scale-90 active:shadow-clay-press',
        'lg:bottom-6 lg:right-20',
        isVisible
          ? 'translate-y-0 animate-seed-pop opacity-100'
          : 'pointer-events-none translate-y-4 opacity-0',
      )}
      aria-label="เลื่อนขึ้นด้านบน"
      title="เลื่อนขึ้นด้านบน"
    >
      <AcornIcon size={28} />
    </button>
  );
}
