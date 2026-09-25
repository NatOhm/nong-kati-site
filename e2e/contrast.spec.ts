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
}
