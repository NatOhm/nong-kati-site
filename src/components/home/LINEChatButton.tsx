'use client';

import { MessageCircle } from 'lucide-react';

export function LINEChatButton() {
  return (
    <a
      href="https://line.me/R/ti/p/@nongkati"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-all hover:scale-110 hover:bg-green-400 hover:shadow-xl lg:bottom-6"
      aria-label="แชทกับเราทาง LINE"
    >
      <MessageCircle size={24} />
    </a>
  );
}
