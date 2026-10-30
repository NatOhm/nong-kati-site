import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Route/unit tests run in node so Request/FormData match what Next.js
    // actually uses in production. DOM component tests opt into jsdom with a
    // `// @vitest-environment jsdom` docblock at the top of the file (a
    // per-file environment function is not serializable to the forks pool).
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    globals: true,
    // Cap workers: vitest otherwise spawns one per CPU (89 on this box) and
    // the resulting contention trips the 5s per-test timeout at random files
    // (build-stamp, font-vendoring, SlipUploadPanel…) — flaky failures that
    // pass when re-run alone. Four workers keeps the suite deterministic.
    maxWorkers: 4,
    // Some gates spawn git / scan the whole tree (build-stamp,
    // release-badge); on Windows that regularly needs >5s while 3 siblings
    // run in parallel. 15s still bounds a real hang without producing
    // machine-dependent red.
    testTimeout: 15_000,
    // JWT/slip secrets fail closed in every environment now, so every worker
    // needs a value; per-file vi.stubEnv still overrides for fail-closed
    // assertions.
    env: {
      NK_JWT_SECRET: 'vitest-worker-secret-0123456789abcdef0123456789abcdef',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
