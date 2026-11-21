/**
 * Colour utilities must resolve to a real CSS rule.
 *
 * A Tailwind class that names a token which does not exist is silently
 * discarded: the element renders with no colour at all. That is how the shop
 * lost three modal scrims (`bg-overlay`), the inventory form fields
 * (`bg-surface-raised`), the PDPA/ProfileMenu error fills (`bg-error0/15`),
 * and 38 success labels (`text-jade-600` — `jade` has no 600 step). None of
 * them produced a single line of CSS, and none of them failed a build, a
 * type check or a lint.
 *
 * The gate compiles every colour-ish utility found under `src/` through the
 * project's own Tailwind config and asserts each one emits a rule. Two
 * sources count as "defined":
 *
 *   1. Tailwind itself — the class appears as a selector in the compiled
 *      utilities layer.
 *   2. Hand-authored CSS — the class is written as a selector in a `.css`
 *      file under `src/` (e.g. `.text-thai` in `globals.css`, the Thai
 *      word-break rule). Authored classes are read from the stylesheets, not
 *      hardcoded here, so adding one does not need a code change.
 *
 * Nothing is baselined. The second wave of dead classes — opacity modifiers
 * on tokens declared as a bare `var(--x)` (`bg-surface/80`,
 * `border-line-subtle/30`, `text-fg-error/70`, …) and two shadow steps that
 * were never wired (`shadow-clay-md`, `shadow-inset-sm`) — were fixed at the
 * token level: tokens.css publishes rgb channel triples and wires
 * `--shadow-inset-sm`, so those classes now compile like any other.
 *
 * Deliberately NOT checked: arbitrary values (`bg-[#fff]`), because the
 * extractor stops at `[` and the compiler already rejects a malformed one at
 * build time; and dynamic construction (`bg-${x}`), which cannot be resolved
 * statically — `src/` has none, and a new one should be caught in review.
 *
 * CU2 is the gate's own negative control: the detector must still call three
 * provably dead classes dead. If the compile step ever degrades to an empty
 * sheet, CU1 would pass on nothing; CU2 turns that into a failure.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { beforeAll, describe, expect, it } from 'vitest';

import config from '../tailwind.config';

const SRC = path.join(__dirname, '..', 'src');

/** Colour-ish utility prefixes. Bare `text-` (from `text-[11px]`) does not match. */
const COLOUR_BASE =
  /^(?:bg|text|border(?:-[trblxyse])?|ring|ring-offset|divide|outline|fill|stroke|from|via|to|shadow|caret|accent|placeholder|decoration)-[a-z0-9]/;

/** Token shape: no brackets, so arbitrary values are skipped, never misread. */
const TOKEN = /[A-Za-z0-9_:/.%!#-]+/g;

interface Hit {
  cls: string;
  file: string;
  line: number;
}

function* walk(dir: string, ext: RegExp): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p, ext);
    else if (ext.test(entry.name)) yield p;
  }
}

const rel = (p: string): string => path.relative(SRC, p).split(path.sep).join('/');

/** `.bg-jade-500\/15.text-jade-700` → both class names, unescaped. */
const unescape = (s: string): string => s.replace(/\\(.)/g, '$1');

function classNamesInCss(css: string): Set<string> {
  const out = new Set<string>();
  // Blank out comments first: the stylesheet documents dead class names.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/\.((?:\\[\s\S]|[A-Za-z0-9_-])+)/g)) {
    const cls = unescape(m[1] ?? '');
    if (cls) out.add(cls);
  }
  return out;
}

/** Classes written by hand in any stylesheet under src/. */
function authoredClasses(): Set<string> {
  const out = new Set<string>();
  for (const file of walk(SRC, /\.css$/)) {
    for (const cls of classNamesInCss(readFileSync(file, 'utf8'))) out.add(cls);
  }
  return out;
}

/** Blank a block comment out but keep every newline, so line numbers survive. */
const blankComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** Every colour utility mentioned in src/, with where it was found. */
function colourHits(): Hit[] {
  const hits = new Map<string, Hit>();
  for (const file of walk(SRC, /\.(ts|tsx)$/)) {
    const lines = blankComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((raw, i) => {
      // Skip `//` comment lines and trailing `//` comments — the rules are
      // documented with the very class names they talk about.
      if (/^\s*\/\//.test(raw)) return;
      const line = raw.replace(/(?<!:)\/\/.*$/, '');
      for (const m of line.matchAll(TOKEN)) {
        const token = (m[0] ?? '').replace(/\.+$/, '');
        if (!token || token.includes('$')) continue;
        // `text-anchor="middle"` is an SVG attribute, not a class.
        if (line[m.index! + (m[0] ?? '').length] === '=') continue;
        const base = token.slice(token.lastIndexOf(':') + 1);
        if (!COLOUR_BASE.test(base)) continue;
        if (!hits.has(token)) hits.set(token, { cls: token, file: rel(file), line: i + 1 });
      }
    });
  }
  return [...hits.values()];
}

async function compile(classes: string[]): Promise<Set<string>> {
  const result = await postcss([
    tailwindcss({
      ...config,
      // Only what we hand it: the real content globs would add noise and time.
      content: [{ raw: classes.join(' '), extension: 'html' }],
    }),
  ]).process('@tailwind utilities;', { from: undefined });

  const emitted = new Set<string>();
  result.root.walkRules((rule) => {
    for (const cls of classNamesInCss(rule.selector)) emitted.add(cls);
  });
  return emitted;
}

let dead: Hit[];
let checked = 0;

beforeAll(async () => {
  const authored = authoredClasses();
  const base = (cls: string): string => cls.slice(cls.lastIndexOf(':') + 1);
  const hits = colourHits();
  const candidates = hits.map((h) => h.cls).filter((cls) => !authored.has(base(cls)));
  checked = candidates.length;
  const emitted = await compile(candidates);
  dead = hits.filter((h) => !emitted.has(h.cls) && !authored.has(base(h.cls)));
}, 120_000);

describe('colour utilities resolve to CSS', () => {
  it('CU1: every colour utility in src/ emits a Tailwind rule (or is authored CSS)', () => {
    expect(checked, 'no colour utilities were found — the scanner is broken').toBeGreaterThan(100);
    expect(
      dead.map((d) => `${d.file}:${d.line}  ${d.cls}`),
      'These classes compile to no CSS, so they render nothing. Use a token that ' +
        'exists in tailwind.config.ts (check the step: jade has no 600, topaz has no ' +
        '600/50, crimson has no 600), or a semantic token such as bg-surface-overlay / ' +
        'bg-surface-elevated / text-fg-success. An opacity modifier only works on a ' +
        'colour declared as rgb(… / <alpha-value>) — add a channel triple to tokens.css ' +
        'rather than dropping the alpha:\n' +
        dead.map((d) => `  - ${d.file}:${d.line}  ${d.cls}`).join('\n'),
    ).toEqual([]);
  });

  it('CU2: negative control — provably dead classes are still reported as dead', async () => {
    // If the compile step ever degrades (empty sheet, wrong config), CU1 would
    // pass on nothing. These three shipped and emitted no CSS; the live class
    // in the same run proves the pipeline is compiling, not just silent.
    const emitted = await compile([
      'bg-jade-600',
      'bg-overlay',
      'bg-surface-raised',
      'text-fg-success',
    ]);
    expect(emitted.has('text-fg-success'), 'the compiler produced nothing at all').toBe(true);
    expect([...emitted].filter((c) => c !== 'text-fg-success')).toEqual([]);
  });
});
