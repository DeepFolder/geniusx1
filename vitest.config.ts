import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Two Vitest projects (default `npm test`):
 *  • "chat"  — tests/chat/**   — loads tests/setup.ts which globally mocks
 *              server/db, server/auth-middleware, server/routes/ai-routes.js
 *              and openai so that no production I/O occurs during chat tests.
 *  • "infra" — tests/smoke.ts  — pure fixture / helper smoke tests that need
 *              no server mocks.
 *
 * E2E tests live in tests/e2e/** and use a SEPARATE config (vitest.e2e.config.ts)
 * so they never load the mocks above. Run via `npm run test:e2e`.
 *
 * Scoping setupFiles to the "chat" project prevents the server-level mocks
 * from leaking into unrelated test suites.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
      "@": path.resolve(__dirname, "./client/src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    projects: [
      {
        name: "chat",
        test: {
          include: ["tests/chat/**/*.test.ts"],
          setupFiles: ["./tests/setup.ts"],
          environment: "node",
          globals: true,
          hookTimeout: 30000,
        },
        resolve: {
          alias: {
            "@shared": path.resolve(__dirname, "./shared"),
            "@": path.resolve(__dirname, "./client/src"),
          },
        },
      },
      {
        name: "infra",
        test: {
          include: ["tests/smoke.test.ts", "tests/unit/**/*.test.{ts,tsx}"],
          environment: "node",
          globals: true,
        },
        resolve: {
          alias: {
            "@shared": path.resolve(__dirname, "./shared"),
            "@": path.resolve(__dirname, "./client/src"),
          },
        },
      },
    ],
  },
});
