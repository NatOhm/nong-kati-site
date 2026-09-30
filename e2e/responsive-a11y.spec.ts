import { test, expect } from '@playwright/test';

/**
 * Responsive & keyboard-only audit gate (2026-09-28 audit round):
 *
 * 1. 200% zoom reflow — WCAG 1.4.10. A real 200% browser zoom on a 1280×720
 *    window presents exactly 640×360 CSS pixels (zoom scales the CSS px, so
 *    media queries re-evaluate — the desktop layout reflows into the narrow
 *    one). The gate therefore simulates zoom by halving the viewport and
 *    demands what the criterion demands: no HORIZONTAL scrollbar. Vertical
 *    scrolling is the allowed dimension.
 * 2. Landscape phones — 667×375 (iPhone-class rotated): no horizontal
 *    overflow; content below the fold is reachable by (allowed) vertical
 *    scrolling, so the h1 must merely render, not sit in the first viewport.
 * 3. Tablet / laptop — 768×1024, 1024×768, 1366×768: h1 renders, the header
 *    cart trigger exists at every breakpoint, no horizontal overflow. This
 *    range caught a real bug on 2026-09-28: the md navbar's theme/motion
 *    toggles overflowed 768–1023px and forced a sideways scroll.
 * 4. Keyboard traversal — fully operable without a mouse: skip link first +
 *    functional (focus lands on <main>), global :focus-visible ring on
 *    stops, add-to-cart through Enter, the cart drawer focus-trapped and
 *    Escape-closable with focus restored to its trigger, search submits on
 *    Enter.
 *
 * Runs against the production build (`next start`) like the other e2e gates.
 */

/** Horizontal document overflow = the 2-D scroll WCAG 1.4.10 forbids. */
async function assertNoHorizontalOverflow(page: import('@playwright/test').Page): Promise<void> {
  const s = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    s.scrollWidth,
    `document scrollWidth ${s.scrollWidth} > viewport ${s.innerWidth} — horizontal scroll required`,
  ).toBeLessThanOrEqual(s.innerWidth + 1);
}

/**
 * The page's h1 is actually laid out (nonzero box, not display:none).
 * Position below the fold is NOT a violation — vertical scroll is allowed —
 * so visibility-in-viewport is deliberately not asserted here.
 */
async function h1Rendered(page: import('@playwright/test').Page): Promise<boolean> {
  return page
    .locator('h1')
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    });
}

/* ─── 1. 200% zoom reflow (WCAG 1.4.10) ─────────────────────────────────── */

test.describe('200% zoom reflow', () => {
  // 1280×720 at 200% browser zoom = 640×360 CSS px — the exact presentation
  // a zoomed desktop user gets (media queries re-evaluate; the layout that
  // must hold is the narrow one, without horizontal scrolling).
  test.use({ viewport: { width: 640, height: 360 } });

  for (const path of [
    '/',
    '/search',
    '/product/hbo-max-7-4k',
    '/account/login',
    '/legal/privacy-policy',
  ] as const) {
    test(`${path}: reflows without horizontal scroll at 200% zoom`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(500); // images/layout settle before measuring

      await assertNoHorizontalOverflow(page);
      expect(await h1Rendered(page), `${path}: h1 does not render at 200% zoom`).toBe(true);
    });
  }
});

/* ─── 2. Landscape phone (667×375) ──────────────────────────────────────── */

test.describe('landscape phone (667×375)', () => {
  test.use({ viewport: { width: 667, height: 375 } });

  for (const path of ['/', '/search', '/product/hbo-max-7-4k'] as const) {
    test(`${path}: renders + no horizontal overflow`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(400);

      expect(await h1Rendered(page), `${path}: h1 does not render in landscape`).toBe(true);
      await assertNoHorizontalOverflow(page);
    });
  }
});

/* ─── 3. Tablet & laptop viewports ──────────────────────────────────────── */

for (const vp of [
  { name: 'tablet portrait (768×1024)', width: 768, height: 1024 },
  { name: 'tablet landscape (1024×768)', width: 1024, height: 768 },
  { name: 'laptop (1366×768)', width: 1366, height: 768 },
] as const) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const path of ['/', '/search', '/product/hbo-max-7-4k'] as const) {
      test(`${path}: renders with chrome, h1 and no overflow`, async ({ page }) => {
        await page.goto(path);
        await page.waitForTimeout(400);

        expect(await h1Rendered(page), `${path}: h1 not visible at ${vp.name}`).toBe(true);

        // Persistent chrome: the header cart trigger must exist at every
        // breakpoint (desktop navbar, hamburger menu, or taskbar variant).
        await expect(
          page.getByRole('button', { name: /ตะกร้าสินค้า/ }).first(),
          `${path}: header cart trigger missing at ${vp.name}`,
        ).toBeVisible();

        await assertNoHorizontalOverflow(page);
      });
    }
  });
}

/* ─── 4. Keyboard-only traversal ────────────────────────────────────────── */

test.describe('keyboard-only traversal', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  interface FocusInfo {
    tag: string;
    text: string;
    label: string;
    id: string;
  }

  async function activeFocus(page: import('@playwright/test').Page): Promise<FocusInfo> {
    return page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName ?? '',
        text: (el?.textContent ?? '').trim().slice(0, 40),
        label: el?.getAttribute('aria-label') ?? '',
        id: el?.id ?? '',
      };
    });
  }

  /**
   * Tab-walk until the predicate matches. Bounded: a runaway focus order
   * (focus escaping the page or cycling without reaching the target) fails
   * the gate instead of hanging it.
   */
  async function tabUntil(
    page: import('@playwright/test').Page,
    match: (f: FocusInfo) => boolean,
    what: string,
    maxStops = 150,
  ): Promise<FocusInfo> {
    for (let i = 0; i < maxStops; i++) {
      await page.keyboard.press('Tab');
      const f = await activeFocus(page);
      if (f.tag !== 'BODY' && match(f)) return f;
      if (f.tag === 'BODY' && i > 40) {
        // Focus left the document mid-walk — the order is broken.
        throw new Error(`focus escaped <body> after ${i} Tabs while looking for ${what}`);
      }
    }
    throw new Error(
      `${what} not reachable within ${maxStops} Tab stops — keyboard trap or missing`,
    );
  }

  test('skip link is first, visible on focus, and jumps to <main>', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    const first = await activeFocus(page);
    expect(first.tag, 'first Tab must land on the skip link').toBe('A');
    expect(first.text).toContain('ข้าม');

    // Visible when focused (WCAG 2.4.7): the sr-only link materializes.
    const skipRect = await page.locator('a[href="#main-content"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    expect(skipRect.w, 'skip link has no visible box on focus').toBeGreaterThan(0);
    expect(skipRect.h, 'skip link has no visible box on focus').toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    // The skip target must actually receive focus — this is why <main> is
    // tabIndex={-1} (fragment navigation alone doesn't move focus in an SPA).
    await page.waitForTimeout(300);
    const after = await activeFocus(page);
    expect(
      after.id === 'main-content' || after.tag === 'MAIN',
      `Enter on skip link must move focus to <main id="main-content">, got <${after.tag} id="${after.id}">`,
    ).toBe(true);
  });

  test('focus ring is visible on keyboard stops', async ({ page }) => {
    await page.goto('/');
    await tabUntil(page, (f) => f.label.includes('ตะกร้าสินค้า'), 'header cart button');

    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement as Element);
      return { outline: s.outlineWidth, style: s.outlineStyle, shadow: s.boxShadow };
    });
    const visibleRing =
      (ring.style !== 'none' && parseFloat(ring.outline) > 0) || ring.shadow !== 'none';
    expect(visibleRing, 'keyboard focus has neither outline nor shadow ring').toBe(true);
  });

  test('add to cart via Enter, then cart drawer: focus-trapped, Escape closes, focus restored', async ({
    page,
  }) => {
    await page.goto('/product/hbo-max-7-4k');

    // 1. The primary buy action must be reachable and triggerable by keyboard.
    const add = await tabUntil(page, (f) => f.text === 'เพิ่มลงตะกร้า', 'add-to-cart button');
    expect(add.tag, 'add-to-cart must be a button').toBe('BUTTON');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'เพิ่มลงตะกร้าแล้ว!' }),
      'Enter on add-to-cart must add the item',
    ).toBeVisible();

    // 2. Open the cart drawer the way a keyboard user does: Tab to the header
    //    cart trigger and press Enter (the add action deliberately does not
    //    open the drawer — it shows inline confirmation instead).
    await tabUntil(page, (f) => f.label.includes('ตะกร้าสินค้า'), 'header cart trigger');
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'ตะกร้าสินค้า' });
    await expect(drawer).toBeVisible();

    // 3. Focus trap: 40 Tabs later the focus must still be inside the dialog.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
    }
    const trapped = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(trapped, 'Tab walks out of the cart drawer — focus trap broken').toBe(true);

    // 4. Escape closes, and focus returns to the drawer's trigger.
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0); // Escape closes the drawer
    const restored = await activeFocus(page);
    expect(
      restored.label.includes('ตะกร้าสินค้า'),
      `focus must return to the cart trigger after Escape, got <${restored.tag}> "${restored.label}"`,
    ).toBe(true);
  });

  test('search submits on Enter', async ({ page }) => {
    await page.goto('/search');
    await tabUntil(page, (f) => f.label === 'ค้นหาสินค้า', 'catalog search input');

    await page.keyboard.type('netflix');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/search\?q=netflix/, { timeout: 15_000 });
    expect(page.url()).toContain('/search?q=netflix');
  });
});
