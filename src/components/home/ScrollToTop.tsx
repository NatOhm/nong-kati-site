'use client';

import { useState, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/utils/cn';

export function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      setIsVisible(window.scrollY > 300);
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      onClick={scrollToTop}
      className={cn(
        'fixed bottom-20 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-line-subtle bg-surface text-fg-muted shadow-lg transition-all hover:border-peach-400 hover:bg-peach-500 hover:text-white',
        'lg:bottom-6 lg:right-6',
        isVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
      )}
      aria-label="เลื่อนขึ้นด้านบน"
    >
      <ChevronUp size={20} />
    </button>
  );
}
