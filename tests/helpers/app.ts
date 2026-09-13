import express from "express";

/**
 * Builds a test Express application by mounting the REAL production
 * registerRoutes function from server/routes.ts. This ensures every HTTP
 * integration test exercises genuine route handlers, middleware chains, and
 * validation — the only things replaced are:
 *   • server/db.ts             → local pg Pool (mocked via tests/setup.ts)
 *   • server/auth-middleware   → JWT-only requireAuth (mocked via tests/setup.ts)
 *   • server/routes/ai-routes.js → empty Router (mocked to silence startup side-effect)
 *   • openai                   → shared vi.fn() mock (mocked via tests/setup.ts)
 *
 * Singleton pattern: routes are registered once per suite run.
 */
let _app: express.Express | null = null;
let _initPromise: Promise<express.Express> | null = null;

export async function buildChatApp(): Promise<express.Express> {
  if (_app) return _app;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const app = express();
    app.use(express.json());
    const { registerRoutes } = await import("../../server/routes");
    await registerRoutes(app);
    _app = app;
    return app;
  })();

  return _initPromise;
}

export function resetChatApp(): void {
  _app = null;
  _initPromise = null;
}
