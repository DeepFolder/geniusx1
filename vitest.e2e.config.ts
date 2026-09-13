/**
 * Vitest config for E2E tests — used by `npm run test:e2e`.
 *
 * Key differences from the main vitest.config.ts:
 *  - No setupFiles: the real OpenAI + DB modules are NOT mocked.
 *  - Long timeout (3 minutes per test) to accommodate real LLM calls.
 *  - When OPENAI_API_KEY is absent, all tests auto-skip (describe.skip).
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '@': path.resolve(__dirname, './client/src'),
    },
  },
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
