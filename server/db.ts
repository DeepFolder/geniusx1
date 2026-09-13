import pg from 'pg';
const { Pool } = pg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Use the configured database, with NEON_DATABASE_URL retained for compatibility.
const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Local PostgreSQL uses loopback without TLS. Hosted databases verify certificates.
// DATABASE_SSL=disable is an explicit option for a private/local database connection.
export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_SSL === 'disable' ? false
    : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

pool.on('connect', (client) => {
  client.on('error', (err) => {
    console.error('Database client error:', err);
  });
});

export const db = drizzle({ client: pool, schema });

// ── Resilience helpers ───────────────────────────────────────────────────────

/** Returns true when the error is a transient DB error worth retrying. */
export function isTransientDbError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? '');
  const cause = String((err as any)?.cause?.message ?? '');
  const combined = msg + ' ' + cause;
  return (
    combined.includes('Control plane request failed') ||
    combined.includes('Connection terminated due to connection timeout') ||
    combined.includes('connection timeout') ||
    combined.includes('Connection terminated unexpectedly') ||
    combined.includes('ECONNRESET') ||
    combined.includes('ETIMEDOUT')
  );
}

/** @deprecated Use isTransientDbError instead */
export const isNeonControlPlaneError = isTransientDbError;

/**
 * Wraps a database operation with automatic retry on transient errors
 * (connection timeouts, Neon cold-starts, unexpected disconnects).
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500,
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isTransientDbError(err) && attempt < retries) {
        const wait = delayMs * attempt;
        console.warn(`[db] transient error (attempt ${attempt}/${retries}), retrying in ${wait}ms…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error('withDbRetry: exhausted retries');
}
