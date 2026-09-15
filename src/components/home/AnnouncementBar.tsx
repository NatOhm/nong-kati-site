'use client';

import { useState } from 'react';
import { X, Sparkles } from 'lucide-react';

export function AnnouncementBar() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="relative bg-gradient-to-r from-peach-400 via-peach-300 to-peach-400 px-4 py-2">
      <div className="mx-auto flex max-w-[1440px] items-center justify-center gap-2 text-center">
        <Sparkles size={16} className="shrink-0 text-peach-900" />
        <p className="text-sm font-medium text-clay-900">
          🎉 <span className="font-bold">โปรโมชั่นพิเศษ!</span> HBO Max 7 วัน ลดเหลือ ฿25 —{' '}
          <a href="/product/hbo-max-7-4k-4" className="font-bold underline hover:text-peach-800">
            กดซื้อเลย!
          </a>
        </p>
        <button
          onClick={() => setIsVisible(false)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-clay-700/60 transition-colors hover:bg-clay-500/20 hover:text-clay-900"
          aria-label="ปิดประกาศ"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
