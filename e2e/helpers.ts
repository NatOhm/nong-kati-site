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
        issues.push({
          text: (el.textContent || '').trim().slice(0, 30),
          ratio: r,
          cls: (el.className || '').toString().slice(0, 70),
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

/** Set the app theme via the no-FOUC localStorage key and reload. */
export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem('nk-theme', t);
  }, theme);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Non-text leaves (empty textContent — dividers, carousel dots, cover
 * imagery) are skipped inside the scan itself: WCAG 1.4.3 is a text
 * criterion, so no signature list is needed and the gate cannot be
 * silently widened by unreviewed exclusions.
 */
