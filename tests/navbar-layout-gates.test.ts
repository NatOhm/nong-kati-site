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
const PROFILE = path.join(process.cwd(), 'src/components/layout/ProfileMenu.tsx');
const NOTIFICATIONS = path.join(process.cwd(), 'src/components/layout/NotificationsDropdown.tsx');
const POPOVER = path.join(process.cwd(), 'src/components/ui/AnchoredPopover.tsx');
const CATALOG_SEARCH = path.join(process.cwd(), 'src/components/search/CatalogSearchBox.tsx');

let source = '';

/**
 * Strip block + line comments.
 *
 * Several of these components document the markup they *used* to have in
 * prose ("as an `absolute top-full` child this panel lost 291/295px"). A gate
 * that greps for that class list would otherwise match its own explanation
 * and fail, or worse, pass for the wrong reason.
 */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

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

  /**
   * G5 — every navbar popover escapes the row's overflow clip.
   *
   * Bug (Oct 4, 2026): all three popovers were `absolute top-full` children of
   * the justify-between row that carries `overflow-hidden`, so they were
   * cropped to the 56–64px bar: search 55/70px hidden, account 291/295px,
   * notifications 318/322px. `z-50` cannot defeat `overflow: hidden` — a clip
   * is applied after stacking.
   *
   * The fix is a portal (AnchoredPopover), NOT removing `overflow-hidden`:
   * that guard is what keeps the document from scrolling horizontally
   * (WCAG 1.4.10), which G1–G4 exist to protect. So this gate asserts the
   * popovers render through the portal and that the overflow guard survives.
   */
  it('G5 — popovers are portaled out of the overflow-clipped row', () => {
    const popover = readFileSync(POPOVER, 'utf-8');
    // The primitive must actually portal to document.body.
    expect(
      popover,
      'AnchoredPopover must render through createPortal into document.body, or it is clipped again',
    ).toMatch(/createPortal\(/);
    expect(popover).toMatch(/document\.body/);
    // Fixed positioning against the anchor rect, not absolute-in-the-row.
    expect(popover).toMatch(/position:\s*'fixed'/);

    // Each popover consumer must use the primitive, not a hand-rolled
    // `absolute top-full` panel. Comments are stripped first — these files
    // document the old `absolute top-full` markup in prose, and matching that
    // prose would make the gate fail on its own explanation.
    for (const [name, file] of [
      ['FacebookNavbar', NAVBAR],
      ['ProfileMenu', PROFILE],
      ['NotificationsDropdown', NOTIFICATIONS],
    ] as const) {
      const raw = readFileSync(file, 'utf-8');
      const src = stripComments(raw);
      expect(raw, `${name} must render its popover through AnchoredPopover`).toContain(
        'AnchoredPopover',
      );
      expect(
        src,
        `${name} reintroduced an \`absolute top-full\` popover → clipped by the row's overflow-hidden`,
      ).not.toMatch(/absolute[^"']*top-full/);
    }

    // The reflow guard itself must still be there — a portal is not a licence
    // to delete the WCAG 1.4.10 protection.
    expect(
      source,
      'the justify-between row lost overflow-hidden → the horizontal scrollbar the a11y audit removed is back',
    ).toMatch(/justify-between[^"']*overflow-hidden|overflow-hidden[^"']*justify-between/);
  });

  /**
   * G5b — the primitive MEASURES. A portal only escapes `overflow`; without
   * measurement a portaled panel still hangs off a short viewport. G6 below is
   * the bug this makes catchable.
   */
  it('G5b — the primitive measures and flips rather than assuming room below', () => {
    const popover = stripComments(readFileSync(POPOVER, 'utf-8'));
    expect(popover).toMatch(/getBoundingClientRect\(\)/);
    expect(popover).toMatch(/spaceBelow/);
    expect(popover).toMatch(/spaceAbove/);
    // Both axes are clamped into the viewport.
    expect(popover).toMatch(/vh\s*-\s*panelH\s*-\s*MARGIN/);
    expect(popover).toMatch(/vw\s*-\s*panelW\s*-\s*MARGIN/);
  });

  /**
   * G6 — the /search page suggestion list must be measured, not just portaled.
   *
   * A different bug from G5, found by measuring the live site rather than
   * reading the CSS. /search has NO clipping ancestor, so this panel was
   * never cropped — but it was an unpositioned `absolute top-full` child with
   * no idea how much room was left below. The list is up to 6 suggestions
   * (366px); at a 740x420 viewport it rendered from y=231 to y=597, putting
   * its bottom 177px past the fold so the last two suggestions were simply
   * unreachable. A portal alone does not fix that — the primitive has to
   * measure, which is why this asserts on the measurement itself.
   */
  it('G6 — the catalog search dropdown is portaled, width-matched and bounded', () => {
    const raw = readFileSync(CATALOG_SEARCH, 'utf-8');
    const src = stripComments(raw);

    expect(raw, 'CatalogSearchBox must render its list through AnchoredPopover').toContain(
      'AnchoredPopover',
    );
    expect(
      src,
      'CatalogSearchBox reintroduced an `absolute top-full` list → it will hang off the bottom of a short viewport',
    ).not.toMatch(/absolute[^"']*top-full/);

    // Once portaled, a `w-full` panel would resolve against <body> and span
    // the viewport instead of matching the input.
    expect(src).toMatch(/matchAnchorWidth/);
    // NOTE: the opening tag cannot be matched with a non-greedy `[\s\S]*?>`
    // — `open={open && suggestions.length > 0}` contains a `>` of its own, so
    // that pattern would stop mid-attribute and silently skip the checks
    // below. Slice up to the tag that closes it (`>` followed by a newline and
    // an indent), which is how this codebase formats these openings.
    const panelTag = src.match(/<AnchoredPopover[\s\S]*?\n\s*>/)?.[0] ?? '';
    expect(panelTag, 'AnchoredPopover usage not found').not.toBe('');
    expect(
      panelTag,
      'panel kept `w-full` after portaling → it now spans the whole viewport instead of the input width',
    ).not.toMatch(/\bw-full\b/);

    // A capped height is the second half of the fix: even if the viewport is
    // shorter than the natural list, the panel must scroll rather than vanish
    // below the fold.
    expect(panelTag).toMatch(/max-h-/);
    expect(panelTag).toMatch(/overflow-y-auto/);

    // The ad-hoc outside-click handler must be gone: the panel is no longer
    // inside boxRef, so `boxRef.contains(target)` would read every
    // suggestion click as an outside click.
    expect(
      src,
      'CatalogSearchBox kept its own boxRef.contains() outside-click test → clicks inside the portaled panel dismiss it',
    ).not.toMatch(/boxRef\.current\.contains/);
    expect(src, 'the popover must be handed an onClose handler').toMatch(/onClose=\{close\}/);
  });
});