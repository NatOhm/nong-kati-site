'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Catalog search box with Google-style live suggestions (client ask:
 * "ชื่อสินค้าสไลค์ลงมาเหมือนกดเสิร์ชในกูเกิ้ล"). Debounced lookups against
 * /api/v1/search/suggest; Enter or a suggestion click navigates to ?q=.
 * Works at every viewport — phones included — unlike the md+-only navbar
 * search.
 */

interface Suggestion {
  name: string;
  slug: string;
  categoryName: string;
}

export function CatalogSearchBox({ className }: { className?: string }): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced suggestion fetch (250ms, mirrors the navbar box)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/v1/search/suggest?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((d: { suggestions?: Suggestion[] }) => {
          setSuggestions(d.suggestions ?? []);
          setOpen(true);
        })
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const go = (q: string) => {
    setOpen(false);
    router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
  };

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(query);
        }}
        role="search"
      >
        <div className="shadow-inset-sm flex items-center gap-2 rounded-full border border-line bg-surface-elevated px-4 py-2 transition-colors focus-within:border-peach-500">
          <Search size={16} className="text-fg-placeholder" />
          <input
            type="text"
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls="catalog-search-suggest"
            aria-label="ค้นหาสินค้า"
            placeholder="ค้นหาสินค้า…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
            className="h-11 w-full bg-transparent text-base text-fg"
          />
        </div>
      </form>

      {/* Google-style dropdown: slides down over the grid */}
      {open && suggestions.length > 0 && (
        <div
          id="catalog-search-suggest"
          role="listbox"
          aria-label="คำค้นแนะนำ"
          className="clay-card suggest-drop absolute left-0 top-full z-40 mt-2 w-full overflow-hidden rounded-2xl p-1.5"
        >
          {suggestions.map((s) => (
            <button
              key={s.slug}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={() => go(s.name)}
              className="flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-fast hover:bg-surface-sunken"
            >
              <Search size={14} className="shrink-0 text-fg-placeholder" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{s.name}</span>
                <span className="block text-xs text-fg-muted">{s.categoryName}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
