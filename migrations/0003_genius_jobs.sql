CREATE TABLE IF NOT EXISTS "genius_jobs" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kind" varchar(32) NOT NULL DEFAULT 'calculation',
  "status" varchar(24) NOT NULL DEFAULT 'pending',
  "stage" varchar(64) NOT NULL DEFAULT 'queued',
  "progress" integer NOT NULL DEFAULT 0,
  "payload" jsonb,
  "result" jsonb,
  "error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "genius_jobs_owner_updated_idx"
  ON "genius_jobs" USING btree ("user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "genius_jobs_expiry_idx"
  ON "genius_jobs" USING btree ("expires_at");