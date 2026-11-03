/**
 * Category-filter landing state (2026-11-03, extended 1.1.7).
 *
 * Audited on the live 1.1.5 build: /search?category=streaming-app filtered the
 * grid correctly (19 cards) but the ONLY aria-current="page" on the page
 * belonged to the navbar's สินค้าทั้งหมด link, which points at a different view.
 * The chip row styled the selected category but announced nothing, so the
 * drawer's one-tap route (/search?category=<slug>, client ask) landed on a page
 * that read as an unfiltered catalog to assistive tech.
 *
 * The fix has two halves that must stay together:
 *  1. search/page.tsx — the selected chip carries aria-current="page" (and the
 *     peach pill styling); ทั้งหมด is only current when no filter is set.
 *  2. the chrome — FacebookNavbar's /search entry drops aria-current while a
 *     category filter is in force, fed through FacebookLayout.
 *
 * 1.1.7 added two more failures in the same area:
 *  - Every chip href was built without `available`, so clicking any category
 *    while "เฉพาะที่มีของ" was on silently turned the filter off. Sorting and
 *    paging (SearchToolbar) always preserved it; only the chips lost it.
 *  - An unknown ?category= filtered the grid to nothing AND left the page with
 *    zero aria-current (no chip matched, and the navbar goes inert whenever a
 *    slug is set) under a heading naming a category that does not exist. The
 *    page now resolves the slug against the chip list and treats an unknown one
 *    as unfiltered, so exactly one element is always current.
 *
 * C1-C5 are source-level; R1-R3 render the real page component and assert on
 * the markup, which is the only way to prove "exactly one aria-current" and
 * "the chip hrefs keep their params" together.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const page = readFileSync(path.join(process.cwd(), 'src/app/search/page.tsx'), 'utf-8');
const layout = readFileSync(
  path.join(process.cwd(), 'src/components/layout/FacebookLayout.tsx'),
  'utf-8',
);
const navbar = readFileSync(
  path.join(process.cwd(), 'src/components/layout/FacebookNavbar.tsx'),
  'utf-8',
);

/** The category-chip section of the page, so assertions cannot match the rest. */
function chipSection(): string {
  const start = page.indexOf('{/* Category chips');
  const end = page.indexOf('{/* Results', start);
  expect(start, 'category chip block not found — did /search change shape?').toBeGreaterThan(-1);
  expect(end, 'category chip block end not found').toBeGreaterThan(start);
  return page.slice(start, end);
}

describe('search category landing state (source)', () => {
  it('C1 — the selected category chip announces itself', () => {
    const chips = chipSection();
    expect(
      chips,
      'the category chip lost aria-current → the filtered landing reads as unfiltered to a screen reader',
    ).toMatch(/aria-current=\{selected \? 'page' : undefined\}/);
    expect(chips, 'the per-chip selected flag is gone').toMatch(
      /const selected = categorySlug === cat\.slug;/,
    );
  });

  it('C2 — the selected chip keeps the visible active styling', () => {
    const chips = chipSection();
    expect(chips, 'active chip styling was dropped').toMatch(
      /selected\s*\?\s*'border-peach-500 bg-peach-100 text-peach-800'/,
    );
    expect(chips, 'inactive chip styling was dropped').toMatch(
      /'border-line bg-surface text-fg-secondary/,
    );
  });

  it('C3 — ทั้งหมด is current only when no filter is applied', () => {
    const chips = chipSection();
    expect(
      chips,
      'ทั้งหมด must not claim aria-current on a filtered landing',
    ).toMatch(/aria-current=\{!categorySlug \? 'page' : undefined\}/);
  });

  it('C4 — the page hands the filter to the chrome', () => {
    expect(page, '/search must pass its category filter to the layout').toContain(
      '<FacebookLayout searchCategory={categorySlug}>',
    );
    expect(layout, 'the layout must accept the filter').toMatch(
      /searchCategory\?: string \| undefined;/,
    );
    expect(layout, 'the layout must forward the filter to the navbar').toMatch(
      /<FacebookNavbar[\s\S]*?searchCategory=\{searchCategory\}/,
    );
  });

  it('C5 — the navbar keeps สินค้าทั้งหมด inert on a filtered page', () => {
    expect(navbar, 'the navbar must accept the filter').toMatch(
      /searchCategory\?: string \| undefined;/,
    );
    const active = navbar.match(/const isActive =\s*[\s\S]*?;\n/)?.[0] ?? '';
    expect(active, 'navbar active-state block not found').not.toBe('');
    expect(
      active,
      'the /search nav entry ignores searchCategory again → it announces itself as the current page while the grid is filtered',
    ).toMatch(/pathname === '\/search' && !searchCategory/);
  });
});

// ─── Render-level (1.1.7) ───────────────────────────────────────────────────
// The page is a server component: no hooks, no context, plain async function →
// JSX. Rendering it with the data layer mocked is the only honest way to count
// aria-current across the chips as they will actually ship.

const h = vi.hoisted(() => ({
  layoutCategory: 'unset' as string | undefined | 'unset',
  catalogCalls: [] as { query: string; category: string | undefined }[],
  dbDown: false,
}));

const CATEGORIES = [
  { id: 'c1', name: 'streaming app', slug: 'streaming-app', productCount: 19 },
  { id: 'c2', name: 'work space', slug: 'workspace', productCount: 3 },
];

const PRODUCT = {
  id: 'p1',
  name: 'เน็ตฟลิกซ์',
  slug: 'netflix',
  imageUrl: null,
  variants: [
    {
      id: 'v1',
      label: '1 เดือน',
      effectivePrice: 100,
      stock: 2,
      codeCount: 2,
    },
  ],
};

vi.mock('@/lib/data', () => ({
  getCategoriesWithProductCounts: async () => {
    if (h.dbDown) throw new Error('db down');
    return CATEGORIES;
  },
  getCatalogProducts: async (query: string, category: string | undefined) => {
    h.catalogCalls.push({ query, category });
    // Mirrors the real reader: an unknown slug matches nothing at all.
    if (category && !CATEGORIES.some((c) => c.slug === category)) {
      return { products: [], total: 0 };
    }
    return { products: [PRODUCT], total: 1 };
  },
}));

vi.mock('@/components/layout/FacebookLayout', () => ({
  FacebookLayout: (props: { children?: unknown; searchCategory?: string }) => {
    h.layoutCategory = props.searchCategory;
    return createElement('div', { 'data-layout': '1' }, props.children as never);
  },
}));
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('@/components/search/SearchToolbar', () => ({ SearchToolbar: () => null }));
vi.mock('@/components/search/CatalogSearchBox', () => ({ CatalogSearchBox: () => null }));
vi.mock('@/components/product/SearchProductCard', () => ({ SearchProductCard: () => null }));
vi.mock('@/components/ui/SiteMascot', () => ({ SiteMascot: () => null }));
vi.mock('@/components/ui/ClayIcons', () => ({ HamsterWorried: () => null }));

import SearchPage from '../src/app/search/page';

async function render(
  params: Record<string, string>,
  opts: { dbDown?: boolean } = {},
): Promise<{ html: string; layoutCategory: string | undefined; chipHrefs: string[] }> {
  h.layoutCategory = 'unset';
  h.catalogCalls = [];
  h.dbDown = opts.dbDown === true;
  const html = renderToStaticMarkup(
    (await SearchPage({ searchParams: Promise.resolve(params) })) as React.ReactElement,
  );
  // The chip row is the only `flex flex-wrap items-center gap-2` block; slice it
  // so breadcrumb / retry links cannot pollute the href assertions.
  const start = html.indexOf('flex flex-wrap items-center gap-2');
  expect(start, 'chip row not found in the rendered page').toBeGreaterThan(-1);
  const end = html.indexOf('</section>', start);
  const chipHrefs = [...html.slice(start, end).matchAll(/href="([^"]+)"/g)].map((m) =>
    m[1]!.replace(/&amp;/g, '&'),
  );
  return {
    html,
    layoutCategory: h.layoutCategory === 'unset' ? undefined : h.layoutCategory,
    chipHrefs,
  };
}

const ariaCurrentCount = (html: string): number =>
  (html.match(/aria-current="page"/g) ?? []).length;

describe('search filter state (render)', () => {
  it('R1 — a filtered landing has exactly one aria-current, on its chip', async () => {
    const { html, chipHrefs, layoutCategory } = await render({
      category: 'streaming-app',
      available: '1',
      sort: 'price-asc',
    });

    expect(ariaCurrentCount(html), 'expected exactly one current page element').toBe(1);
    // Locate the anchor that carries it: it must be one of the chip hrefs and
    // must name the category — i.e. the selected chip, never ทั้งหมด.
    const activeHref = (
      html.match(/<a[^>]*href="([^"]+)"[^>]*aria-current="page"/) ??
      html.match(/<a[^>]*aria-current="page"[^>]*href="([^"]+)"/)
    )?.[1]?.replace(/&amp;/g, '&');
    expect(activeHref, 'could not locate the current chip’s href').toBeTruthy();
    expect(chipHrefs, 'aria-current is not on a chip').toContain(activeHref);
    expect(activeHref).toContain('category=streaming-app');
    expect(layoutCategory, 'the chrome must know about the filter').toBe('streaming-app');
  });

  it('R2 — chip hrefs keep ?available= (and the sort) instead of dropping them', async () => {
    const { chipHrefs } = await render({
      category: 'streaming-app',
      available: '1',
      sort: 'price-asc',
    });

    expect(chipHrefs.length, 'expected ทั้งหมด + two category chips').toBe(3);
    for (const href of chipHrefs) {
      expect(href, `chip href lost the available filter: ${href}`).toContain('available=1');
      expect(href, `chip href lost the sort: ${href}`).toContain('sort=price-asc');
    }
    // ทั้งหมด must drop the category but keep the filter.
    const all = chipHrefs.find((href) => !href.includes('category='));
    expect(all, 'ทั้งหมด chip not found').toBeTruthy();
    expect(all).toContain('available=1');
  });

  it('R3 — an unknown slug is unfiltered, not a dead page with no current element', async () => {
    const { html, chipHrefs, layoutCategory } = await render({
      category: 'does-not-exist',
      available: '1',
    });

    expect(ariaCurrentCount(html), 'an unknown slug must still leave one current element').toBe(1);
    expect(layoutCategory, 'the chrome must not be told a phantom filter is active').toBeUndefined();
    expect(h.catalogCalls[0]?.category, 'the slug must not reach the reader').toBeUndefined();
    for (const href of chipHrefs) {
      expect(href, `phantom slug leaked into a chip href: ${href}`).not.toContain(
        'category=does-not-exist',
      );
      expect(href, `chip href lost the available filter: ${href}`).toContain('available=1');
    }
  });

  it('R4 — during a DB outage the requested filter is still announced as current', async () => {
    const { html, layoutCategory } = await render(
      { category: 'streaming-app', available: '1' },
      { dbDown: true },
    );

    // No chips could be loaded, so the filter has no chip of its own: the page
    // must still say where the visitor stands, and exactly once.
    expect(ariaCurrentCount(html), 'outage landing must keep exactly one current element').toBe(1);
    expect(html, 'the outage chip must name the requested category').toContain(
      '>streaming-app</span>',
    );
    expect(layoutCategory, 'the chrome must still know the filter').toBe('streaming-app');
  });
});
