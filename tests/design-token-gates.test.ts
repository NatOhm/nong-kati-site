/**
 * Design-token regression gates (source-level scan).
 *
 * Walks every .ts/.tsx file under src/ as raw text and enforces the colour
 * pairing rules that came out of the a11y audit rounds. These gates are
 * static: they catch a forbidden class pairing the moment it is typed, with
 * no browser needed. The dynamic counterparts (rendered contrast ≥ 4.5:1 and
 * disabled-affordance checks) live in e2e/contrast.spec.ts and
 * e2e/disabled-state.spec.ts.
 *
 *  R1 — coral text on light surfaces. `text-coral-600/700/…` measures
 *       2.6–4.1:1 on cream/white — below AA. Error text must use the
 *       semantic `text-fg-error`. Only dark-scoped `dark:text-coral-200|300|400`
 *       tints are sanctioned (they clear 4.5:1 on cocoa surfaces).
 *  R2 — coral tint fills (`bg-coral-50…500`, incl. alpha) must pair with
 *       `text-fg-error` in the same rule. Coral-on-coral tints are 1.9–3.3:1.
 *  R3 — no white text on coral-50…600 fills. Only `bg-coral-700` and darker
 *       keep white ≥ 4.5:1 (this was the cart-count badge: white on
 *       coral-500 = 2.89:1, now coral-700 = 5.42:1).
 *  R4 — `disabled:` variants must never reach for the brand fills
 *       (`bg-peach-400/500/600`) or brand glow shadows — a disabled control
 *       that looks like the primary CTA defeats the affordance (WCAG 1.4.1).
 *       Ternary-styled disabled states (no `disabled:` utilities) are covered
 *       dynamically by e2e/disabled-state.spec.ts.
 *  R5 — no hardcoded `bg-white` outside the two sanctioned components.
 *       Fixed white dies in dark mode (the /orders/lookup card regression:
 *       label 1.35:1). Only the PromptPay QR (true-white quiet zone is
 *       required for scanner reliability) and the tax-invoice switch knob
 *       may opt out — and only while their file carries the
 *       `data-allow-hardcoded-white` marker. The rendered counterpart
 *       (near-white computed backgrounds in dark) lives in
 *       e2e/no-hardcoded-white.spec.ts.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

interface Violation {
  file: string;
  line: number;
  rule: string;
  text: string;
}

/** Coral tints that still read as error surfaces when paired with text-fg-error. */
const CORAL_TINT = /bg-coral-(?:50|100|200|300|400|500)(?:\/\d{1,3})?/;
/** Coral fills light/mid enough that white text on them fails 4.5:1. */
const CORAL_SOLID = /bg-coral-(?:50|100|200|300|400|500|600)(?:\/\d{1,3})?/;
const WHITE_TEXT = /(?<![\w-])text-white(?![\w-])/;
const DISABLED_BRAND_BG = /disabled:bg-peach-(?:400|500|600)(?!\d)/;
const DISABLED_BRAND_GLOW = /disabled:shadow-(?:brand-glow|clay-brand)/;

/** Dark-scope coral shades that clear 4.5:1 on the cocoa surfaces. */
const DARK_OK_SHADES = new Set(['200', '300', '400']);

/** Tailwind `bg-white` and its alpha variants (not bg-whitesmoke etc). */
const BG_WHITE = /(?<![\w-])bg-white(?:\/\d{1,3})?(?![\w-])/;

/**
 * Files allowed to hardcode white backgrounds, with the reason each opt-out
 * exists. Everything else fails R5.
 */
const HARDCODED_WHITE_FILES: Record<string, string> = {
  'src/components/checkout/PromptPayQR.tsx':
    'PromptPay QR quiet zone — must stay true white to scan on any theme',
  'src/components/checkout/TaxInvoiceToggle.tsx':
    'switch knob — white-on-track affordance kept on both themes',
};

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield p;
  }
}

/**
 * Structured exemptions — every entry is a reviewed, commented exception.
 * `content` is matched as a substring of the source line (line numbers
 * drift between edits; content does not). Anything not listed here still
 * fails the gate.
 *
 *  R1 — coral *text* on light surfaces is banned, but these hits are lucide
 *       SVG *icons*: WCAG 1.4.3 governs text, not stroke decoration
 *       (non-text contrast is judged by the rendered e2e gates).
 *  R2 — STATUS_CONFIG / HBar carry the tint fill on one line and its
 *       meaning (or no text at all) elsewhere; the pairing is enforced by
 *       the component's types + the rendered contrast gates.
 */
const ALLOWLIST: ReadonlyArray<{
  rule: 'R1' | 'R2';
  file: string;
  content: string;
  why: string;
}> = [
  // ── R1: decorative lucide icons (non-text) ──
  {
    rule: 'R1',
    file: 'src/app/account/wallet/page.tsx',
    content: 'TrendingDown size={18}',
    why: 'decorative icon',
  },
  {
    rule: 'R1',
    file: 'src/app/account/wishlist/page.tsx',
    content: 'Heart size={44}',
    why: 'decorative icon',
  },
  {
    rule: 'R1',
    file: 'src/components/home/StatsCounter.tsx',
    content: 'Package size={22}',
    why: 'decorative icon',
  },
  {
    rule: 'R1',
    file: 'src/components/home/StatsCounter.tsx',
    content: 'BarChart3 size={22}',
    why: 'decorative icon',
  },
  {
    rule: 'R1',
    file: 'src/components/home/TrustBadges.tsx',
    content: 'Headphones size={24}',
    why: 'decorative icon',
  },
  {
    rule: 'R1',
    file: 'src/components/layout/FacebookSidebar.tsx',
    content: "label: 'ดูหนัง/ซีรีส์'",
    why: 'color reaches the lucide Icon only',
  },
  {
    rule: 'R1',
    file: 'src/components/product/WishlistButton.tsx',
    content: "wished ? 'text-coral-500'",
    why: 'Heart icon state colour',
  },
  // ── R2: tint fills whose text partner is not on the same line ──
  {
    rule: 'R2',
    file: 'src/app/management/dashboard/page.tsx',
    content: "item.stock <= 3 ? 'bg-coral-500'",
    why: 'HBar fill — non-text graphic',
  },
  {
    rule: 'R2',
    file: 'src/components/order/OrderStatusBadge.tsx',
    content: "bgClass: 'bg-coral-50',",
    why: 'textClass text-fg-error sits on the adjacent line',
  },
];

const allowed = (rel: string, raw: string, rule: 'R1' | 'R2'): boolean =>
  ALLOWLIST.some((a) => a.rule === rule && rel.endsWith(a.file) && raw.includes(a.content));

function scanSource(): {
  r1: Violation[];
  r2: Violation[];
  r3: Violation[];
  r4: Violation[];
  r5: Violation[];
  r5marker: Violation[];
} {
  const r1: Violation[] = [];
  const r2: Violation[] = [];
  const r3: Violation[] = [];
  const r4: Violation[] = [];
  const r5: Violation[] = [];
  const r5marker: Violation[] = [];

  for (const file of walk('src')) {
    const rel = file.split(path.sep).join('/');
    const lines = readFileSync(file, 'utf8').split('\n');

    lines.forEach((raw, i) => {
      // Skip doc/comment lines — the rules themselves are documented with
      // the very class names they forbid.
      if (/^\s*(\/\/|\*|\/\*)/.test(raw)) return;
      const code = raw.replace(/(?<!:)\/\/.*$/, '');
      if (!code.includes('coral-') && !code.includes('disabled:')) return;

      const at = (rule: string): Violation => ({
        file: rel,
        line: i + 1,
        rule,
        text: raw.trim().slice(0, 160),
      });

      // R1 — light-scope coral text.
      const textCoral = /text-coral-(\d{3})/g;
      let m: RegExpExecArray | null;
      while ((m = textCoral.exec(code)) !== null) {
        const prefix = code.slice(Math.max(0, m.index - 12), m.index);
        const darkScoped = /(?:^|[\s'"`{])dark:$/.test(prefix);
        if (!darkScoped || !DARK_OK_SHADES.has(m[1] ?? '')) {
          if (!allowed(rel, raw, 'R1')) r1.push(at('R1'));
          break;
        }
      }

      // R2 — tint fill without the fg-error partner.
      if (CORAL_TINT.test(code) && !/text-fg-error/.test(code)) {
        if (!allowed(rel, raw, 'R2')) r2.push(at('R2'));
      }

      // R3 — white text on light/mid coral fills.
      if (CORAL_SOLID.test(code) && WHITE_TEXT.test(code)) r3.push(at('R3'));

      // R4 — brand-styled disabled variants.
      if (code.includes('disabled:')) {
        if (DISABLED_BRAND_BG.test(code) || DISABLED_BRAND_GLOW.test(code)) r4.push(at('R4'));
      }
    });

    // R5 — hardcoded white surfaces. File-level allowlist: any bg-white in a
    // file not listed here fails, and allowlisted files must keep their
    // data-allow-hardcoded-white marker (a silent marker removal re-enables
    // the gate).
    if (BG_WHITE.test(readFileSync(file, 'utf8'))) {
      const why = HARDCODED_WHITE_FILES[rel];
      if (!why) {
        r5.push({ file: rel, line: 0, rule: 'R5', text: 'bg-white is banned here' });
      } else if (!readFileSync(file, 'utf8').includes('data-allow-hardcoded-white')) {
        r5marker.push({
          file: rel,
          line: 0,
          rule: 'R5',
          text: 'allowlisted file lost its data-allow-hardcoded-white marker',
        });
      }
      void why;
    }
  }

  return { r1, r2, r3, r4, r5, r5marker };
}

const fmt = (list: Violation[]): string =>
  list.map((v) => `  ${v.file}:${v.line} ${v.text}`).join('\n');

let gates: ReturnType<typeof scanSource>;

beforeAll(() => {
  gates = scanSource();
});

describe('design-token regression gates (source scan)', () => {
  it('R1: no light-scope coral text — semantic fg tokens only', () => {
    expect(
      gates.r1,
      'coral text on light surfaces (2.6–4.1:1, below AA). Use text-fg-error; ' +
        `only dark:text-coral-200/300/400 is sanctioned:\n${fmt(gates.r1)}`,
    ).toEqual([]);
  });

  it('R2: coral tint fills pair with text-fg-error in the same rule', () => {
    expect(
      gates.r2,
      `coral tint without text-fg-error (coral-on-coral is 1.9–3.3:1):\n${fmt(gates.r2)}`,
    ).toEqual([]);
  });

  it('R3: no white text on coral-50…600 fills — only coral-700+ stays AA', () => {
    expect(
      gates.r3,
      `white text on a light/mid coral fill (<4.5:1). Use bg-coral-700 or darker:\n${fmt(gates.r3)}`,
    ).toEqual([]);
  });

  it('R4: disabled: variants never use brand fills or brand glow', () => {
    expect(
      gates.r4,
      `disabled state styled like the primary CTA (peach fill / brand glow):\n${fmt(gates.r4)}`,
    ).toEqual([]);
  });

  it('R5: no hardcoded bg-white outside the sanctioned QR/knob files', () => {
    expect(
      gates.r5,
      'hardcoded bg-white returns (dies in dark mode). Use bg-surface, or if ' +
        'white is genuinely required (QR quiet zone, switch knob), move the ' +
        `element into an allowlisted file with a data-allow-hardcoded-white marker:\n${fmt(gates.r5)}`,
    ).toEqual([]);
    expect(
      gates.r5marker,
      `allowlisted files must keep their opt-out marker:\n${fmt(gates.r5marker)}`,
    ).toEqual([]);
  });
});
