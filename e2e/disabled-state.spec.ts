import { test, expect } from '@playwright/test';

import { contrastRatio, DISABLED_SCAN_FN, type DisabledFinding } from './helpers';

/**
 * Disabled-state gates — WCAG 1.4.1 (Use of Color) companion to the
 * contrast suite. A disabled control must *stay* visibly disabled:
 *
 *  1. No brand CTA styling — a disabled control never wears the peach-500
 *     primary fill (peach-400/600 incl. alpha tints) or the brand glow /
 *     clay-brand shadows. Verified on every scanned page in both themes
 *     (rendered box-shadow check) and statically by the R4 gate in
 *     tests/design-token-gates.test.ts (disabled: utilities).
 *  2. The label remains perceivable — muted-by-design is fine, invisible is
 *     not: disabled label vs its own fill ≥ 2.0:1 in BOTH themes. (Lookup
 *     was 1.98:1 light — fixed to text-clay-600 = 3.06:1.)
 *  3. Toggled live: the lookup submit moves enabled (peach-500) →
 *     disabled, and the two states must stay visually distinct — no shared
 *     background, and the disabled fill no longer carries the brand glow.
 *
 * Page choice: /orders/lookup is the storefront's canonical disabled-while-
 * invalid form (gate reference state from the walkthrough).
 */
const PAGES = ['/', '/search', '/account/login', '/orders/lookup'] as const;
/* Brand fills after globals.css deepens bg-peach-500 → peach-700 — match the
   peach family by (r,g) pairs: 400 (251,146), 500 (249,115), 600 (234,88),
   700 (194,65), 800 (154,52). */
const BRAND_BG_RE = /rgba?\(\s*(?:251,\s*146|249,\s*115|234,\s*88|194,\s*65|154,\s*52)\s*,/;
const GLOW_RE = /shadow-clay-brand|shadow-brand-glow/;
const MIN_DISABLED_LABEL_RATIO = 2.0;

interface DisabledStyleProbe {
  bg: string | null;
  color: string | null;
  shadow: string | null;
}

/**
 * Wait until the submit's computed background has settled into (or out of)
 * the brand fill. State flips run through `transition-colors` (180ms) —
 * probing mid-transition reads an interpolated blend and flakes the gate.
 */
async function waitForSubmitBgSettled(
  page: import('@playwright/test').Page,
  wantBrand: boolean,
): Promise<void> {
  await page.waitForFunction(
    (wantsBrand) => {
      const brandRe = /rgba?\(\s*(?:251,\s*146|249,\s*115|234,\s*88|194,\s*65|154,\s*52)\s*,/;
      const btn = document.querySelector('form button[type="submit"]');
      if (!btn) return false;
      const isBrand = brandRe.test(getComputedStyle(btn).backgroundColor);
      return wantsBrand ? isBrand : !isBrand;
    },
    wantBrand,
    { timeout: 5_000 },
  );
}

/** Computed-style probes for the lookup submit button in a given state. */
async function probeLookupSubmit(
  page: import('@playwright/test').Page,
): Promise<Record<string, DisabledStyleProbe>> {
  return page.evaluate(() => {
    const btn = document.querySelector<HTMLButtonElement>('form button[type="submit"]');
    if (!btn) return {};
    const s = getComputedStyle(btn);
    return {
      [btn.disabled ? 'disabled' : 'enabled']: {
        bg: s.backgroundColor,
        color: s.color,
        shadow: s.boxShadow,
      },
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`disabled-state ${theme}`, () => {
    for (const path of PAGES) {
      test(`${path}: disabled controls keep muted affordance (no CTA bg/glow)`, async ({
        page,
      }) => {
        await page.goto(path);
        // Drive the lookup form into its disabled state (empty required
        // fields) so the page carries at least one real disabled control.
        if (path === '/orders/lookup') {
          await expect(page.locator('form button[type="submit"]')).toBeDisabled();
        }
        const findings = (await page.evaluate(`(${DISABLED_SCAN_FN})()`)) as DisabledFinding[];
        expect(
          findings,
          `${theme} ${path}: disabled control styled like the primary CTA:\n` +
            findings.map((f) => `  [${f.kind}] ${f.detail}`).join('\n'),
        ).toEqual([]);
      });
    }

    test('/orders/lookup: disabled label stays perceivable (≥2:1 on its fill)', async ({
      page,
    }) => {
      await page.goto('/orders/lookup');
      const btn = page.locator('form button[type="submit"]');
      await expect(btn).toBeDisabled();

      const s = await btn.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          color: cs.color,
          shadow: cs.boxShadow,
          cls: el.className,
        };
      });
      // No brand glow may survive onto the disabled submit.
      expect(
        s.shadow,
        `${theme} lookup submit (disabled) must not carry a brand glow — got ${s.shadow}`,
      ).not.toMatch(GLOW_RE);

      const pageBg = theme === 'dark' ? '#3a2a18' : '#fff7ed';
      const ratio = contrastRatio(s.color ?? '', s.bg ?? '', pageBg);
      expect(
        ratio,
        `${theme} disabled submit label ${s.color} on ${s.bg} = ${ratio}:1 ` +
          `(needs ≥${MIN_DISABLED_LABEL_RATIO}, cls=${s.cls})`,
      ).toBeGreaterThanOrEqual(MIN_DISABLED_LABEL_RATIO);
    });

    test('/orders/lookup: toggling valid input flips disabled→enabled distinctly', async ({
      page,
    }) => {
      await page.goto('/orders/lookup');
      // Locate by label text, not id — the a11y gate (duplicate-ID) moved
      // these inputs onto React useId values, which are per-instance and
      // not stable selectors.
      const email = page.getByLabel('อีเมล *');
      const order = page.getByLabel('รหัสคำสั่งซื้อ *');
      const btn = page.locator('form button[type="submit"]');
      await expect(btn).toBeDisabled();

      let probe = await probeLookupSubmit(page);
      const disabledBefore = probe['disabled'];
      expect(disabledBefore, 'expected the submit to start disabled').toBeDefined();

      await email.fill('kaem@example.com');
      await order.fill('NK-2026-ABC123');
      await expect(btn).toBeEnabled();
      await waitForSubmitBgSettled(page, true);
      probe = await probeLookupSubmit(page);
      const enabledAfter = probe['enabled'];
      expect(enabledAfter, 'expected the submit to be enabled after valid input').toBeDefined();

      // The enabled state wears the brand fill; the disabled one must not.
      expect(enabledAfter?.bg ?? '', 'enabled submit should use the brand fill').toMatch(
        BRAND_BG_RE,
      );
      expect(disabledBefore?.bg ?? '').not.toMatch(BRAND_BG_RE);
      expect(disabledBefore?.bg, 'disabled and enabled fills must differ').not.toBe(
        enabledAfter?.bg,
      );
      expect(
        disabledBefore?.shadow ?? '',
        'disabled submit must not keep the brand glow',
      ).not.toMatch(GLOW_RE);

      // Typing an invalid code disables the submit again.
      await order.fill('NK-2026-AB');
      await expect(btn).toBeDisabled();
      await waitForSubmitBgSettled(page, false);
      const invalidProbe = await probeLookupSubmit(page);
      expect(invalidProbe['disabled']?.bg ?? '').not.toMatch(BRAND_BG_RE);
    });
  });
}
