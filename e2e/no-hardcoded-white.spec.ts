import { test, expect } from '@playwright/test';

import { setTheme } from './helpers';

/**
 * Hardcoded-white surface gate (rendered counterpart of the R5 static rule).
 *
 * The regression this guards: fixed `bg-white` classes survive into dark
 * mode and become unreadable cards (the /orders/lookup incident — 1.35:1).
 * The static gate bans the class; this gate catches any *rendered* near-
 * white opaque background that the CSS pipeline produces in dark mode,
 * regardless of which class caused it.
 *
 * Pages are scanned in DARK at the mobile viewport where the incident
 * happened. Elements inside a subtree marked `data-allow-hardcoded-white`
 * are exempt (PromptPay QR quiet zone, tax-invoice switch knob). A
 * built-in positive/negative control proves the scanner can see what it
 * claims to see on every run.
 */

const PAGES = [
  '/',
  '/search',
  '/account/login',
  '/account/register',
  '/orders/lookup',
  '/legal/privacy',
] as const;

const SCAN_WHITE_FN = /* js */ `
  () => {
    const findings = [];
    const isNearWhite = (r, g, b) => r >= 250 && g >= 250 && b >= 250;
    const bgChain = (el) => {
      let chain = [];
      let node = el.parentElement;
      while (node && node !== document.documentElement) {
        chain.push(node);
        node = node.parentElement;
      }
      return chain;
    };
    for (const el of document.querySelectorAll('body *')) {
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
      const s = getComputedStyle(el);
      const m = /rgba?\\(([^)]+)\\)/.exec(s.backgroundColor);
      if (!m) continue;
      const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
      const [r, g, b] = parts;
      const a = parts.length > 3 ? parts[3] : 1;
      if (!(r >= 250 && g >= 250 && b >= 250)) continue;
      if (a < 0.95) continue; // translucent overlays ghost — not "hardcoded white"
      if (el.closest('[data-allow-hardcoded-white]') || el.hasAttribute('data-allow-hardcoded-white')) continue;
      // Only flag surfaces large enough to matter (size/icon stamps are
      // handled by the contrast gates; this gate is about white CARDS).
      const rect = el.getBoundingClientRect();
      if (rect.width * rect.height < 48 * 48) continue;
      findings.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 80),
        bg: s.backgroundColor,
        size: Math.round(rect.width) + 'x' + Math.round(rect.height),
        text: (el.textContent || '').trim().slice(0, 40),
      });
    }
    return findings;
  }
`;

test.describe('no hardcoded white in dark mode', () => {
  for (const path of PAGES) {
    test(`${path}: no near-white opaque surfaces outside sanctioned markers`, async ({ page }) => {
      await page.goto(path);
      await setTheme(page, 'dark');
      // The marker must actually suppress: seed a sanctioned-looking node and
      // an unsanctioned one; the scanner must report ONLY the unsanctioned.
      const control = (await page.evaluate((fn) => {
        const allowed = document.createElement('div');
        allowed.setAttribute('data-allow-hardcoded-white', '');
        allowed.style.cssText =
          'position:fixed;left:0;top:0;width:60px;height:60px;background:#fff;';
        const banned = document.createElement('div');
        banned.style.cssText =
          'position:fixed;left:100px;top:0;width:60px;height:60px;background:#fff;';
        document.body.append(allowed, banned);
        const out = eval(fn)();
        allowed.remove();
        banned.remove();
        return out;
      }, SCAN_WHITE_FN)) as Array<{
        tag: string;
        cls: string;
        bg: string;
        size: string;
        text: string;
      }>;
      const bannedOnly = control.filter((f) => f.text === '' && f.size === '60x60');
      expect(
        control.length,
        'scanner control failed: marked element leaked or nothing detected at all',
      ).toBe(1);
      expect(bannedOnly.length, 'scanner control failed: unexpected extra findings').toBe(1);

      const findings = (await page.evaluate(`(${SCAN_WHITE_FN})()`)) as Array<{
        tag: string;
        cls: string;
        bg: string;
        size: string;
        text: string;
      }>;
      expect(
        findings,
        `${path}: near-white opaque surfaces rendered in DARK mode:\n` +
          findings
            .map((f) => `  <${f.tag} class="${f.cls}"> bg=${f.bg} ${f.size} "${f.text}"`)
            .join('\n'),
      ).toEqual([]);
    });
  }
});
