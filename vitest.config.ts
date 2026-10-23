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
