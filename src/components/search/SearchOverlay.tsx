'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import { useFocusTrap } from '@/hooks/useFocusTrap';
import { readRecentProducts, type RecentProduct } from '@/lib/recentlyViewed';
import { formatThb } from '@/utils/format';

import { SearchEmptyState } from './SearchEmptyState';
import { SearchResultCard } from './SearchResultCard';

interface Suggestion {
  name: string;
  slug: string;
  categoryName: string;
}

interface CategoryChip {
  id: string;
  name: string;
  slug: string;
}

export interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Full-screen mobile search sheet (client ask 2026-11-06, from the app-style
 * reference): input + ยกเลิก, live suggestions while typing, category chips as
 * "ลองค้นหา", and the last products the visitor opened as "ดูล่าสุด".
 *
 * Desktop keeps the navbar field; this sheet is what the phone's ค้นหา tab
 * opens, so it renders outside the blurred navbar (backdrop-filter would
 * become the containing block of a fixed overlay).
 */
export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps): React.JSX.Element | null {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searched, setSearched] = useState(false);
  const [categories, setCategories] = useState<CategoryChip[]>([]);
  const [recent, setRecent] = useState<RecentProduct[]>([]);
  const sheetRef = useFocusTrap(isOpen);

  // Open/close: read recents, load chips once, lock the page behind the sheet.
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSuggestions([]);
      setSearched(false);
      return;
    }
    setRecent(readRecentProducts());
    document.body.style.overflow = 'hidden';
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    fetch('/api/v1/categories')
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((d: { categories?: CategoryChip[] }) => setCategories(d.categories ?? []))
      // Chips are optional; a failure just means the section is not rendered.
      .catch(() => setCategories([]));
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Google-style suggestions, same 250ms debounce as the navbar box.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/v1/search/suggest?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((d: { suggestions?: Suggestion[] }) => {
          setSuggestions(d.suggestions ?? []);
          setSearched(true);
        })
        .catch(() => {
          setSuggestions([]);
          setSearched(true);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const go = useCallback(
    (q: string) => {
      router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
      onClose();
    },
    [router, onClose],
  );

  if (!isOpen) return null;

  const trimmed = query.trim();

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label="ค้นหาสินค้า"
      className="fixed inset-0 z-[100] flex flex-col bg-surface-base"
    >
      {/* Header: input + ยกเลิก */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(trimmed);
        }}
        className="flex items-center gap-2 border-b border-line-subtle px-3 py-2"
      >
        <div className="shadow-inset-sm flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface-elevated px-3 py-2">
          <Search size={18} className="shrink-0 text-fg-placeholder" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาสินค้า…"
            aria-label="ค้นหาสินค้า"
            autoComplete="off"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-base text-fg placeholder:text-fg-muted"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] shrink-0 px-2 text-sm font-medium text-fg-secondary"
        >
          ยกเลิก
        </button>
      </form>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {trimmed ? (
          suggestions.length > 0 ? (
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
          ) : searched ? (
            <SearchEmptyState query={trimmed} />
          ) : null
        ) : (
          <div className="space-y-6">
            {categories.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-fg">ลองค้นหา</h2>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <Link
                      key={cat.id}
                      href={`/search?category=${encodeURIComponent(cat.slug)}`}
                      onClick={onClose}
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-fg-secondary"
                    >
                      {cat.name}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {recent.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-fg">ดูล่าสุด</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {recent.map((p) => (
                    <Link
                      key={p.slug}
                      href={`/product/${encodeURIComponent(p.slug)}`}
                      onClick={onClose}
                      className="min-w-0"
                    >
                      <div className="mb-2 aspect-[4/3] overflow-hidden rounded-xl bg-surface">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- admin upload served immutable from /api/v1/images; next/image has no remote pattern for it
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-peach-100 to-clay-200 text-2xl opacity-40">
                            🎮
                          </div>
                        )}
                      </div>
                      <p className="line-clamp-2 text-sm font-medium leading-snug text-fg">
                        {p.name}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-secondary">{formatThb(p.price)}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
