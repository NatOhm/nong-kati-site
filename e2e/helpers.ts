import type { Page } from '@playwright/test';

/**
 * Composite WCAG 2.x relative-luminance contrast scanner, evaluated inside
 * the page. Mirrors the manual scan methodology used across prior audits:
 *
 * - Leaf text elements only (no children), visible (offsetParent / fixed).
 * - Foreground is the element's computed color.
 * - Background resolves the full ancestor chain, compositing every
 *   semi-transparent fill over its parent until an opaque layer (or the
 *   page base) is reached — the naive "first non-transparent ancestor"
 *   approach under- or over-states ratios on layered UIs.
 *
 * Returns failing pairs with the computed ratio so failures are
 * self-explanatory in CI logs.
 */
export interface ContrastIssue {
  text: string;
  ratio: number;
  cls: string;
  fg: string;
  bg: string;
}

export const SCAN_CONTRAST_FN = /* js */ `
  () => {
    function parse(c) {
      c = c.trim();
      if (c.startsWith('rgb')) {
        const inner = c.slice(c.indexOf('(') + 1, c.lastIndexOf(')'));
        const p = inner.split(',').map((s) => parseInt(s.trim()));
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      }
      if (c.startsWith('#')) {
        let h = c.slice(1);
        if (h.length === 3) h = h.split('').map((x) => x + x).join('');
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
      }
      return null;
    }
    function comp(fg, bg) {
      const a = fg.a === undefined ? 1 : fg.a;
      return {
        r: Math.round(fg.r * a + bg.r * (1 - a)),
        g: Math.round(fg.g * a + bg.g * (1 - a)),
        b: Math.round(fg.b * a + bg.b * (1 - a)),
        a: 1,
      };
    }
    function lum(c) {
      const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function ratio(a, b) {
      const l1 = lum(a), l2 = lum(b);
      return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
    }
    function bgChain(el) {
      let bg = null;
      let node = el;
      while (node && node !== document.documentElement) {
        const s = getComputedStyle(node);
        const c = parse(s.backgroundColor);
        if (c && c.a > 0) {
          bg = bg ? comp(c, bg) : c;
          if (c.a >= 1) break;
        }
        node = node.parentElement;
      }
      return bg;
    }
    const issues = [];
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length > 0) continue;
      // WCAG 1.4.3 governs *text*: a leaf with no text content is a divider,
      // dot, or decorative fill — out of scope (non-text graphics fall under
      // 1.4.11's separate 3:1 rule, not this gate).
      if (!(el.textContent || '').trim()) continue;
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
      if (el.namespaceURI && el.namespaceURI.indexOf('svg') > 0) continue;
      const s = getComputedStyle(el);
      const fg = parse(s.color);
      if (!fg) continue;
      let bg = bgChain(el);
      if (!bg) bg = isDark ? { r: 78, g: 56, b: 32, a: 1 } : { r: 255, g: 247, b: 237, a: 1 };
      const r = ratio(fg, bg);
      if (r < 4.5) {
        const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
        issues.push({
          text: (el.textContent || '').trim().slice(0, 30),
          ratio: r,
          cls: (el.className || '').toString().slice(0, 70),
          fg: hex(fg),
          bg: hex(bg),
        });
      }
    }
    // Dedupe by ratio+class — repeated identical components collapse to one row.
    const uniq = {};
    for (const i of issues) uniq[Math.round(i.ratio * 100) + '|' + i.cls] = i;
    return Object.values(uniq).sort((a, b) => a.ratio - b.ratio);
  }
`;

export async function scanContrast(page: Page): Promise<ContrastIssue[]> {
  // Passed as a string: wrap in parens + invoke — some Playwright builds
  // evaluate strings purely as expressions, so a bare "() => {...}" yields
  // the function object itself (serialized as undefined) instead of running.
  return page.evaluate(`(${SCAN_CONTRAST_FN})()`) as Promise<ContrastIssue[]>;
}

/**
 * Set the app theme via the no-FOUC localStorage key and reload.
 * The settle wait covers post-reload CSS transitions (theme color swaps and
 * the 550ms page-transition fade) — scanning mid-transition measures an
 * intermediate blended background and reports phantom violations.
 */
export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem('nk-theme', t);
  }, theme);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(700);
}

/**
 * Non-text leaves (empty textContent — dividers, carousel dots, cover
 * imagery) are skipped inside the scan itself: WCAG 1.4.3 is a text
 * criterion, so no signature list is needed and the gate cannot be
 * silently widened by unreviewed exclusions.
 */

/* ── Disabled-state gates (e2e/disabled-state.spec.ts) ─────────────────── */

export interface DisabledFinding {
  kind: 'cta-bg' | 'brand-glow';
  detail: string;
}

/**
 * Disabled-affordance scan (WCAG 1.4.1 companion to the contrast gate).
 * A disabled control must not masquerade as the primary CTA:
 *  - 'cta-bg'      — brand fill (peach-400 #fb923c / peach-500 #f97316 /
 *                    peach-600 #ea580c, incl. alpha tints) on a disabled
 *                    control — reserved for enabled CTAs.
 *  - 'brand-glow'  — the brand glow/clay-brand shadow, whose orange drop
 *                    reads as "this button will act".
 * The static counterpart of this rule lives in
 * tests/design-token-gates.test.ts (R4).
 */
export const DISABLED_SCAN_FN = /* js */ `
  () => {
    const findings = [];
    /* Brand fills after globals.css deepens bg-peach-500 → peach-700:
       peach-400 (251,146,60), peach-500 (249,115,22), peach-600 (234,88,12),
       peach-700 (194,65,12), peach-800 (154,52,18) — matched as (r,g) pairs. */
    const brandRe = /rgba?\\(\\s*(?:251,\\s*146|249,\\s*115|234,\\s*88|194,\\s*65|154,\\s*52)\\s*,/;
    const glowRe = /shadow-clay-brand|shadow-brand-glow/;
    for (const el of document.querySelectorAll('button[disabled], input[disabled], select[disabled], textarea[disabled], [aria-disabled="true"]')) {
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
      const label = ((el.getAttribute('aria-label') || el.textContent || '') + ' :: ' + el.className).trim().slice(0, 90);
      const s = getComputedStyle(el);
      /* The disabled:opacity-50 idiom leaves the brand fill in place but
         composites the whole element at ~50% — the computed backgroundColor
         stays opaque, so ghosting must also be read from element opacity.
         Either signal (fill alpha < 0.95 or opacity < 0.95) counts as a
         deliberately washed-out disabled state; only full-strength brand
         fills are CTA-look violations. */
      const m = /rgba?\\(([^)]+)\\)/.exec(s.backgroundColor);
      const parts = m ? m[1].split(',').map(function (x) { return parseFloat(x); }) : [];
      const fillAlpha = parts.length > 3 ? parts[3] : 1;
      const ghosted = fillAlpha < 0.95 || parseFloat(s.opacity) < 0.95;
      if (!ghosted && brandRe.test(s.backgroundColor)) {
        findings.push({ kind: 'cta-bg', detail: 'bg=' + s.backgroundColor + ' ' + label });
      }
      if (glowRe.test(s.boxShadow)) {
        findings.push({ kind: 'brand-glow', detail: 'shadow=' + s.boxShadow.slice(0, 120) + ' ' + label });
      }
    }
    return findings;
  }
`;

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseCssColor(input: string): Rgba | null {
  const s = input.trim();
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3)
      h = h
        .split('')
        .map((x) => x + x)
        .join('');
    if (h.length !== 6) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  if (s.startsWith('rgb')) {
    const inner = s.slice(s.indexOf('(') + 1, s.lastIndexOf(')'));
    const parts = inner
      .split(/[,.\s/]+/)
      .filter(Boolean)
      .map((p) => parseFloat(p));
    if (parts.length < 3) return null;
    return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
  }
  return null;
}

function comp(top: Rgba, bg: Rgba): Rgba {
  return {
    r: Math.round(top.r * top.a + bg.r * (1 - top.a)),
    g: Math.round(top.g * top.a + bg.g * (1 - top.a)),
    b: Math.round(top.b * top.a + bg.b * (1 - top.a)),
    a: 1,
  };
}

function luminance(c: Rgba): number {
  const f = (v: number): number => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/**
 * WCAG 2.x relative-luminance contrast ratio between two CSS colors,
 * computed Node-side from computed-style strings (rgb()/rgba()/hex).
 * A semi-transparent layer is composited over `pageBg` first, so ghosted
 * fills are judged on their effective color. Unparseable input returns 21
 * (the maximum) so an exotic value can never false-fail the gate.
 */
export function contrastRatio(fg: string, bg: string, pageBg: string): number {
  const f0 = parseCssColor(fg);
  const b0 = parseCssColor(bg);
  if (!f0 || !b0) return 21;
  const page = parseCssColor(pageBg) ?? { r: 255, g: 255, b: 255, a: 1 };
  const f = f0.a < 1 ? comp(f0, page) : f0;
  const b = b0.a < 1 ? comp(b0, page) : b0;
  const hi = Math.max(luminance(f), luminance(b));
  const lo = Math.min(luminance(f), luminance(b));
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
