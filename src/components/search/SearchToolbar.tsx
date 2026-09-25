'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/utils/cn';

export interface SearchToolbarProps {
  /** Search input (CatalogSearchBox) — passed as children so it keeps its Suspense boundary. */
  children?: React.ReactNode;
  /** 1-based current page (from the URL). */
  page: number;
  totalPages: number;
  sortOptions: { value: string; label: string }[];
  currentSort: string;
  className?: string;
}

/**
 * Reference-grid toolbar (img 2): search box left, "Sort By :" dropdown plus
 * 1/N pager with square arrow buttons right. Arrows navigate via ?page= and
 * keep every other param; the dropdown swaps ?sort=. Server renders the
 * results; this component only updates the URL.
 */
export function SearchToolbar({
  children,
  page,
  totalPages,
  sortOptions,
  currentSort,
  className,
}: SearchToolbarProps): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const [sortOpen, setSortOpen] = useState(false);

  const go = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === '') sp.delete(k);
      else sp.set(k, v);
    }
    const s = sp.toString();
    router.push(`/search${s ? `?${s}` : ''}`);
  };

  const currentLabel =
    sortOptions.find((o) => o.value === currentSort)?.label ?? sortOptions[0]?.label ?? '';
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const arrowCls = (enabled: boolean) =>
    cn(
      'inline-flex h-9 w-9 items-center justify-center rounded-md border transition-smart duration-fast',
      enabled
        ? 'border-line-strong bg-surface-elevated text-fg hover:border-peach-400 hover:text-peach-800 active:scale-90'
        : 'cursor-not-allowed border-line bg-surface-sunken text-fg-placeholder opacity-50',
    );

  return (
    <div
      className={cn(
        'flex flex-col gap-3 md:flex-row md:items-center md:justify-between',
        className,
      )}
    >
      {/* Search — same CatalogSearchBox as before, left side on md+ */}
      <div className="w-full md:max-w-md">{children}</div>

      <div className="flex items-center justify-between gap-2 md:justify-end md:gap-3">
        {/* Sort By dropdown */}
        <div className="relative">
          <label className="sr-only" htmlFor="search-sort">
            เรียงตาม
          </label>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-fg-muted sm:inline">เรียงตาม :</span>
            <button
              id="search-sort"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((v) => !v)}
              onBlur={() => setTimeout(() => setSortOpen(false), 120)}
              className={cn(
                'inline-flex h-9 min-w-40 items-center justify-between gap-2 rounded-md border border-line-strong bg-surface-elevated px-3 text-sm font-medium text-fg transition-colors',
                'hover:border-peach-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-peach-500',
              )}
            >
              <span className="truncate">{currentLabel}</span>
              <ChevronDown
                size={15}
                className={cn(
                  'shrink-0 transition-transform duration-fast',
                  sortOpen && 'rotate-180',
                )}
              />
            </button>
          </div>
          {sortOpen && (
            <ul
              role="listbox"
              aria-label="ตัวเลือกการเรียง"
              className="clay-card suggest-drop absolute right-0 top-full z-40 mt-1.5 w-full min-w-40 overflow-hidden rounded-xl p-1"
            >
              {sortOptions.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={opt.value === currentSort}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSortOpen(false);
                      if (opt.value !== currentSort)
                        go({
                          sort: opt.value === 'featured' ? undefined : opt.value,
                          page: undefined,
                        });
                    }}
                    className={cn(
                      'flex min-h-[40px] w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors duration-fast hover:bg-surface-sunken',
                      opt.value === currentSort
                        ? 'font-semibold text-fg-brand'
                        : 'text-fg-secondary',
                    )}
                  >
                    {opt.label}
                    {opt.value === currentSort && <span aria-hidden="true">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pager: 1/N + square arrows */}
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-fg-muted" aria-live="polite">
            {page}/{Math.max(totalPages, 1)}
          </span>
          <button
            type="button"
            aria-label="หน้าก่อนหน้า"
            disabled={!canPrev}
            onClick={() => canPrev && go({ page: String(page - 1) })}
            className={arrowCls(canPrev)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="หน้าถัดไป"
            disabled={!canNext}
            onClick={() => canNext && go({ page: String(page + 1) })}
            className={arrowCls(canNext)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
