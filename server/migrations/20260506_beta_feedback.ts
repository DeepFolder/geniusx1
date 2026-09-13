/**
 * Migration: create beta_feedback table in Neon DB.
 * Uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS pattern for idempotency —
 * safe to run multiple times even if the table/columns partially exist.
 * Run with: npx tsx server/migrations/20260506_beta_feedback.ts
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.NEON_DATABASE_URL;
if (!url) throw new Error("NEON_DATABASE_URL is not set");

const sql = neon(url);

// Step 1: ensure the table exists (minimal required columns)
await sql`
  CREATE TABLE IF NOT EXISTS beta_feedback (
    id         serial PRIMARY KEY,
    user_id    varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamp DEFAULT now()
  )
`;

// Step 2: add columns idempotently (safe to re-run)
await sql`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS author_name varchar(255) NOT NULL DEFAULT ''`;
await sql`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS author_role varchar(50)  NOT NULL DEFAULT ''`;
await sql`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS page_url   varchar(1000) NOT NULL DEFAULT ''`;
await sql`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS bullets    text[]        NOT NULL DEFAULT '{}'`;
await sql`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS status     varchar(50)   NOT NULL DEFAULT 'new'`;

// Step 3: indexes
await sql`CREATE INDEX IF NOT EXISTS idx_beta_feedback_user_id ON beta_feedback(user_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_beta_feedback_status  ON beta_feedback(status)`;
await sql`CREATE INDEX IF NOT EXISTS idx_beta_feedback_created ON beta_feedback(created_at DESC)`;

const cols = await sql`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'beta_feedback'
  ORDER BY ordinal_position
` as { column_name: string }[];

console.log("✅ beta_feedback table ready. Columns:", cols.map((r) => r.column_name).join(", "));
