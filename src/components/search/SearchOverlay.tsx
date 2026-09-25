'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, X, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/utils/cn';
import { SearchResultCard } from './SearchResultCard';
import { SearchEmptyState } from './SearchEmptyState';

export interface SearchSuggestion {
  name: string;
  slug: string;
  categoryName: string;
}

export interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions?: SearchSuggestion[];
  recentSearches?: string[];
  onSearch?: (query: string) => void;
  onClearRecent?: () => void;
}

const TRENDING_SEARCHES = ['บัตร Steam', 'Netflix', 'Roblox', 'Apple Gift Card', 'Google Play'];

/**
 * 05-components.md §7 — Search Overlay.
 * Full-screen modal with search input, suggestions, recent & trending.
 */
export function SearchOverlay({
  isOpen,
  onClose,
  suggestions = [],
  recentSearches = [],
  onSearch,
  onClearRecent,
}: SearchOverlayProps): React.JSX.Element | null {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        onSearch?.(query.trim());
        onClose();
      }
    },
    [query, onSearch, onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      className="bg-surface-base/98 fixed inset-0 z-[100] flex flex-col backdrop-blur-md"
      role="dialog"
      aria-label="ค้นหาสินค้า"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line-subtle px-4 py-3">
        <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-3">
          <Search size={20} className="shrink-0 text-fg-placeholder" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาสินค้า..."
            className="flex-1 bg-transparent text-base text-fg placeholder:text-fg-placeholder"
            aria-label="ค้นหาสินค้า"
          />
        </form>
        <button
          onClick={onClose}
          className="rounded-md p-2 text-fg-placeholder hover:bg-surface hover:text-fg-secondary"
          aria-label="ปิดการค้นหา"
        >
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {query.trim() ? (
          // Show suggestions
          suggestions.length > 0 ? (
            <div className="mx-auto max-w-2xl">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-placeholder">
                ผลการค้นหา
              </h3>
              <div className="flex flex-col gap-1">
                {suggestions.map((s) => (
                  <SearchResultCard
                    key={s.slug}
                    name={s.name}
                    slug={s.slug}
                    categoryName={s.categoryName}
                    onClick={onClose}
                  />
                ))}
              </div>
            </div>
          ) : (
            <SearchEmptyState query={query} />
          )
        ) : (
          // Show recent + trending
          <div className="mx-auto max-w-2xl space-y-6">
            {recentSearches.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-placeholder">
                    <Clock size={14} className="mr-1 inline" />
                    ค้นหาล่าสุด
                  </h3>
                  <button
                    onClick={onClearRecent}
                    className="text-xs text-fg-placeholder hover:text-fg-brand"
                  >
                    ล้างทั้งหมด
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((term) => (
                    <button
                      key={term}
                      onClick={() => {
                        setQuery(term);
                        onSearch?.(term);
                        onClose();
                      }}
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-fg-secondary hover:border-peach-400 hover:text-fg-brand"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-placeholder">
                <TrendingUp size={14} className="mr-1 inline" />
                ยอดนิยม
              </h3>
              <div className="flex flex-wrap gap-2">
                {TRENDING_SEARCHES.map((term) => (
                  <button
                    key={term}
                    onClick={() => {
                      setQuery(term);
                      onSearch?.(term);
                      onClose();
                    }}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-fg-secondary hover:border-peach-400 hover:text-fg-brand"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
