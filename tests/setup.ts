import { vi } from "vitest";

/**
 * Global Vitest setup — applied before every test file.
 *
 * Goals:
 *  1. Redirect server/db.ts to the LOCAL database (DATABASE_URL) so no test
 *     ever touches the production Neon database.
 *  2. Replace requireAuth in server/auth-middleware.ts with a JWT-only
 *     implementation (no DB active-status check) so the test suite is
 *     independent of the users table at the middleware layer.
 *  3. Silence the startup side-effect in server/routes/ai-routes.js that
 *     calls initializeEmbeddingsIndex() at module load time.
 *  4. Suppress openai API calls that would fail without valid credentials.
 *
 * vi.mock calls are hoisted to the top of this file by the Vitest transformer
 * and are applied globally across all test files. Per-test-file vi.mock calls
 * override these global defaults.
 */

vi.mock("../server/db", async () => {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("../shared/schema");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set for tests");
  const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10000 });
  const db = drizzle({ client: pool, schema });
  const withDbRetry = async <T>(fn: () => Promise<T>): Promise<T> => fn();
  return { pool, db, withDbRetry };
});

vi.mock("../server/auth-middleware", async () => {
  const jwt = (await import("jsonwebtoken")).default;
  const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

  const requireAuth = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  };

  return {
    requireAuth,
    requireCompanyAdmin: (req: any, res: any, next: any) => {
      if (!req.user || req.user.role !== "company_admin") {
        return res.status(403).json({ error: "Company admin access required" });
      }
      next();
    },
    extractToken: (req: any) => {
      const h = req.headers.authorization;
      return h?.startsWith("Bearer ") ? h.substring(7) : null;
    },
    verifyAuthToken: (token: string) => {
      try {
        return jwt.verify(token, JWT_SECRET);
      } catch {
        return null;
      }
    },
  };
});

vi.mock("../server/routes/ai-routes.js", async () => {
  const { Router } = await import("express");
  return { default: Router() };
});

vi.mock("openai", async () => {
  const { vi: v } = await import("vitest");
  const createMock = v.fn().mockResolvedValue({
    id: "mock-completion",
    choices: [{ message: { role: "assistant", content: "mock response" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  });
  const MockOpenAI = v.fn().mockImplementation(function () {
    return {
      chat: { completions: { create: createMock } },
      responses: { create: v.fn().mockResolvedValue({ status: "completed", output: [] }) },
    };
  });
  return { default: MockOpenAI, OpenAI: MockOpenAI };
});
