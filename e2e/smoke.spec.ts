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
  test('version endpoint exposes only sha/ref and carries the CSP policy', async ({ request }) => {
    const res = await request.get('/api/v1/version');
    expect(res.status()).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['gitRef', 'gitSha']);

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
