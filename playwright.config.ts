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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
