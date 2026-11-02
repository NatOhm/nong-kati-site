/**
 * Payment-surface contrast gate.
 *
 * The client reported text disappearing on the payment card. Cause: the
 * checkout surfaces used LIGHT-ONLY colour steps for their fills
 * (`bg-peach-50`, `bg-peach-100`) and their text (`text-jade-200`,
 * `bg-jade-900/20`) while the text tokens (`text-fg`, `text-fg-brand`, …)
 * flip with the theme. In dark mode — the shop's default — the selected
 * payment row measured 1.00:1 (fg-primary on peach-50): invisible.
 *
 *  P1 — payment surfaces never use a light-only fill as a card background.
 *       `bg-surface-brand-subtle` is the theme-aware equivalent.
 *  P2 — payment surfaces never use a dark-only green fill under light text
 *       unless both sides are pinned with a `dark:` override.
 *  P3 — the token pairs those surfaces now rely on clear 4.5:1 on BOTH
 *       themes, computed from src/styles/tokens.css itself (so a token edit
 *       that re-breaks dark mode fails here, not in the client's hand).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PAYMENT_DIRS = ['src/components/checkout', 'src/components/order', 'src/app/checkout'];

interface Violation {
  file: string;
  line: number;
  rule: 'P1' | 'P2';
  text: string;
}

function* walk(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // dir not present in this checkout
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield p;
  }
}

/** Light-only fills: cream in light mode, unreadable behind light-on-dark text. */
const LIGHT_ONLY_FILL = /(?<![\w-])bg-peach-(?:50|100)(?!\d)/;
/** Dark-only greens paired with near-white text in the old banners. */
const DARK_ONLY_FILL = /(?<![\w-])bg-jade-900(?:\/\d{1,3})?/;
const DARK_ONLY_TEXT = /(?<![\w-])text-jade-200(?<![\w-])/;

function scanPaymentSurfaces(): Violation[] {
  const out: Violation[] = [];
  for (const dir of PAYMENT_DIRS) {
    for (const file of walk(dir)) {
      const rel = file.split(path.sep).join('/');
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((raw, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(raw)) return;
          const code = raw.replace(/(?<!:)\/\/.*$/, '');
          const at = (rule: 'P1' | 'P2'): Violation => ({
            file: rel,
            line: i + 1,
            rule,
            text: raw.trim().slice(0, 160),
          });

          // P1 — a light-only fill needs an explicit dark override on the line.
          if (LIGHT_ONLY_FILL.test(code) && !/dark:bg-/.test(code)) out.push(at('P1'));

          // P2 — dark green fill / mint text must be pinned per theme.
          if (
            (DARK_ONLY_FILL.test(code) || DARK_ONLY_TEXT.test(code)) &&
            !/dark:(?:bg|text)-jade-/.test(code) &&
            !/data-allow-dark-chip/.test(code)
          ) {
            out.push(at('P2'));
          }
        });
    }
  }
  return out;
}

// ── Token maths ──────────────────────────────────────────────────────────

type Rgb = [number, number, number];

const parseHex = (v: string): Rgb => {
  const h = v.trim().replace(/^#/, '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
};

const relLum = (c: Rgb): number => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: Rgb, b: Rgb): number => {
  const la = relLum(a);
  const lb = relLum(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/** Flatten a translucent fill over its parent surface the way the browser does. */
const over = (fill: Rgb, alpha: number, bg: Rgb): Rgb =>
  fill.map((c, i) => Math.round(c * alpha + (bg[i] ?? 0) * (1 - alpha))) as Rgb;

/** Read every `--name: value;` declaration, grouped by the block it lives in. */
interface ThemeMaps {
  light: Map<string, string>;
  dark: Map<string, string>;
}

function parseTokens(): { root: Map<string, string>; themes: ThemeMaps } {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  const root = new Map<string, string>();
  const themes: ThemeMaps = { light: new Map(), dark: new Map() };
  let current: Map<string, string> = root;
  let block = '';
  for (const raw of css.split('\n')) {
    const line = raw.replace(/\/\*.*?\*\//g, '');
    if (/\{\s*$/.test(line)) {
      block = line;
      if (block.includes("[data-theme='dark']")) current = themes.dark;
      else if (block.includes("[data-theme='light']")) current = themes.light;
      continue;
    }
    if (/^\s*\}/.test(line)) {
      current = root;
      continue;
    }
    const m = /^\s*(--[\w-]+)\s*:\s*([^;]+);/.exec(line);
    if (m?.[1] && m[2]) current.set(m[1], m[2].trim());
  }
  return { root, themes };
}

const { root, themes } = parseTokens();

/** Resolve `var(--x)` chains to a hex colour, falling back to :root primitives. */
function color(token: string, scope: Map<string, string>): Rgb {
  const seen = new Set<string>();
  const read = (name: string): string => {
    if (seen.has(name)) throw new Error(`cyclic token ${name}`);
    seen.add(name);
    const raw = scope.get(name) ?? root.get(name);
    if (!raw) throw new Error(`unknown token ${name}`);
    const ref = /^var\(\s*(--[\w-]+)\s*\)$/.exec(raw);
    if (ref?.[1]) return read(ref[1]);
    if (!raw.startsWith('#')) throw new Error(`token ${name} is not a flat colour: ${raw}`);
    return raw;
  };
  return parseHex(read(token));
}

describe('payment surfaces keep their text readable in both themes', () => {
  it('P1/P2: no light-only fills or dark-only green pairs in checkout/order UI', () => {
    const violations = scanPaymentSurfaces();
    expect(
      violations,
      'payment UI pairs a theme-fixed fill/text with theme-flipping fg tokens ' +
        '(the 1.00:1 selected-method bug). Use bg-surface-brand-subtle and ' +
        'text-jade-700 dark:text-jade-200:\n' +
        violations.map((v) => `  ${v.rule} ${v.file}:${v.line} ${v.text}`).join('\n'),
    ).toEqual([]);
  });

  it('P3: light theme pairs clear 4.5:1', () => {
    const s = themes.light;
    const surface = color('--bg-surface', s);
    const subtle = color('--bg-brand-subtle', s);
    const pairs: Array<[string, Rgb, Rgb]> = [
      ['fg-primary on surface', color('--fg-primary', s), surface],
      ['fg-secondary on surface', color('--fg-secondary', s), surface],
      ['fg-primary on brand-subtle', color('--fg-primary', s), subtle],
      ['fg-brand on brand-subtle', color('--fg-brand', s), subtle],
      ['jade-700 on jade-500/15 chip', color('--jade-700', s), over(color('--jade-500', s), 0.15, surface)],
    ];
    for (const [label, fg, bg] of pairs) {
      expect(contrast(fg, bg), `${label} = ${contrast(fg, bg).toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('P3: dark theme pairs clear 4.5:1', () => {
    const s = themes.dark;
    const surface = color('--bg-surface', s);
    const subtle = color('--bg-brand-subtle', s);
    const pairs: Array<[string, Rgb, Rgb]> = [
      ['fg-primary on surface', color('--fg-primary', s), surface],
      ['fg-secondary on surface', color('--fg-secondary', s), surface],
      ['fg-primary on brand-subtle', color('--fg-primary', s), subtle],
      ['fg-brand on brand-subtle', color('--fg-brand', s), subtle],
      ['jade-200 on jade-500/15 chip', color('--jade-200', s), over(color('--jade-500', s), 0.15, surface)],
    ];
    for (const [label, fg, bg] of pairs) {
      expect(contrast(fg, bg), `${label} = ${contrast(fg, bg).toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('P3: the old selected-method pair is rejected by the same maths', () => {
    // Guard against a gate that trivially passes: cream fill under light text
    // must fail, or the assertions above prove nothing.
    const dark = themes.dark;
    const creamPeach50 = parseHex(root.get('--peach-50')!);
    const fgOnDark = color('--fg-primary', dark);
    expect(contrast(fgOnDark, creamPeach50)).toBeLessThan(2);
  });
});
