import { test, expect } from '@playwright/test';

/**
 * Landmark & heading structure — WCAG 1.3.1 / best practice:
 * exactly one <main> per page, a keyboard-reachable skip link as the first
 * focusable element targeting it, and a visible page-level <h1>.
 */
const PAGES = ['/', '/search', '/account/login', '/account/register'] as const;

test.describe('landmark structure', () => {
  for (const path of PAGES) {
    test(`${path}: single main + skip link + visible h1`, async ({ page }) => {
      await page.goto(path);

      // Exactly one main landmark. Auto-retrying expect (not a raw count())
      // because dev-mode streaming can resolve goto before the client
      // layout's <main> is committed to the DOM.
      await expect(page.locator('main'), `${path}: expected exactly one <main>`).toHaveCount(1);

      // Skip link exists and targets the main landmark.
      const skip = page.getByRole('link', { name: 'ข้ามไปยังเนื้อหาหลัก' });
      await expect(skip, `${path}: skip link missing`).toHaveCount(1);
      const skipHref = await skip.getAttribute('href');
      expect(skipHref).toBe('#main-content');

      // Skip link is the first focusable element on the page.
      await page.keyboard.press('Tab');
      const firstFocused = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        text: document.activeElement?.textContent?.trim().slice(0, 30),
      }));
      expect(
        firstFocused.tag === 'A' && firstFocused.text?.includes('ข้าม'),
        `${path}: first Tab focus should land on the skip link, got <${firstFocused.tag}> "${firstFocused.text}"`,
      ).toBe(true);

      // The skip target is the main landmark.
      await expect(page.locator('main#main-content')).toHaveCount(1);

      // A visible H1 anchors the page (24px+ bold on search per audit #8;
      // every storefront page renders one) — and exactly one of them.
      await expect(page.locator('h1'), `${path}: expected exactly one h1`).toHaveCount(1);
      const h1 = page.locator('h1').first();
      const visible = await h1.evaluate((el) => {
        const s = getComputedStyle(el);
        return (
          s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().height > 0
        );
      });
      expect(visible, `${path}: h1 is present but not visible`).toBe(true);
    });
  }
});
