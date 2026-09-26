import { test, expect } from '@playwright/test';

import { scanContrast, setTheme } from './helpers';

/**
 * WCAG 1.4.3 contrast gate — every key storefront page × both themes.
 * Threshold 4.5:1 for text; the scanner measures text-bearing leaves only
 * (non-text graphics are a separate 1.4.11 concern, out of this gate).
 */
const PAGES = ['/', '/search', '/account/login', '/account/register'] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`contrast ${theme}`, () => {
    for (const path of PAGES) {
      test(`${path} has no text below 4.5:1`, async ({ page }) => {
        await page.goto(path);
        await setTheme(page, theme);
        const issues = await scanContrast(page);
        expect(
          issues,
          `${theme} ${path}: text contrast below 4.5:1:\n` +
            issues
              .map((i) => `  ${i.ratio}:1 "${i.text}" fg=${i.fg} bg=${i.bg} (${i.cls})`)
              .join('\n'),
        ).toEqual([]);
      });
    }
  });

  // Audit round 4 #2 (systemic #3): the previous gate passed login because it
  // never OPENED the error state — the hardcoded coral-on-light alert that
  // renders on a failed sign-in was 1.04:1 in dark mode. Inject the same
  // alert markup the app renders (semantic tokens) into both themes and gate it.
  test.describe(`error-state contrast ${theme}`, () => {
    for (const role of ['login', 'lookup']) {
      test(`${role} error alert passes 4.5:1`, async ({ page }) => {
        await page.goto('/account/login');
        await setTheme(page, theme);
        await page.evaluate((r) => {
          const div = document.createElement('div');
          div.id = 'probe-error';
          div.setAttribute('role', 'alert');
          div.className =
            r === 'login'
              ? 'rounded-md border border-error bg-error px-3 py-2 text-sm text-fg-error'
              : 'rounded-md border border-error bg-error px-3 py-2 text-sm text-fg-error';
          div.textContent = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';
          document.querySelector('main')?.appendChild(div);
        }, role);
        const issues = await scanContrast(page);
        const probe = issues.filter((i) => i.text.includes('อีเมลหรือรหัสผ่าน'));
        expect(
          probe,
          `${theme} ${role} error alert below 4.5:1:\n` +
            probe.map((i) => `  ${i.ratio}:1 fg=${i.fg} bg=${i.bg}`).join('\n'),
        ).toEqual([]);
      });
    }
  });
}
