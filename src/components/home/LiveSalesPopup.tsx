'use client';

import { useState, useEffect } from 'react';
import { X, ShoppingCart } from 'lucide-react';
import { cn } from '@/utils/cn';

const SALES_DATA = [
  { name: 'คุณ N***', product: 'HBO Max 7 4K', price: 25, time: '2 นาทีที่แล้ว' },
  { name: 'คุณ P***', product: 'Netflix 30 วัน', price: 120, time: '5 นาทีที่แล้ว' },
  { name: 'คุณ K***', product: 'Spotify Premium', price: 45, time: '8 นาทีที่แล้ว' },
  { name: 'คุณ S***', product: 'YouTube Premium', price: 7, time: '12 นาทีที่แล้ว' },
  { name: 'คุณ A***', product: 'WeTV 30 แชร์ 2', price: 45, time: '15 นาทีที่แล้ว' },
  { name: 'คุณ T***', product: 'iQIYI 30 ส่วนตัว', price: 62, time: '18 นาทีที่แล้ว' },
  { name: 'คุณ M***', product: 'Prime Video 30', price: 40, time: '22 นาทีที่แล้ว' },
  { name: 'คุณ W***', product: 'CapCut 7 ส่วนตัว', price: 59, time: '25 นาทีที่แล้ว' },
  { name: 'คุณ J***', product: 'Youku 30 ยกแอค', price: 60, time: '30 นาทีที่แล้ว' },
  { name: 'คุณ R***', product: 'Bilibili 30 แชร์ 4', price: 20, time: '35 นาทีที่แล้ว' },
];

export function LiveSalesPopup() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Show first popup after 3 seconds
    const showTimer = setTimeout(() => setIsVisible(true), 3000);
    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (isDismissed) return;

    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % SALES_DATA.length);
        setIsVisible(true);
      }, 500); // Wait for fade out
    }, 6000); // Change every 6 seconds

    return () => clearInterval(interval);
  }, [isDismissed]);

  if (isDismissed) return null;

  const sale = SALES_DATA[currentIndex];
  if (!sale) return null;

  return (
    <div
      className={cn(
        'fixed bottom-[5.5rem] left-4 z-50 max-w-[320px] transition-all duration-500',
        'sm:bottom-6 sm:left-6',
        isVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
      )}
    >
      <div className="bg-surface-base/95 flex items-center gap-3 rounded-xl border border-line-subtle p-3 shadow-clay-lg backdrop-blur-md">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-jade-500/15">
          <ShoppingCart size={18} className="text-jade-700" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-jade-700">🛒 ยอดขายล่าสุด</p>
          <p className="truncate text-sm text-fg">
            <span className="font-medium">{sale.name}</span> ซื้อ{' '}
            <span className="text-fg-brand-strong">{sale.product}</span>
          </p>
          <p className="text-xs text-fg-secondary">{sale.time}</p>
        </div>

        {/* Price */}
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-fg-brand-strong">฿{sale.price}</p>
        </div>

        {/* Close */}
        <button
          onClick={() => setIsDismissed(true)}
          className="shrink-0 rounded-full p-1 text-fg-muted hover:bg-surface hover:text-fg"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
