CREATE TABLE IF NOT EXISTS "genius_step_comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "calculation_id" integer NOT NULL,
  "step_id" varchar(64) NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "genius_step_comments_calculation_id_genius_calculations_id_fk"
    FOREIGN KEY ("calculation_id") REFERENCES "public"."genius_calculations"("id")
    ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "genius_step_comments_calculation_step_created_idx"
  ON "genius_step_comments" USING btree ("calculation_id", "step_id", "created_at");