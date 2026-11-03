/**
 * Category-filter landing state (2026-11-03).
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
 *     raincoat-sized pill styling); ทั้งหมด is only current when no filter is set.
 *  2. the chrome — FacebookNavbar's /search entry drops aria-current while a
 *     category filter is in force, fed through FacebookLayout.
 *
 * Source-level gates: the rendered counterpart is the live HTML check
 * (exactly one aria-current="page", on the streaming chip).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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

describe('search category landing state', () => {
  it('C1 — the selected category chip announces itself', () => {
    const chips = chipSection();
    expect(
      chips,
      'the category chip lost aria-current → the filtered landing reads as unfiltered to a screen reader',
    ).toMatch(/aria-current=\{selected \? 'page' : undefined\}/);
    expect(chips, 'the per-chip selected flag is gone').toMatch(
      /const selected = category === cat\.slug;/,
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
    ).toMatch(/aria-current=\{!category \? 'page' : undefined\}/);
  });

  it('C4 — the page hands the filter to the chrome', () => {
    expect(page, '/search must pass its category filter to the layout').toContain(
      '<FacebookLayout searchCategory={category}>',
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
