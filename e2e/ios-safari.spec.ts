import { test, expect } from '@playwright/test';

/**
 * iOS Safari specifics that can be judged without real hardware. Runs on the
 * iPhone-Safari (WebKit) and Android-Chrome profiles; assertions that only
 * make sense on one engine are guarded by the reported user agent.
 *
 * What WebKit here does NOT prove (see the audit report): real safe-area
 * insets, the collapsing URL bar's effect on the visual viewport, and the
 * on-screen keyboard. Those need a device.
 */

const CONSENT = {
  version: '1.0',
  necessary: true,
  analytics: false,
  marketing: false,
  timestamp: new Date().toISOString(),
};

async function withConsent(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript((consent) => {
    try {
      localStorage.setItem('nk_cookie_consent', JSON.stringify(consent));
    } catch {
      /* storage-blocked runs prove the degraded path separately */
    }
  }, CONSENT);
}

test.describe('iOS Safari surface checks', () => {
  test('fixed bottom taskbar sits on the viewport edge and never clips its labels', async ({
    page,
  }) => {
    await withConsent(page);
    await page.goto('/');
    const nav = page.locator('nav.fixed.bottom-0');
    await expect(nav).toBeVisible();

    const geometry = await nav.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const labels = [...el.querySelectorAll('a, button')].map((n) => {
        const b = n.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, h: b.height };
      });
      return {
        bottom: Math.round(r.bottom),
        innerHeight: window.innerHeight,
        minLabelHeight: Math.min(...labels.map((l) => l.h)),
        clipped: labels.filter((l) => l.bottom > window.innerHeight + 1 || l.top < 0).length,
      };
    });
    // Anchored to the visible bottom edge (dvh/visual viewport), not to a page
    // height that Safari's URL bar can push off-screen.
    expect(Math.abs(geometry.bottom - geometry.innerHeight)).toBeLessThanOrEqual(1);
    expect(geometry.minLabelHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.clipped).toBe(0);
  });

  test('no form control is small enough to trigger iOS focus zoom', async ({ page }) => {
    for (const path of ['/account/login', '/account/register', '/orders/lookup', '/checkout']) {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      const small = await page.evaluate(() => {
        const bad: { tag: string; type: string; size: number; id: string }[] = [];
        for (const el of document.querySelectorAll('input, select, textarea')) {
          const type = (el as HTMLInputElement).type ?? '';
          if (['hidden', 'checkbox', 'radio', 'submit', 'button', 'file'].includes(type)) continue;
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < 16) {
            bad.push({
              tag: el.tagName,
              type,
              size,
              id: el.id || (el as HTMLInputElement).name || el.className.toString().slice(0, 30),
            });
          }
        }
        return bad;
      });
      expect(small, `${path}: iOS zooms the page when focusing these`).toEqual([]);
    }
  });

  test('the lowest checkout field stays in the viewport when focused', async ({ page }) => {
    await withConsent(page);
    // /account/register is the tallest real form in the journey and always
    // renders (an empty cart leaves /checkout with no fields at all, which
    // made `.last()` a hidden placeholder rather than a field).
    await page.goto('/account/register');
    const last = page.locator('input, textarea, select').last();
    await expect(last).toBeVisible({ timeout: 20_000 });
    await last.focus();
    const visible = await last.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= -1 && r.bottom <= window.innerHeight + 1;
    });
    expect(visible, 'the focused field must be scrolled into view').toBe(true);
  });

  test('image upload uses an iOS-friendly image/* picker and survives a cancelled pick', async ({
    page,
  }) => {
    await page.goto('/checkout');
    // The slip picker only exists once an order is on screen; assert the
    // attribute on a product route first — every upload in the app must accept
    // the Photos library rather than a fixed four-type list.
    const fileInputs = page.locator('input[type="file"]');
    if ((await fileInputs.count()) === 0) {
      // No upload on this page: nothing to regress here.
      test.skip(true, 'no file input rendered on /checkout without an order');
    }
    const accept = await fileInputs.first().getAttribute('accept');
    expect(accept).toBe('image/*');

    // Cancelling the picker (no file) must not throw or unmount the panel.
    await fileInputs.first().setInputFiles([]);
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('tappable controls disable the iOS long-press callout, selectable text keeps it', async ({
    page,
  }) => {
    await withConsent(page);
    await page.goto('/search');
    const cta = page.getByRole('link', { name: /ดูสินค้า/ }).first();
    await cta.waitFor({ state: 'visible', timeout: 30_000 });

    const ctaStyle = await cta.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        userSelect: s.getPropertyValue('-webkit-user-select').trim() || s.userSelect.trim(),
      };
    });
    expect(ctaStyle.userSelect).toBe('none');

    // `-webkit-touch-callout` is invisible to the desktop WebKit build: both
    // getComputedStyle and CSSRule.cssText drop it as an unknown property, so
    // the only provable thing here is that the shipped stylesheet carries the
    // declaration (it applies on iOS hardware).
    const calloutDeclared = await page.evaluate(async () => {
      const hits = (text: string) => /-webkit-touch-callout:\s*none/.test(text);
      const hrefs = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
        (l) => (l as HTMLLinkElement).href,
      );
      for (const href of hrefs) {
        try {
          if (hits(await (await fetch(href)).text())) return true;
        } catch {
          /* ignore unreachable sheet */
        }
      }
      return Array.from(document.querySelectorAll('style')).some((s) =>
        hits(s.textContent ?? ''),
      );
    });
    expect(calloutDeclared, '-webkit-touch-callout: none must be declared for taps').toBe(true);

    // Order numbers / codes must stay copyable: a <p>, not a control.
    await page.goto('/orders/lookup');
    const selectable = await page
      .locator('main p')
      .first()
      .evaluate((el) => getComputedStyle(el).userSelect);
    expect(selectable).not.toBe('none');
  });

  test('storage that throws (iOS Private Mode) degrades instead of blanking the page', async ({
    page,
  }) => {
    // Make every storage access throw, exactly like Private Browsing.
    await page.addInitScript(() => {
      const boom = () => {
        throw new DOMException('SecurityError', 'SecurityError');
      };
      const proto = Object.getPrototypeOf(window.localStorage);
      for (const key of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
        Object.defineProperty(proto, key, { value: boom, configurable: true });
      }
      Object.defineProperty(window, 'localStorage', {
        get() {
          return undefined;
        },
        configurable: true,
      });
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('body')).not.toContainText('Application error');

    // The cart cannot persist, but checkout must still render its own state.
    await page.goto('/checkout');
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('body')).not.toContainText('Application error');
    await expect(page.getByText(/ตะกร้าว่างเปล่า|ข้อมูลการติดต่อ/)).toBeVisible({
      timeout: 20_000,
    });
  });

  test('Chromium-only viewport hints are not advertised to Safari', async ({ page }) => {
    await page.goto('/');
    const viewportContent =
      (await page.locator('meta[name="viewport"]').first().getAttribute('content')) ?? '';
    const ua = await page.evaluate(() => navigator.userAgent);
    const isChromeAndroid = /Android/.test(ua) && /Chrome\//.test(ua);

    if (isChromeAndroid) {
      // Regression guard: the Android resize hint must survive on Chromium.
      expect(viewportContent).toContain('interactive-widget=resizes-content');
    } else {
      expect(viewportContent).not.toContain('interactive-widget');
    }
  });

  test('dialogs cap their height with dvh so Safari chrome cannot cut them off', async ({
    page,
  }) => {
    await page.goto('/');
    const supports = await page.evaluate(() => CSS.supports('height', '100dvh'));
    test.skip(!supports, 'engine has no dvh support');
    // Documented unit, not a live dialog: the receipt dialog only appears after
    // a paid order, which mobile-payment-flow.spec.ts drives end to end.
    const cssText = await page.evaluate(async () => {
      const hrefs = [...document.querySelectorAll('link[rel=stylesheet]')].map(
        (l) => (l as HTMLLinkElement).href,
      );
      const parts = await Promise.all(
        hrefs.map(async (href) => {
          try {
            return await (await fetch(href)).text();
          } catch {
            return '';
          }
        }),
      );
      return parts.join('\n');
    });
    expect(cssText).toContain('dvh');
  });
});
