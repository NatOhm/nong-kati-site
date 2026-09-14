'use client';

import { useState } from 'react';
import { X, Sparkles } from 'lucide-react';

export function AnnouncementBar() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="relative bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 px-4 py-2">
      <div className="mx-auto flex max-w-[1440px] items-center justify-center gap-2 text-center">
        <Sparkles size={16} className="text-ink-900 shrink-0" />
        <p className="text-sm font-medium text-ink-900">
          🎉 <span className="font-bold">โปรโมชั่นพิเศษ!</span> HBO Max 7 วัน ลดเหลือ ฿25 —{' '}
          <a href="/product/hbo-max-7-4k-4" className="underline font-bold hover:text-ink-800">
            กดซื้อเลย!
          </a>
        </p>
        <button
          onClick={() => setIsVisible(false)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-900/60 hover:text-ink-900 hover:bg-amber-700/30"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
