'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { WishlistButton } from '@/components/product/WishlistButton';

/**
 * Wishlist heart + live counter pill for the product detail page.
 * The server-rendered count hydrates first; toggling the heart re-reads the
 * count from the `nk-wish` event the WishlistButton dispatches, so the number
 * ticks up/down instantly without a second fetch.
 */
export function WishCounterBadge({
  productId,
  initialCount,
  className,
}: {
  productId: string;
  initialCount: number;
  className?: string;
}): React.JSX.Element {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const onWish = (e: Event) => {
      const detail = (e as CustomEvent<{ productId: string; wishCount: number }>).detail;
      if (detail?.productId === productId) setCount(detail.wishCount);
    };
    window.addEventListener('nk-wish', onWish);
    return () => window.removeEventListener('nk-wish', onWish);
  }, [productId]);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line-subtle bg-surface py-1 pl-1.5 pr-3.5 transition-colors',
        count > 0 && 'border-blush bg-blush-50',
        className,
      )}
    >
      <WishlistButton productId={productId} className="h-7 w-7" />
      <span
        className="text-sm font-medium text-fg-secondary"
        aria-live="polite"
        aria-label={`มี ${count} คนบันทึกสินค้านี้ไว้`}
      >
        {count > 0 ? `${count} คนถูกใจ` : 'ยังไม่มีคนถูกใจ'}
      </span>
    </span>
  );
}
