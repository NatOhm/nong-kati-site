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
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface">
        <Search size={28} className="text-fg-placeholder" strokeWidth={1.5} />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-fg">ไม่พบสินค้า &quot;{query}&quot;</h3>
      <p className="max-w-sm text-sm text-fg-placeholder">
        ลองค้นหาด้วยคำอื่น หรือตรวจสอบการสะกดคำ
      </p>
    </div>
  );
}
