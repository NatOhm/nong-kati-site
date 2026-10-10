import { MessageCircle } from 'lucide-react';
import { getStoreInfo } from '@/lib/data';

export async function LINEChatButton(): Promise<React.JSX.Element | null> {
  const store = await getStoreInfo();
  // The configured destination is customer-provided and must be verified
  // before publication; never silently fall back to an unverified account.
  if (!store.lineUrl) return null;
  const label = store.line?.trim() ? `แชทกับเรา LINE ${store.line.trim()}` : 'แชทกับเราทาง LINE';

  return (
    <a
      href={store.lineUrl}
      target="_blank"
      rel="noopener noreferrer"
      // audit #8: green-500 was ~2.28:1 on the white artwork; green-700 ≈ 4.8:1.
      className="transition-smart fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-green-700 text-white shadow-clay-brand hover:scale-110 hover:bg-green-600 lg:bottom-6"
      aria-label={label}
      title={label}
    >
      <MessageCircle size={24} />
    </a>
  );
}
