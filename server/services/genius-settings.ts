import { eq } from "drizzle-orm";
import { db, withDbRetry } from "../db.js";
import { geniusSettings, type GeniusSettings } from "../../shared/schema.js";

const DEFAULTS: Omit<GeniusSettings, "id" | "updatedAt"> = {
  generationModel: "gpt-5.4-2026-03-05",
  reasoningEffort: "none",
  temperature: "0.2",
};

export async function getGeniusSettings(): Promise<GeniusSettings> {
  try {
    const [row] = await withDbRetry(() =>
      db.select().from(geniusSettings).where(eq(geniusSettings.id, 1)).limit(1),
    );
    if (row) return row;
    // Seed defaults on first read.
    const [seeded] = await withDbRetry(() =>
      db
        .insert(geniusSettings)
        .values({ id: 1, ...DEFAULTS })
        .returning(),
    );
    return seeded;
  } catch (err: any) {
    console.warn("[genius-settings] DB unavailable, using defaults:", err?.message);
    return { id: 1, updatedAt: new Date(), ...DEFAULTS };
  }
}

export async function saveGeniusSettings(
  data: Partial<Omit<GeniusSettings, "id" | "updatedAt">>,
): Promise<GeniusSettings> {
  const [row] = await withDbRetry(() =>
    db
      .insert(geniusSettings)
      .values({ id: 1, ...DEFAULTS, ...data })
      .onConflictDoUpdate({
        target: geniusSettings.id,
        set: { ...data, updatedAt: new Date() },
      })
      .returning(),
  );
  return row;
}

/** True for models that require special reasoning-model call params
 *  (no temperature, no json_object response_format, supports reasoning_effort).
 *  Covers o-series, gpt-5.4, gpt-5.6, and gpt-6 which behave as reasoning models. */
export function isReasoningModel(model: string): boolean {
  return /^o\d/.test(model) || model.startsWith("gpt-5.4") || model.startsWith("gpt-5.6") || model.startsWith("gpt-6");
}

/** The fixed model used when the user clicks the Expert button. */
export const EXPERT_MODEL = "gpt-5.6-sol";
/** The fixed model used when the user clicks the PhD button. */
export const PHD_MODEL = "gpt-6-astra";

/** Quality modes are intentionally exclusive across every request path. */
export function qualityModesAreExclusive(expertMode = false, phdMode = false): boolean {
  return !(expertMode && phdMode);
}
