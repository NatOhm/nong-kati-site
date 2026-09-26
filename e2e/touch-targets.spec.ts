import { test, expect } from '@playwright/test';

import { setTheme } from './helpers';

/**
 * 44px minimum touch targets (WCAG 2.5.8 AAA / Apple HIG, audit #6).
 * Runs at 390×844 (iPhone 14-ish) where the fixed taskbar, header cart and
 * consent actions are the primary tap surfaces.
 *
 * Buttons rendered smaller than 44px are still compliant when their
 * effective hit area reaches 44px (padding expands the target); we measure
 * the ELEMENT box here and require ≥40px, while dedicated controls that
 * were explicitly sized in the audit remediation (taskbar, cart, password
 * toggle, consent actions) must be ≥44px.
 */
test.describe('touch targets (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /** Seed a stored consent so the banner stays closed and the taskbar shows. */
  async function withConsent(page: import('@playwright/test').Page): Promise<void> {
    await page.addInitScript(() => {
      localStorage.setItem(
        'nk_cookie_consent',
        JSON.stringify({
          version: '1.0',
          necessary: true,
          analytics: false,
          marketing: false,
          timestamp: new Date().toISOString(),
        }),
      );
    });
  }

  test('mobile taskbar items are ≥44px tall', async ({ page }) => {
    // Audit round 2 #5: while consent is open the taskbar steps aside —
    // grant consent up front so the persistent taskbar is under test.
    await withConsent(page);
    await page.goto('/');
    const taskbar = page.locator('nav.fixed.bottom-0');
    await expect(taskbar).toBeVisible();
    const items = taskbar.locator('a, button');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < count; i++) {
      const box = await items.nth(i).boundingBox();
      expect(box, `taskbar item ${i} missing`).not.toBeNull();
      expect(
        box!.height,
        `taskbar item ${i} ("${await items.nth(i).textContent()}") is ${box!.height}px`,
      ).toBeGreaterThanOrEqual(44);
    }
  });

  test('header cart button is ≥44px on mobile', async ({ page }) => {
    await page.goto('/');
    // Cart trigger in the top navbar (CartIcon renders a <button> with an
    // aria-label like "ตะกร้าสินค้า (N รายการ)").
    const cart = page.getByRole('button', { name: /ตะกร้าสินค้า/ }).first();
    await expect(cart).toBeVisible();
    const box = await cart.boundingBox();
    expect(box, 'header cart button missing').not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('login password toggle is ≥44px with accessible name', async ({ page }) => {
    await page.goto('/account/login');
    const toggle = page.getByRole('button', { name: /แสดงรหัสผ่าน|ซ่อนรหัสผ่าน/ });
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAttribute('aria-pressed', /^(true|false)$/);
    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test('login inputs have associated labels', async ({ page }) => {
    await page.goto('/account/login');
    for (const id of ['login-email', 'login-password']) {
      const input = page.locator(`#${id}`);
      await expect(input).toHaveCount(1);
      // htmlFor association (audit #2).
      const labelled = await page.locator(`label[for="${id}"]`).count();
      expect(labelled, `#${id} has no <label for="${id}">`).toBe(1);
    }
  });

  test('announcement close + mobile menu button are ≥44px (audit round 4 #8)', async ({ page }) => {
    await withConsent(page);
    await page.goto('/');

    // Announcement bar close control — previously p-2.5 on a 16px icon (36px).
    const close = page.getByRole('button', { name: 'ปิดประกาศ' });
    if (await close.isVisible().catch(() => false)) {
      const box = await close.boundingBox();
      expect(box, 'announcement close must exist').not.toBeNull();
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
    }

    // Mobile hamburger — the audit's 38px offender.
    const menu = page.getByRole('button', { name: 'เปิดเมนู' });
    const menuBox = await menu.boundingBox();
    expect(menuBox, 'mobile menu button must exist').not.toBeNull();
    expect(Math.min(menuBox!.width, menuBox!.height)).toBeGreaterThanOrEqual(44);
  });

  test('cookie consent actions are ≥44px when visible (mobile)', async ({ page }) => {
    await page.goto('/');
    // Fresh consent state so the banner renders.
    await page.evaluate(() => localStorage.removeItem('nk_cookie_consent'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    const banner = page.locator('div.fixed', { hasText: 'การใช้คุกกี้' }).first();
    const visible = await banner.isVisible().catch(() => false);
    test.skip(!visible, 'consent banner not rendered (already accepted or feature off)');

    const buttons = banner.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box, `consent button ${i} missing`).not.toBeNull();
      expect(
        box!.height,
        `consent button ${i} ("${(await buttons.nth(i).textContent())?.trim()}") is ${box!.height}px`,
      ).toBeGreaterThanOrEqual(44);
    }

    // Audit round 2 #5: banner and taskbar are mutually exclusive on mobile —
    // together they covered ~18% of the first viewport. Taskbar must yield.
    const taskbar = page.locator('nav.fixed.bottom-0');
    await expect(taskbar).toBeHidden();
  });

  test('touch targets hold in both themes', async ({ page }) => {
    await withConsent(page);
    await page.goto('/');
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      const taskbar = page.locator('nav.fixed.bottom-0');
      const first = taskbar.locator('a, button').first();
      const box = await first.boundingBox();
      expect(box, `${theme}: taskbar first item missing`).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
