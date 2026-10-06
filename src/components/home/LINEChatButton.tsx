'use client';

import { MessageCircle } from 'lucide-react';
import { getStoreInfo } from '@/lib/data';

export async function LINEChatButton() {
  const store = await getStoreInfo();
  // Use LINE URL from store settings, or fallback to LINE ID lookup
  // The LINE ID @057qytao maps to https://lin.ee/uH72DZ2
  const lineId = store.line?.replace('@', '') || '057qytao';
  const lineUrl = store.lineUrl || `https://lin.ee/uH72DZ2`;
  
  return (
    <a
      href={lineUrl}
      target="_blank"
      rel="noopener noreferrer"
      // audit #8: green-500 was ~2.28:1 on the white artwork; green-700 ≈ 4.8:1.
      className="transition-smart fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-green-700 text-white shadow-clay-brand hover:scale-110 hover:bg-green-600 lg:bottom-6"
      aria-label="แชทกับเราทาง LINE"
    >
      <MessageCircle size={24} />
    </a>
  );
}
