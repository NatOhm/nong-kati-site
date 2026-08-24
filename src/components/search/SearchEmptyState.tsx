'use client';

import { Search } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface SearchEmptyStateProps {
  query: string;
  className?: string;
}

/**
 * Shown when search returns no results.
 */
export function SearchEmptyState({ query, className }: SearchEmptyStateProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ink-800">
        <Search size={28} className="text-ink-400" strokeWidth={1.5} />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-ink-100">
        ไม่พบสินค้า &quot;{query}&quot;
      </h3>
      <p className="max-w-sm text-sm text-ink-400">
        ลองค้นหาด้วยคำอื่น หรือตรวจสอบการสะกดคำ
      </p>
    </div>
  );
}
