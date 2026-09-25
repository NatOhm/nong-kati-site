'use client';

import { MessageCircle } from 'lucide-react';

export function LINEChatButton() {
  return (
    <a
      href="https://line.me/R/ti/p/@nongkati"
      target="_blank"
      rel="noopener noreferrer"
      // audit #8: green-500 was ~2.28:1 on the white artwork; green-700 ≈ 4.8:1.
      className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-green-700 text-white shadow-lg transition-all hover:scale-110 hover:bg-green-600 hover:shadow-xl lg:bottom-6"
      aria-label="แชทกับเราทาง LINE"
    >
      <MessageCircle size={24} />
    </a>
  );
}
