'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface EmptyCartProps {
  className?: string;
}

/**
 * 05-components.md §4.5 — Empty Cart State.
 * Shown when cart has no items.
 */
export function EmptyCart({ className }: EmptyCartProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-clay-100">
        <ShoppingCart size={28} className="text-clay-500" strokeWidth={1.5} />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-clay-900">ตะกร้าของคุณว่างเปล่า</h3>
      <p className="mb-4 text-sm text-clay-500">เลือกสินค้าเพื่อเพิ่มในตะกร้า</p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-md bg-peach-500 px-5 py-2.5 text-sm font-semibold text-white shadow-clay-sm transition-all hover:bg-peach-400 active:scale-95"
      >
        เลือกซื้อสินค้า
      </Link>
    </div>
  );
}
