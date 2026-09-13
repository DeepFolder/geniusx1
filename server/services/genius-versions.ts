import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  geniusCalculations,
  geniusCalculationVersions,
  type GeniusCalculationDoc,
} from "../../shared/schema.js";

const MAX_SNAPSHOTS = 100;

type NamedValue = { id: string; label: string; symbol?: string; value: string | number; unit?: string };

function labelOf(value: NamedValue) {
  return value.label || value.symbol || "value";
}

function changedValue(previous: NamedValue[], current: NamedValue[]): string | null {
  const oldById = new Map(previous.map((item) => [item.id, item]));
  for (const item of current) {
    const old = oldById.get(item.id);
    if (!old) return `Added ${labelOf(item)}`;
    if (String(old.value) !== String(item.value) || (old.unit ?? "") !== (item.unit ?? "")) {
      return `Changed ${labelOf(item)}`;
    }
  }
  if (previous.some((item) => !current.some((next) => next.id === item.id))) return "Removed an input";
  return null;
}

/** A compact deterministic summary based only on saved verified documents. */
export function summarizeCalculationChange(
  previous: GeniusCalculationDoc | undefined,
  current: GeniusCalculationDoc,
): string {
  if (!previous) return "Initial calculation";
  if (previous.projectTitle !== current.projectTitle || previous.problemStatement !== current.problemStatement) {
    return "Updated calculation requirement";
  }
  const inputChange = changedValue(previous.inputs, current.inputs);
  if (inputChange) return inputChange;
  const assumptionChange = changedValue(previous.assumptions, current.assumptions);
  if (assumptionChange) return assumptionChange.replace(/input$/i, "assumption");
  const resultChange = changedValue(previous.results, current.results);
  if (resultChange) return resultChange.replace(/input$/i, "result");
  if (previous.steps.length !== current.steps.length) return "Changed calculation structure";
  if (previous.steps.some((step, index) => {
    const next = current.steps[index];
    return !next || step.expr !== next.expr || step.formula !== next.formula || step.title !== next.title;
  })) return "Changed calculation structure";
  return "Recalculated verified results";
}

async function trimSnapshots(tx: any, calculationId: number) {
  const old = await tx
    .select({ id: geniusCalculationVersions.id })
    .from(geniusCalculationVersions)
    .where(eq(geniusCalculationVersions.calculationId, calculationId))
    .orderBy(asc(geniusCalculationVersions.version))
    .offset(MAX_SNAPSHOTS);
  if (old.length) {
    await tx.delete(geniusCalculationVersions)
      .where(sql`${geniusCalculationVersions.id} IN (${sql.join(old.map((row: any) => sql`${row.id}`), sql`, `)})`);
  }
}

async function createSnapshot(
  tx: any,
  calculationId: number,
  document: GeniusCalculationDoc,
  previous?: GeniusCalculationDoc,
) {
  const [latest] = await tx
    .select({ version: geniusCalculationVersions.version })
    .from(geniusCalculationVersions)
    .where(eq(geniusCalculationVersions.calculationId, calculationId))
    .orderBy(desc(geniusCalculationVersions.version))
    .limit(1);
  await tx.insert(geniusCalculationVersions).values({
    calculationId,
    version: (latest?.version ?? 0) + 1,
    document,
    summary: summarizeCalculationChange(previous, document),
  });
  await trimSnapshots(tx, calculationId);
}

export async function insertCalculationWithSnapshot(values: {
  userId: string;
  title: string;
  document: GeniusCalculationDoc;
  clientRequestId?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(geniusCalculations).values(values).returning();
    await createSnapshot(tx, row.id, values.document);
    return row;
  });
}

export async function updateCalculationWithSnapshot(
  calculationId: number,
  userId: string,
  previous: GeniusCalculationDoc,
  values: { title: string; document: GeniusCalculationDoc; clientRequestId?: string | null; updatedAt: Date },
) {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(geniusCalculations).set(values)
      .where(and(eq(geniusCalculations.id, calculationId), eq(geniusCalculations.userId, userId)))
      .returning();
    if (!row) return undefined;
    await createSnapshot(tx, calculationId, values.document, previous);
    return row;
  });
}

/** Safely seeds exactly one usable snapshot for calculations saved before history. */
export async function ensureInitialSnapshot(calculationId: number, document: GeniusCalculationDoc) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: geniusCalculationVersions.id })
      .from(geniusCalculationVersions)
      .where(eq(geniusCalculationVersions.calculationId, calculationId))
      .limit(1);
    if (existing) return;
    await tx.insert(geniusCalculationVersions).values({
      calculationId,
      version: 1,
      document,
      summary: "Initial calculation",
    }).onConflictDoNothing();
  });
}