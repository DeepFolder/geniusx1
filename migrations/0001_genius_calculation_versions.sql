CREATE TABLE IF NOT EXISTS "genius_calculation_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "calculation_id" integer NOT NULL,
  "version" integer NOT NULL,
  "document" jsonb NOT NULL,
  "summary" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "genius_calculation_versions_calculation_id_genius_calculations_id_fk"
    FOREIGN KEY ("calculation_id") REFERENCES "public"."genius_calculations"("id")
    ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "genius_calculation_versions_calculation_version_idx"
  ON "genius_calculation_versions" USING btree ("calculation_id", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "genius_calculation_versions_calculation_created_idx"
  ON "genius_calculation_versions" USING btree ("calculation_id", "created_at");