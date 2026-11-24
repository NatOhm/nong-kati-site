import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Real-database suite (audit 2026-11-24).
 *
 * `npm test` mocks Prisma everywhere, so it cannot prove what the engine does
 * when two transactions race the same rows. Specs under `tests/db/` open a real
 * connection instead, and are excluded from the default run (a suite that
 * silently skips is how a fixed "5 skips" turns into an unknown number).
 *
 * Run them against the engine production runs:
 *
 *   DATABASE_URL=mysql://… DATABASE_DIRECT_URL=mysql://… npm run test:db
 *
 * CI runs exactly that in the `Concurrency (MariaDB)` job (`mariadb:10.11`).
 * Each spec refuses a non-loopback host, so a stray shell cannot point these
 * at production.
 */
export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    environment: 'node',
    globals: true,
    // Real transactions on shared rows: one file at a time, no parallelism
    // inside it, and a budget that tolerates a lock wait.
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NK_JWT_SECRET: 'vitest-db-secret-0123456789abcdef0123456789abcdef',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
