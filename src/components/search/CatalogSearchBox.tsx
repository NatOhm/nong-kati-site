'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { AnchoredPopover } from '@/components/ui/AnchoredPopover';
import { useComboboxKeyboard } from '@/hooks/useComboboxKeyboard';
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
  /* a11y gate (duplicate-ID): listbox id is per-instance (useId). */
  const suggestListId = useId();
  /* Anchor for the portaled suggestion list (see AnchoredPopover). */
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

  // Close on outside click. AnchoredPopover owns this now: the panel is
  // portaled to document.body, so it is no longer inside boxRef and the old
  // `boxRef.contains(target)` test would have treated every suggestion click
  // as an outside click. The primitive tests the panel ref as well.
  const close = useCallback(() => setOpen(false), []);

  const go = (q: string) => {
    setOpen(false);
    router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
  };

  /* Per-option ids — aria-activedescendant needs a stable id per option, and
     they must be unique across the two search boxes on the page. */
  const optionIds = suggestions.map((_, i) => `${suggestListId}-opt-${i}`);

  // Arrow keys + Enter. This box previously accepted only Escape and the
  // mouse, so a keyboard or screen-reader user could not reach a suggestion at
  // all despite the combobox/listbox roles advertising one.
  const { activeIndex, activeDescendantId, onKeyDown } = useComboboxKeyboard({
    optionIds,
    onSelect: (i) => go(suggestions[i]?.name ?? query),
    onCommit: () => go(query),
    onClose: close,
    resetKey: query,
  });

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
            aria-controls={suggestListId}
            aria-activedescendant={activeDescendantId}
            aria-autocomplete="list"
            aria-label="ค้นหาสินค้า"
            placeholder="ค้นหาสินค้า…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
            className="h-11 w-full bg-transparent text-base text-fg"
          />
        </div>
      </form>

      {/* Google-style dropdown: slides down over the grid.
          Portaled + measured instead of `absolute left-0 top-full`. As a
          plain absolute child it could not know how much room was left, so on
          a short viewport (measured at 740x420: the list is 366px tall and
          hung 177px past the fold, putting the last two suggestions out of
          reach) it simply ran off the bottom of the screen. AnchoredPopover
          flips it above the input when that is the better side and clamps it
          inside the viewport otherwise. */}
      <AnchoredPopover
        open={open && suggestions.length > 0}
        onClose={close}
        anchorRef={boxRef}
        align="start"
        matchAnchorWidth
        role="listbox"
        ariaLabel="คำค้นแนะนำ"
        id={suggestListId}
        className="clay-card suggest-drop max-h-[min(24rem,calc(100vh-1rem))] overflow-y-auto overscroll-contain rounded-2xl p-1.5"
      >
          {suggestions.map((s, i) => (
            <button
              key={s.slug}
              id={optionIds[i]}
              type="button"
              role="option"
              aria-selected={activeIndex === i}
              onMouseDown={() => go(s.name)}
              className={cn(
                'flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-fast',
                // Highlight follows the keyboard highlight too, so the mouse
                // and keyboard affordances look the same. Without this a
                // keyboard user gets no visible indication of where they are.
                activeIndex === i ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
              )}
            >
              <Search size={14} className="shrink-0 text-fg-placeholder" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{s.name}</span>
                <span className="block text-xs text-fg-muted">{s.categoryName}</span>
              </span>
            </button>
          ))}
      </AnchoredPopover>
    </div>
  );
}
