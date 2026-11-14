import { existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

/**
 * The specs drive PrismaClient directly (purchase-flow, management smoke:
 * assertions + fixture reset run in the TEST-RUNNER process), and CI feeds
 * those env vars through the job-level `env:` block. Locally nothing loads
 * them for this process — Next only loads .env.local for the SERVER — so a
 * local run used to die in beforeAll with "NK_GIFT_CODE_ENCRYPTION_KEY not
 * set" (and Prisma would miss DATABASE_URL in any spec that connects).
 * Load the same file here; existing process.env wins, exactly like CI.
 */
const envLocal = path.join(__dirname, '.env.local');
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

/**
 * Storefront quality gates — contrast (WCAG 1.4.3), landmark structure,
 * and 44px touch targets (WCAG 2.5.8 / Apple HIG).
 *
 * Base URL picks the first available target:
 *   E2E_BASE_URL env > local dev (4200) > CI preview (3000).
 *
 * Dev-mode notes: Next compiles each route on first hit (seconds per page
 * on Windows) and the composite contrast scan walks the whole DOM, so
 * timeouts are generous and workers default to 1 to avoid compile thrash.
 * Against a production build (`npm run build && npm start`) the same suite
 * runs several times faster.
 */
const PORT = process.env['E2E_PORT'] ?? '4200';

/**
 * Every spec a customer can touch. These run on the iPhone-Safari and
 * Android-Chrome profiles; the admin specs (management, refunds/resend, admin
 * search) stay on desktop Chromium because the back office is a desktop
 * surface. `purchase-flow` is an admin-operability walk (it logs into
 * /management and confirms a payment) and keeps its desktop pass; its customer
 * legs — checkout and the confirmation page — are covered on both phones by
 * mobile-payment-flow.spec.ts.
 */
const CUSTOMER_SPEC =
  /(smoke|contrast|landmarks|touch-targets|responsive-a11y|duplicate-ids|no-hardcoded-white|disabled-state|mobile-payment-flow|ios-safari)\.spec\.ts/;

/** Specs whose subject only exists on a phone viewport. */
const MOBILE_ONLY_SPEC =
  /(smoke|contrast|touch-targets|duplicate-ids|no-hardcoded-white|disabled-state|mobile-payment-flow|ios-safari)\.spec\.ts/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 90_000,
  },
  projects: [
    // The back office is operated on a desktop, so the admin specs keep one
    // Chromium pass; every customer-facing surface runs on both phone
    // profiles below (the client reports that drove this work came from iOS
    // Safari, and Android Chrome must not regress).
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // landmarks + responsive-a11y also run here: their keyboard assertions
      // only mean anything with a hardware keyboard (skipped on the phones).
      testIgnore: MOBILE_ONLY_SPEC,
    },
    {
      name: 'android-chrome',
      testMatch: CUSTOMER_SPEC,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'iphone-safari',
      testMatch: CUSTOMER_SPEC,
      use: { ...devices['iPhone 14'] },
    },
  ],
});
