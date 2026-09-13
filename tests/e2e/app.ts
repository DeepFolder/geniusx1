/**
 * Minimal Express application for E2E tests.
 *
 * Mounts the REAL hybrid-search router at /api/openai so tests hit the
 * genuine pipeline without any vitest mocks. No sessions, no auth wiring —
 * the /agent-search-stream route is public (requireAuth is never called on
 * it in production; userId is resolved opportunistically).
 *
 * Singleton pattern: the app is built once per process.
 */

import express from 'express';
import type { Express } from 'express';

let _app: Express | null = null;
let _initPromise: Promise<Express> | null = null;

export async function buildE2EApp(): Promise<Express> {
  if (_app) return _app;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const app = express();
    app.use(express.json());

    // Import the real hybrid-search router (no mocks)
    const { default: hybridSearchRouter } = await import(
      '../../server/features/hybrid-search/backend/routes.js'
    );
    app.use('/api/openai', hybridSearchRouter);

    _app = app;
    return app;
  })();

  return _initPromise;
}

export function resetE2EApp(): void {
  _app = null;
  _initPromise = null;
}
