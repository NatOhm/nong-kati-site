import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { cn } from '@/utils/cn';
import { HamsterMascot } from '@/components/ui/ClayIcons';

export interface EmptyCartProps {
  className?: string;
}

/**
 * 05-components.md §4.5 — Empty Cart State.
 * Shown when cart has no items. The mascot waves to invite browsing.
 */
export function EmptyCart({ className }: EmptyCartProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="relative mb-4">
        <div className="mascot-wave">
          <HamsterMascot size={90} className="drop-shadow-[0_6px_10px_rgba(147,107,73,0.3)]" />
        </div>
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-surface shadow-clay-xs"
        >
          <ShoppingCart size={15} className="text-fg-placeholder" strokeWidth={1.5} />
        </span>
      </div>
      <h3 className="mb-2 text-lg font-semibold text-fg">ตะกร้าของคุณว่างเปล่า</h3>
      <p className="mb-4 text-sm text-fg-placeholder">
        น้องแฮมสเตอร์รอช่วยหาโค้ดให้ — เลือกสินค้าก่อนนะ
      </p>
      <Link
        href="/search"
        className="inline-flex items-center justify-center rounded-full bg-peach-500 px-5 py-2.5 text-sm font-semibold text-white shadow-clay-brand transition-all hover:scale-[1.03] hover:bg-peach-400 hover:shadow-clay-lg active:scale-[0.96] active:shadow-clay-press"
      >
        เลือกซื้อสินค้า
      </Link>
    </div>
  );
}
