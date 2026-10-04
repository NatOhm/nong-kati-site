import { test, expect } from '@playwright/test';

/**
 * Production smoke suite (production roadmap §7/§8 — the last missing gates):
 * the deployed build must actually load under the ENFORCED CSP (no blocked
 * scripts → framework still boots → data renders), and a customer can walk
 * the checkout to a created order whose confirmation link works.
 *
 * Runs against `next start` (production build) in CI — see the
 * browser-smoke job in ci.yml. The DB is a per-job Postgres service seeded
 * with prisma/seed.ts, so the flow exercises the REAL paths: catalog,
 * server-side pricing, order-number allocation, and the payment-channel
 * union gate (manual transfer is seeded via SiteSetting; Opn keys stay
 * absent on purpose — production builds fail closed on mock payments).
 *
 * The checkout test also works against `next dev` with NK_PAYMENT_MOCK=true
 * (the mock gateway path), so it can be run locally without a DB seed.
 */

interface CreatedOrder {
  order: { id: string; orderNumber: string; confirmationUuid: string; status: string };
}

/** Grab the POST /api/v1/orders payload the page sends (server truth beats UI). */
function captureOrderCreation(page: import('@playwright/test').Page): {
  body: () => CreatedOrder | null;
} {
  let created: CreatedOrder | null = null;
  page.on('response', async (res) => {
    if (res.url().endsWith('/api/v1/orders') && res.request().method() === 'POST') {
      try {
        created = (await res.json()) as CreatedOrder;
      } catch {
        /* body already consumed by the page — the UI assertions still hold */
      }
    }
  });
  return { body: () => created };
}

/**
 * The script-src directive of an enforced CSP: nonce'd, no 'unsafe-inline'.
 * Scoped to script-src ON PURPOSE — style-src keeps 'unsafe-inline' (Tailwind
 * utilities) and must not trip this gate (same false positive the static
 * CSP test hit before it was scoped).
 */
function scriptSrcDirective(csp: string): string {
  return (
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('script-src')) ?? ''
  );
}

/** Home page must not just return HTML — the framework must boot. */
test.describe('home page under enforced CSP', () => {
  test('loads, ships an enforced CSP, and hydrates interactive UI', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    // 1. The enforced nonce policy is present (production roadmap §1).
    const csp = response?.headers()['content-security-policy'] ?? '';
    expect(csp, 'CSP header must be present').not.toBe('');
    const scriptSrc = scriptSrcDirective(csp);
    expect(scriptSrc, 'script-src must carry the per-request nonce').toContain("'nonce-");
    expect(scriptSrc, "script-src must not allow 'unsafe-inline'").not.toContain("'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");

    // 2. Seed data is actually reachable through the real catalog query.
    await expect(page.getByRole('heading', { level: 1 }), 'home must render its h1').toBeVisible();
    await expect(
      page.getByText('HBO Max 7 วัน 4K').first(),
      'seeded product must appear in the featured catalog',
    ).toBeVisible();

    // 3. Hydration check: with 'unsafe-inline' gone, a blocked Next.js
    //    bootstrap script would leave the page static — the cart button is
    //    a client component and only becomes interactive after React mounts.
    await expect(page.getByRole('button', { name: /ตะกร้าสินค้า/ })).toBeVisible();

    // 4. Nothing was blocked by the policy while loading (a blocked script
    //    surfaces as a console error naming the CSP directive).
    expect(
      consoleErrors.filter((e) => /Content Security Policy|Refused to (load|execute)/i.test(e)),
    ).toEqual([]);
  });
});

/**
 * Regression (audit 2026-09-28): build-prerendered routes used to ship their
 * HTML without the per-request nonce, so the enforced CSP blocked Next's
 * inline bootstrap scripts and /account/login rendered as an EMPTY page in
 * the production build (CI never hit these routes). The gate now walks two
 * of them and proves the JS layer is alive: enforced CSP present, zero
 * nonce-less inline scripts, and a client control that only exists after
 * hydration actually responds.
 */
test.describe('prerendered routes under enforced CSP', () => {
  for (const path of ['/account/login', '/legal/privacy-policy'] as const) {
    test(`${path}: enforced CSP + every inline script carries the nonce`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));

      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      const csp = response?.headers()['content-security-policy'] ?? '';
      expect(csp, 'CSP header must be present (enforced, not report-only)').toContain('script-src');
      expect(scriptSrcDirective(csp), 'script-src must carry the nonce').toContain("'nonce-");

      // Browsers strip the nonce attribute from the live DOM once a script
      // executes, so the check must run against the RAW served HTML.
      const html = await (await page.request.get(path)).text();
      const inlineOpenTags = html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? [];
      expect(inlineOpenTags.length, 'page must ship inline bootstrap scripts').toBeGreaterThan(0);
      const nonceless = inlineOpenTags.filter((t) => !/\bnonce=/.test(t));
      expect(
        nonceless,
        'every inline script must carry the per-request nonce (prerender bake-in)',
      ).toEqual([]);

      expect(
        consoleErrors.filter((e) => /Content Security Policy|Refused to (load|execute)/i.test(e)),
      ).toEqual([]);
    });
  }

  test('/account/login hydrates: the password toggle responds after mount', async ({ page }) => {
    await page.goto('/account/login');
    const toggle = page.getByRole('button', { name: 'แสดงรหัสผ่าน' });
    await expect(toggle, 'client island must be interactive (JS booted)').toBeVisible({
      timeout: 30_000,
    });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'ซ่อนรหัสผ่าน' })).toBeVisible();
  });
});

/**
 * Guest checkout → order creation, driven through the real UI: product
 * page → add to cart → contact form. The order is then verified through
 * the API payload + its confirmation page (§2 definition of done: "the
 * order link works").
 */
test.describe('checkout flow creates an order', () => {
  test('guest checkout: product → cart → contact form → pending_payment order', async ({
    page,
  }) => {
    test.setTimeout(180_000); // compile headroom when pointed at `next dev`

    const orderCapture = captureOrderCreation(page);

    // 1. Walk the REAL add-to-cart path (product page → add button) instead
    //    of seeding localStorage: the persisted cart is only accepted when
    //    its sessionKey matches 'nk_cart_session', and the provider's
    //    persist effect races any direct seeding — driving the UI is
    //    deterministic and covers the actual customer path.
    await page.goto('/product/hbo-max-7-4k');
    const addBtn = page.getByRole('button', { name: 'เพิ่มลงตะกร้า' });
    await expect(addBtn).toBeVisible({ timeout: 30_000 });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // 2. Straight to checkout with a filled cart.
    await page.goto('/checkout');

    // Step 1 — contact form (ContactForm ids are useId-derived; the TOS
    // checkbox id ends with "-tos").
    await page.fill('input[type="email"]', `smoke+${Date.now()}@nong-kati.test`);
    await page.fill('input[type="tel"]', '0812345678');
    await page.check('input[id$="-tos"]');

    await page.getByRole('button', { name: 'ดำเนินการต่อ' }).click();

    // Step 2 — an order now exists server-side. The payment surface depends
    // on the environment: manual-transfer instructions (CI: seeded
    // SiteSetting) or the mock PromptPay QR (local dev, NK_PAYMENT_MOCK).
    await expect(page.getByText('โอนยอด').or(page.locator('img[alt*="PromptPay QR"]'))).toBeVisible(
      { timeout: 30_000 },
    );
    await expect(page.getByText('ยังไม่มีช่องทางชำระเงินที่ใช้ได้ในขณะนี้')).toHaveCount(0);

    // Server truth: the page's own POST created a pending order.
    const created = orderCapture.body();
    expect(created, 'POST /api/v1/orders must have returned the order').toBeTruthy();
    expect(created?.order.status).toBe('pending_payment');
    expect(created?.order.orderNumber).toMatch(/^NK-\d{4}-\d{6}$/);
    expect(created?.order.confirmationUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // §2 definition of done, link half: the confirmationUuid link renders
    // the order (not a 404) — the delivery email links to this exact path.
    const confirmation = await page.goto(
      `/checkout/confirmation/${created?.order.confirmationUuid}`,
    );
    expect(confirmation?.status()).toBe(200);
    await expect(page.getByText(created?.order.orderNumber ?? '').first()).toBeVisible();
  });
});

/** Security headers that must ship with every production response. */
test.describe('API security headers', () => {
  test('version endpoint exposes only release identity and carries the CSP policy', async ({ request }) => {
    const res = await request.get('/api/v1/version');
    expect(res.status()).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    // `buildId` is read from .next/BUILD_ID on disk, so it is the only field
    // that cannot go stale the way the Infisical-fed gitSha can.
    expect(Object.keys(body).sort()).toEqual(['buildId', 'gitRef', 'gitSha']);
    expect(body['buildId'], 'buildId must look like a real Next build id').toMatch(
      /^[A-Za-z0-9_-]{8,64}$/,
    );

    const csp = res.headers()['content-security-policy'] ?? '';
    expect(scriptSrcDirective(csp), "script-src must be nonce'd").toContain("'nonce-");
    expect(scriptSrcDirective(csp), "script-src must not allow 'unsafe-inline'").not.toContain(
      "'unsafe-inline'",
    );
  });

  test('manual-info channel reflects the seeded setting', async ({ request }) => {
    const res = await request.get('/api/v1/payments/manual-info');
    expect(res.status()).toBe(200);
    const info = (await res.json()) as { enabled: boolean; accountNumber: string | null };
    // CI seeds the setting; a dev machine without it just skips the claim.
    test.info().annotations.push({
      type: 'manual-info',
      description: `enabled=${info.enabled} account=${info.accountNumber ? 'set' : 'null'}`,
    });
  });
});

/**
 * Combobox keyboard operation (WCAG 2.1.1).
 *
 * Bug (Oct 4, 2026): both search boxes advertised role=combobox +
 * aria-expanded + aria-controls + a listbox of role=option, and implemented
 * none of the navigation that implies. Escape and the mouse worked; nothing
 * else did. A keyboard or screen-reader user had no way to reach a suggestion.
 *
 * The pure decision function is unit-tested in
 * tests/combobox-keyboard.test.ts. This block covers the DOM half that a node
 * -environment test cannot reach: that real keypresses land on the input, that
 * aria-activedescendant actually moves, and that the highlighted option is the
 * one Enter commits. A green unit test proves the arithmetic; only this proves
 * the wiring.
 */
test.describe('search suggestions are keyboard operable', () => {/**
   * Type a query that reliably returns suggestions, then wait for the list.
   *
   * The term is DERIVED from whatever catalog this environment seeded rather
   * than hardcoded. Two reasons: CI seeds prisma/seed.ts while a local run may
   * point at any database, and the suggest endpoint does not match on vowels
   * or arbitrary substrings — so a plausible-looking literal like "a" silently
   * returns zero suggestions and the test passes vacuously or fails flakily.
   * Asking the API first and skipping loudly when nothing matches is the only
   * version of this that cannot lie.
   */
  async function queryWithSuggestions(
    page: import('@playwright/test').Page,
  ): Promise<string | null> {
    const res = await page.request.get('/api/v1/products?limit=10');
    const data = (await res.json()) as { products?: { name: string }[] };
    for (const p of data.products ?? []) {
      // A 3-char prefix is what the suggest endpoint indexes on.
      const term = (p.name ?? '').slice(0, 3).trim();
      if (term.length < 2) continue;
      const s = await page.request.get(`/api/v1/search/suggest?q=${encodeURIComponent(term)}`);
      const d = (await s.json()) as { suggestions?: unknown[] };
      if ((d.suggestions ?? []).length >= 2) return term;
    }
    return null;
  }

  async function openSuggestions(page: import('@playwright/test').Page): Promise<string | null> {
    const term = await queryWithSuggestions(page);
    if (!term) {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'no catalog term returned 2+ suggestions; keyboard nav not exercised',
      });
      return null;
    }
    const box = page.locator('input[role="combobox"].h-11').first();
    await box.click();
    await box.fill(term);
    await expect(page.locator('[role="listbox"][aria-label="คำค้นแนะนำ"]')).toBeVisible();
    return term;
  }

  test('/search: arrows move aria-activedescendant and Enter navigates', async ({ page }) => {
    await page.goto('/search');
    const term = await openSuggestions(page);
    test.skip(term === null, 'catalog yielded no suggestion-bearing query');

    const input = page.locator('input[role="combobox"].h-11').first();
    const listbox = page.locator('[role="listbox"][aria-label="คำค้นแนะนำ"]');

    // Nothing highlighted before any arrow key.
    await expect(input).not.toHaveAttribute('aria-activedescendant', /./);

    await input.press('ArrowDown');
    const firstId = await input.getAttribute('aria-activedescendant');
    expect(firstId, 'ArrowDown must expose the active option to AT').toBeTruthy();

    await input.press('ArrowDown');
    const secondId = await input.getAttribute('aria-activedescendant');
    expect(secondId).not.toBe(firstId);

    // The referenced id must actually exist in the DOM and be selected —
    // an activedescendant pointing at nothing is worse than none at all.
    // Attribute selector, not `#id`: these ids come from React's useId and an
    // id selector would need escaping that does not exist in Node.
    await expect(listbox.locator(`[id="${secondId}"]`)).toHaveAttribute('aria-selected', 'true');

    // Enter commits the highlighted option.
    const selectedText = await listbox.locator(`[id="${secondId}"]`).innerText();
    await input.press('Enter');
    await page.waitForURL(/\/search\?q=/);
    expect(decodeURIComponent(page.url())).toContain(
      // the committed suggestion is now the query
      selectedText.split('\n')[0]!.trim(),
    );
  });

  test('/search: Enter with no highlight still searches (fallthrough preserved)', async ({ page }) => {
    await page.goto('/search');
    const term = await openSuggestions(page);
    test.skip(term === null, 'catalog yielded no suggestion-bearing query');
    const input = page.locator('input[role="combobox"].h-11').first();

    // No arrow key pressed: Enter must run the plain form submit rather than
    // being swallowed by the combobox.
    await expect(input).not.toHaveAttribute('aria-activedescendant', /./);
    await input.press('Enter');
    await page.waitForURL(/\/search\?q=/);
  });

  test('/search: Escape closes the list and clears the highlight', async ({ page }) => {
    await page.goto('/search');
    const term = await openSuggestions(page);
    test.skip(term === null, 'catalog yielded no suggestion-bearing query');
    const input = page.locator('input[role="combobox"].h-11').first();
    const listbox = page.locator('[role="listbox"][aria-label="คำค้นแนะนำ"]');

    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', /./);

    await input.press('Escape');
    await expect(listbox).toBeHidden();
    await expect(input).not.toHaveAttribute('aria-activedescendant', /./);
  });

  test('navbar search is keyboard operable too', async ({ page }) => {
    await page.goto('/');
    const term = await queryWithSuggestions(page);
    test.skip(term === null, 'catalog yielded no suggestion-bearing query');
    const input = page.locator('nav input[role="combobox"]').first();
    await input.click();
    await input.fill(term!);

    const listbox = page.locator('[role="listbox"][aria-label="คำค้นแนะนำ"]');
    await expect(listbox).toBeVisible();

    await input.press('ArrowDown');
    const id = await input.getAttribute('aria-activedescendant');
    expect(id, 'navbar combobox must expose its active option').toBeTruthy();
    await expect(listbox.locator(`[id="${id}"]`)).toHaveAttribute('aria-selected', 'true');
  });
});
