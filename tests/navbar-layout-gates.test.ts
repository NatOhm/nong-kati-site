/**
 * Navbar layout regression gates (source-level scan).
 *
 * Bug (Oct 3, 2026): between roughly 768px and 1150px the header's three
 * clusters could not all keep their natural width. Because the center nav
 * was a plain flex child with no `shrink-0`, it absorbed the entire deficit
 * and squeezed the Thai labels to one glyph per line — measured live at
 * 900px: links 53–74px wide with 62–83px heights (3–4 wrapped lines) beside
 * a 14px-tall bar. Thai has no inter-word spaces, so a narrowing flex child
 * breaks between *glyphs*, which is what the screenshot showed.
 *
 * The fix makes the nav keep its natural width and lets the search field
 * yield instead. These gates are static so the regression can't come back
 * unnoticed; the rendered counterpart is a layout check at md/lg widths.
 *
 *  G1 — the center nav must be `shrink-0`. A shrinkable nav is the bug.
 *  G2 — each nav link must be `shrink-0 whitespace-nowrap`. Thai labels
 *       without this break one glyph per line as soon as space is tight.
 *  G3 — the search cluster must be allowed to shrink (`min-w-0` on the left
 *       cluster, the form and the input's flex wrapper). Without something
 *       yielding, G1/G2 just move the overflow to the right-hand edge and
 *       reintroduce the horizontal scroll the a11y audit removed.
 *  G4 — the right-hand action cluster stays `shrink-0` so it never gives up
 *       width and silently drops an affordance.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const NAVBAR = path.join(process.cwd(), 'src/components/layout/FacebookNavbar.tsx');

let source = '';

beforeAll(() => {
  source = readFileSync(NAVBAR, 'utf-8');
});

/** The nav container and the link inside it, located by their stable markers. */
function navContainer(): string {
  const start = source.indexOf('aria-label="เมนูหลัก"');
  expect(start, 'center nav markup not found — did the navbar change shape?').toBeGreaterThan(-1);
  // Walk back to the opening tag of the element carrying this attribute.
  const open = source.lastIndexOf('<nav', start);
  const close = source.indexOf('>', start);
  return source.slice(open, close);
}

function linkClassNames(): string {
  const navStart = source.indexOf('aria-label="เมนูหลัก"');
  const navEnd = source.indexOf('</nav>', navStart);
  const navMarkup = source.slice(navStart, navEnd);
  // The link is the <Link ...> whose className holds the pill styling.
  const match = navMarkup.match(/className=\{cn\(([\s\S]*?)\)\}/);
  expect(match?.[1], 'nav link className not found').toBeTruthy();
  return match?.[1] ?? '';
}

describe('navbar layout gates', () => {
  it('G1 — center nav keeps its natural width (shrink-0)', () => {
    expect(navContainer()).toMatch(/\bshrink-0\b/);
  });

  it('G2 — nav links never wrap mid-label (shrink-0 + whitespace-nowrap)', () => {
    const classes = linkClassNames();
    expect(classes, 'nav link lost shrink-0 → labels will squeeze to one glyph per line').toMatch(
      /\bshrink-0\b/,
    );
    expect(
      classes,
      'nav link lost whitespace-nowrap → Thai labels will break between glyphs',
    ).toMatch(/\bwhitespace-nowrap\b/);
  });

  it('G3 — the search cluster can yield width instead of the nav', () => {
    // Left cluster + form + the input's wrapper all need min-w-0 for the
    // flex shrink to reach the input rather than clipping it.
    const minW0Count = (source.match(/\bmin-w-0\b/g) ?? []).length;
    expect(
      minW0Count,
      'search cluster lost its min-w-0 chain → nav keeps its width but the page gains a horizontal scrollbar',
    ).toBeGreaterThanOrEqual(3);
    // The search input itself must flex so the field absorbs the deficit.
    const inputTag = source.match(/<input[\s\S]*?\/>/)?.[0] ?? '';
    expect(inputTag, 'search input not found').not.toBe('');
    expect(inputTag).toMatch(/\bflex-1\b/);
    expect(inputTag).toMatch(/\bmin-w-0\b/);
  });

  it('G4 — right-hand action cluster is shrink-0', () => {
    // The cluster holding CartIcon / NotificationsDropdown / ProfileMenu.
    const start = source.indexOf('{/* Right: Actions');
    expect(start, 'right-hand cluster not found').toBeGreaterThan(-1);
    const close = source.indexOf('>', source.indexOf('className="flex', start));
    expect(source.slice(start, close)).toMatch(/\bshrink-0\b/);
  });
});