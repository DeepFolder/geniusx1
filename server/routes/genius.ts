import { Router } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import { z } from "zod";
import { and, asc, desc, eq, not, sql } from "drizzle-orm";
import { db, withDbRetry } from "../db.js";
import {
  geniusCalculations,
  geniusChatMessages,
  geniusStepComments,
  geniusCalculationVersions,
  geniusCalculationDocSchema,
  geniusTaskProposalSchema,
  type GeniusAttachment,
} from "../../shared/schema.js";
import { requireAuth } from "../auth-middleware.js";
import { requireAI } from "../middleware/require-ai.js";
import { getGeniusSettings, saveGeniusSettings } from "../services/genius-settings.js";
import {
  generateCalculation,
  followUpCalculation,
  proposeTaskFromText,
  proposeTaskFromExplanation,
  proposeTaskFromDocument,
  refineTaskProposal,
  generateFromProposal,
  generateCommentary,
  refreshExpertSummary,
  fallbackCommentary,
  proposalFallbackReply,
  classifyIntent,
  answerQuestion,
  explainCalculationStep,
  searchEngineeringReferences,
  GeniusStageTimeoutError,
  withGeniusDeadline,
  type WebReference,
} from "../services/genius-service.js";
import { recomputeDoc } from "../services/genius-eval.js";
import {
  ensureInitialSnapshot,
  insertCalculationWithSnapshot,
  updateCalculationWithSnapshot,
} from "../services/genius-versions.js";
import { extractPdfTextFromBuffer } from "../services/datasheet-summarizer.js";
import { ObjectStorageService } from "../objectStorage.js";
import {
  startTracking,
  trackApiCall,
  finishTracking,
} from "../features/hybrid-search/connections/usage-tracking.js";
import {
  createJob,
  publishVerifiedJob,
  resolveJob,
  failJob,
  getJob,
  getJobUpdate,
  cancelJob,
  getJobSignal,
  getDurableJobUpdate,
  setJobProgress,
} from "../services/genius-jobs.js";

const router = Router();

router.use(requireAuth);

function docTitle(doc: any): string {
  return (doc?.projectTitle && String(doc.projectTitle).trim()) || "Untitled Calculation";
}

/**
 * Keep at most MAX_UNPINNED unpinned calculations per user.
 * Called after every new calculation insert. Deletes the oldest excess
 * unpinned row(s) so the history never grows beyond the cap.
 * Pinned calculations are never touched.
 */
const MAX_UNPINNED = 20;
async function pruneUnpinnedHistory(userId: string): Promise<void> {
  try {
    // Fetch ids of all unpinned calcs for this user, oldest first.
    const unpinned = await db
      .select({ id: geniusCalculations.id })
      .from(geniusCalculations)
      .where(and(eq(geniusCalculations.userId, userId), not(geniusCalculations.pinned)))
      .orderBy(asc(geniusCalculations.createdAt));

    if (unpinned.length <= MAX_UNPINNED) return;

    const toDelete = unpinned.slice(0, unpinned.length - MAX_UNPINNED).map((r) => r.id);
    for (const id of toDelete) {
      await db.delete(geniusCalculations).where(eq(geniusCalculations.id, id));
    }
  } catch (err: any) {
    // Non-fatal — a pruning failure should never break the save.
    console.error("[genius] pruneUnpinnedHistory failed:", err?.message);
  }
}

/** Append a version stamp to a server-owned history array.
 *  Always pass `existingVersions` from the DB row (validated schema); never use the
 *  client-submitted doc's versions field, which is untrusted.
 *  If the history has reached 499 entries the oldest entry is dropped to stay within
 *  the 500-entry schema cap and keep the array append-safe.
 */
function stampVersion(
  existingVersions: { version: number; date: string }[],
): { version: number; date: string }[] {
  const MAX = 500;
  const base = existingVersions.length >= MAX ? existingVersions.slice(-(MAX - 1)) : existingVersions;
  const highest = base.reduce((max, v) => Math.max(max, v.version), 0);
  return [...base, { version: highest + 1, date: new Date().toISOString() }];
}

/**
 * Serialize document mutations per calculation until the verified row and its
 * ordered chat turn are persisted. Commentary runs after release.
 */
const calculationMutationTails = new Map<number, Promise<void>>();

async function acquireCalculationMutation(
  calculationId: number,
  signal?: AbortSignal,
): Promise<() => void> {
  const previous = calculationMutationTails.get(calculationId) ?? Promise.resolve();
  let unlock!: () => void;
  const current = new Promise<void>((resolve) => { unlock = resolve; });
  const tail = previous.catch(() => {}).then(() => current);
  calculationMutationTails.set(calculationId, tail);

  // A cancelled waiter does no AI/DB work once its turn arrives. Waiting for
  // the preceding mutation keeps queue ownership simple and leak-free.
  await previous.catch(() => {});

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    unlock();
    if (calculationMutationTails.get(calculationId) === tail) {
      calculationMutationTails.delete(calculationId);
    }
  };

  if (signal?.aborted) {
    release();
    const error = new Error("Calculation mutation cancelled");
    error.name = "AbortError";
    throw error;
  }
  return release;
}

interface GeniusStageTimings {
  requestId: string;
  expertMode: boolean;
  phdMode: boolean;
  webSearch: boolean;
  routingMs: number;
  sourceLookupMs: number;
  expertGenerationMs: number;
  recomputationMs: number;
  persistenceMs: number;
  firstVerifiedMs: number;
  commentaryMs: number;
  totalMs: number;
}

function newStageTimings(requestId: string, expertMode: boolean, phdMode: boolean, webSearch: boolean): GeniusStageTimings {
  return {
    requestId,
    expertMode,
    phdMode,
    webSearch,
    routingMs: 0,
    sourceLookupMs: 0,
    expertGenerationMs: 0,
    recomputationMs: 0,
    persistenceMs: 0,
    firstVerifiedMs: 0,
    commentaryMs: 0,
    totalMs: 0,
  };
}

function trackStage(
  requestId: string,
  service: Parameters<typeof trackApiCall>[1]["service"],
  model: string,
  durationMs: number,
  tokens = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
) {
  trackApiCall(requestId, {
    timestamp: Date.now(),
    service,
    model,
    tokens,
    duration_ms: durationMs,
  });
}

function startReferenceLookup(
  topic: string,
  enabled: boolean,
  signal?: AbortSignal,
): Promise<{ refs: WebReference[] | undefined; durationMs: number }> {
  if (!enabled) return Promise.resolve({ refs: undefined, durationMs: 0 });
  const startedAt = Date.now();
  return searchEngineeringReferences(topic, signal)
    .then((refs) => ({ refs, durationMs: Date.now() - startedAt }));
}

function logStageTimings(route: string, phase: "verified" | "complete" | "cancelled" | "error", timings: GeniusStageTimings) {
  console.info("[genius:timing]", JSON.stringify({ route, phase, ...timings }));
}

/**
 * Permanently append one or more chat turns to a calculation's history, in
 * order. Best-effort: a failure here must never break calculation
 * generation/update, so callers should not await-and-throw on it — errors
 * are swallowed after logging. Empty/blank content is skipped.
 */
async function persistChatTurns(
  calculationId: number,
  turns: Array<{ role: "user" | "assistant"; content: string | null | undefined }>,
) {
  try {
    const rows = turns
      .filter((t) => t.content && t.content.trim())
      .map((t) => ({ calculationId, role: t.role, content: t.content as string }));
    if (rows.length === 0) return;
    await withDbRetry(() => db.insert(geniusChatMessages).values(rows));
  } catch (err: any) {
    console.error("[genius] failed to persist chat history:", err?.message);
  }
}

/** Convenience wrapper for the common single user+assistant turn case. */
async function saveChatTurn(calculationId: number, userContent: string, assistantContent?: string | null) {
  await persistChatTurns(calculationId, [
    { role: "user", content: userContent },
    { role: "assistant", content: assistantContent },
  ]);
}

/**
 * Persist a complete user/assistant pair before publishing a verified result.
 * The assistant row starts as a deterministic factual summary and is updated
 * in place after commentary, preserving exact ordering across concurrent turns.
 */
async function reserveCommentaryTurn(
  calculationId: number,
  priorTurns: Array<{ role: "user" | "assistant"; content: string }> | undefined,
  userContent: string,
  factualSummary: string,
): Promise<number> {
  const rows = [
    ...(priorTurns ?? []),
    { role: "user" as const, content: userContent },
    { role: "assistant" as const, content: factualSummary },
  ].filter((turn) => turn.content.trim());
  const inserted = await withDbRetry(() =>
    db
      .insert(geniusChatMessages)
      .values(rows.map((turn) => ({ calculationId, ...turn })))
      .returning({ id: geniusChatMessages.id }),
  );
  const assistantRow = inserted[inserted.length - 1];
  if (!assistantRow) throw new Error("Failed to reserve commentary history row");
  return assistantRow.id;
}

async function replaceReservedCommentary(
  commentaryRowId: number,
  calculationId: number,
  commentary: string,
) {
  await withDbRetry(() =>
    db
      .update(geniusChatMessages)
      .set({ content: commentary })
      .where(and(
        eq(geniusChatMessages.id, commentaryRowId),
        eq(geniusChatMessages.calculationId, calculationId),
      )),
  );
}

// List the current user's calculations (most recent first).
router.get("/", async (req: any, res) => {
  try {
    const rows = await withDbRetry(() =>
      db
        .select({
          id: geniusCalculations.id,
          title: geniusCalculations.title,
          pinned: geniusCalculations.pinned,
          clientRequestId: geniusCalculations.clientRequestId,
          createdAt: geniusCalculations.createdAt,
          updatedAt: geniusCalculations.updatedAt,
        })
        .from(geniusCalculations)
        .where(eq(geniusCalculations.userId, req.user.id))
        .orderBy(sql`${geniusCalculations.pinned} IS TRUE DESC`, desc(geniusCalculations.updatedAt)),
    );
    res.json(rows);
  } catch (err: any) {
    console.error("[genius] list failed:", err?.message);
    res.status(500).json({ error: "Failed to load calculations" });
  }
});

// Poll the status of a background generation job (owner only).
router.get("/jobs/:jobId", async (req: any, res) => {
  const job = await getDurableJobUpdate(req.params.jobId, req.user.id);
  if (job === null) return res.status(404).json({ error: "Job not found" });
  if (job === "forbidden") return res.status(403).json({ error: "Forbidden" });
  res.json({ status: job.status, stage: job.stage, progress: job.progress, result: (job as any).result, error: (job as any).error });
});

// Cancel a running background generation job (owner only).
router.delete("/jobs/:jobId", (req: any, res) => {
  const outcome = cancelJob(req.params.jobId, req.user.id);
  if (outcome === "not_found") return res.status(404).json({ error: "Job not found" });
  if (outcome === "forbidden") return res.status(403).json({ error: "Forbidden" });
  // "already_done" is a benign race — return 200 so the client doesn't error.
  res.json({ ok: true, outcome });
});

// Fetch one calculation by id (owner only).
router.get("/:id", async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [row] = await withDbRetry(() =>
      db
        .select()
        .from(geniusCalculations)
        .where(and(eq(geniusCalculations.id, id), eq(geniusCalculations.userId, req.user.id)))
        .limit(1),
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    // Restore the real original transcript. Calculations saved before chat
    // history was tracked simply have no rows here — an empty array, not an error.
    const chatHistory = await withDbRetry(() =>
      db
        .select({ role: geniusChatMessages.role, content: geniusChatMessages.content })
        .from(geniusChatMessages)
        .where(eq(geniusChatMessages.calculationId, id))
        .orderBy(geniusChatMessages.id),
    );
    const comments = await withDbRetry(() =>
      db
        .select({
          id: geniusStepComments.id,
          stepId: geniusStepComments.stepId,
          content: geniusStepComments.content,
          createdAt: geniusStepComments.createdAt,
        })
        .from(geniusStepComments)
        .where(eq(geniusStepComments.calculationId, id))
        .orderBy(asc(geniusStepComments.createdAt), asc(geniusStepComments.id)),
    );
    res.json({ ...row, chatHistory, comments });
  } catch (err: any) {
    console.error("[genius] get failed:", err?.message);
    res.status(500).json({ error: "Failed to load calculation" });
  }
});

const createStepCommentSchema = z.object({
  content: z.string().trim().min(1, "A comment cannot be blank.").max(2000, "Comments must be 2,000 characters or fewer."),
});

async function getOwnedStepComment(calculationId: number, stepId: string, commentId: number, userId: string) {
  const [comment] = await withDbRetry(() =>
    db
      .select({ id: geniusStepComments.id })
      .from(geniusStepComments)
      .innerJoin(geniusCalculations, eq(geniusStepComments.calculationId, geniusCalculations.id))
      .where(and(
        eq(geniusStepComments.id, commentId),
        eq(geniusStepComments.calculationId, calculationId),
        eq(geniusStepComments.stepId, stepId),
        eq(geniusCalculations.userId, userId),
      ))
      .limit(1),
  );
  return comment;
}

// Save a durable user comment against an existing step in the current live
// calculation. Comments are deliberately not added to the calculation document,
// so version snapshots remain calculation-only.
router.post("/:id/steps/:stepId/comments", async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = createStepCommentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid comment" });

  try {
    const [calculation] = await withDbRetry(() =>
      db
        .select({ document: geniusCalculations.document })
        .from(geniusCalculations)
        .where(and(eq(geniusCalculations.id, id), eq(geniusCalculations.userId, req.user.id)))
        .limit(1),
    );
    if (!calculation) return res.status(404).json({ error: "Not found" });
    const document = geniusCalculationDocSchema.parse(calculation.document);
    if (!document.steps.some((step) => step.id === req.params.stepId)) {
      return res.status(404).json({ error: "Calculation step not found" });
    }
    const [comment] = await withDbRetry(() =>
      db
        .insert(geniusStepComments)
        .values({ calculationId: id, stepId: req.params.stepId, content: parsed.data.content })
        .returning({
          id: geniusStepComments.id,
          stepId: geniusStepComments.stepId,
          content: geniusStepComments.content,
          createdAt: geniusStepComments.createdAt,
        }),
    );
    res.status(201).json(comment);
  } catch (err: any) {
    console.error("[genius] create step comment failed:", err?.message);
    res.status(500).json({ error: "Could not save comment" });
  }
});

router.patch("/:id/steps/:stepId/comments/:commentId", async (req: any, res) => {
  const id = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  if (!Number.isInteger(id) || !Number.isInteger(commentId)) return res.status(400).json({ error: "Invalid comment id" });
  const parsed = createStepCommentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid comment" });
  try {
    if (!await getOwnedStepComment(id, req.params.stepId, commentId, req.user.id)) {
      return res.status(404).json({ error: "Comment not found" });
    }
    const [comment] = await withDbRetry(() =>
      db.update(geniusStepComments)
        .set({ content: parsed.data.content })
        .where(eq(geniusStepComments.id, commentId))
        .returning({ id: geniusStepComments.id, stepId: geniusStepComments.stepId, content: geniusStepComments.content, createdAt: geniusStepComments.createdAt }),
    );
    res.json(comment);
  } catch (err: any) {
    console.error("[genius] update step comment failed:", err?.message);
    res.status(500).json({ error: "Could not update comment" });
  }
});

router.delete("/:id/steps/:stepId/comments/:commentId", async (req: any, res) => {
  const id = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  if (!Number.isInteger(id) || !Number.isInteger(commentId)) return res.status(400).json({ error: "Invalid comment id" });
  try {
    if (!await getOwnedStepComment(id, req.params.stepId, commentId, req.user.id)) {
      return res.status(404).json({ error: "Comment not found" });
    }
    await withDbRetry(() => db.delete(geniusStepComments).where(eq(geniusStepComments.id, commentId)));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[genius] delete step comment failed:", err?.message);
    res.status(500).json({ error: "Could not delete comment" });
  }
});

// List only durable snapshot records. Older timestamp-only document markers
// are intentionally never exposed as openable versions.
router.get("/:id/versions", async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [calculation] = await withDbRetry(() => db.select({ document: geniusCalculations.document })
      .from(geniusCalculations)
      .where(and(eq(geniusCalculations.id, id), eq(geniusCalculations.userId, req.user.id)))
      .limit(1));
    if (!calculation) return res.status(404).json({ error: "Not found" });
    const parsed = geniusCalculationDocSchema.safeParse(calculation.document);
    if (!parsed.success) return res.status(500).json({ error: "Saved calculation is invalid" });
    await withDbRetry(() => ensureInitialSnapshot(id, parsed.data));
    const versions = await withDbRetry(() => db.select({
      version: geniusCalculationVersions.version,
      summary: geniusCalculationVersions.summary,
      createdAt: geniusCalculationVersions.createdAt,
    }).from(geniusCalculationVersions)
      .where(eq(geniusCalculationVersions.calculationId, id))
      .orderBy(desc(geniusCalculationVersions.version)));
    res.json(versions);
  } catch (err: any) {
    console.error("[genius] version list failed:", err?.message);
    res.status(500).json({ error: "Failed to load version history" });
  }
});

router.get("/:id/versions/:version", async (req: any, res) => {
  const id = Number(req.params.id);
  const version = Number(req.params.version);
  if (!Number.isInteger(id) || !Number.isInteger(version)) return res.status(400).json({ error: "Invalid version" });
  try {
    const [row] = await withDbRetry(() => db.select({
      version: geniusCalculationVersions.version,
      summary: geniusCalculationVersions.summary,
      createdAt: geniusCalculationVersions.createdAt,
      document: geniusCalculationVersions.document,
    }).from(geniusCalculationVersions)
      .innerJoin(geniusCalculations, eq(geniusCalculationVersions.calculationId, geniusCalculations.id))
      .where(and(
        eq(geniusCalculations.id, id),
        eq(geniusCalculations.userId, req.user.id),
        eq(geniusCalculationVersions.version, version),
      ))
      .limit(1));
    if (!row) return res.status(404).json({ error: "Version not found" });
    res.json(row);
  } catch (err: any) {
    console.error("[genius] version get failed:", err?.message);
    res.status(500).json({ error: "Failed to load calculation version" });
  }
});

// Rename or pin/unpin a calculation (owner only).
const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  pinned: z.boolean().optional(),
});
router.patch("/:id", async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid patch" });
  if (!parsed.data.title && parsed.data.pinned === undefined)
    return res.status(400).json({ error: "Nothing to update" });
  try {
    const [existing] = await withDbRetry(() =>
      db.select({ id: geniusCalculations.id })
        .from(geniusCalculations)
        .where(and(eq(geniusCalculations.id, id), eq(geniusCalculations.userId, req.user.id)))
        .limit(1),
    );
    if (!existing) return res.status(404).json({ error: "Not found" });
    const update: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) update.title = parsed.data.title;
    if (parsed.data.pinned !== undefined) update.pinned = parsed.data.pinned;
    await withDbRetry(() =>
      db.update(geniusCalculations).set(update).where(eq(geniusCalculations.id, id)),
    );
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[genius] patch failed:", err?.message);
    res.status(500).json({ error: "Failed to update calculation" });
  }
});

// Update report details without recalculating or creating a calculation version.
const detailsSchema = z.object({
  authorName: z.string().trim().max(200).default(""),
  projectNameNumber: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(5000).default(""),
});
router.patch("/:id/details", async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = detailsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid calculation details" });
  let releaseMutation: (() => void) | undefined;
  try {
    releaseMutation = await acquireCalculationMutation(id);
    const [existing] = await withDbRetry(() =>
      db.select({ document: geniusCalculations.document })
        .from(geniusCalculations)
        .where(and(eq(geniusCalculations.id, id), eq(geniusCalculations.userId, req.user.id)))
        .limit(1),
    );
    if (!existing) return res.status(404).json({ error: "Not found" });
    const document = geniusCalculationDocSchema.safeParse(existing.document);
    if (!document.success) return res.status(500).json({ error: "Saved calculation is invalid" });
    const savedDocument = { ...document.data, details: parsed.data };
    await withDbRetry(() =>
      db.update(geniusCalculations)
        .set({ document: savedDocument, updatedAt: new Date() })
        .where(and(eq(geniusCalculations.id, id), eq(geniusCalculations.userId, req.user.id))),
    );
    res.json({ document: savedDocument });
  } catch (err: any) {
    console.error("[genius] details update failed:", err?.message);
    res.status(500).json({ error: "Failed to save calculation details" });
  } finally {
    releaseMutation?.();
  }
});

// Shared schema for optional chat history sent by the client.
const chatHistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});
const chatHistorySchema = z.array(chatHistoryItemSchema).max(20).optional();
const qualityModeFields = {
  expertMode: z.boolean().optional().default(false),
  phdMode: z.boolean().optional().default(false),
};
const withQualityMode = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, ...qualityModeFields }).refine(
    (data) => !(data.expertMode && data.phdMode),
    { message: "Expert and PhD modes cannot be enabled together", path: ["phdMode"] },
  );

// Generate a brand-new calculation from a natural-language prompt.
// Returns a job id immediately; generation runs in the background.
const generateSchema = withQualityMode({
  prompt: z.string().min(1).max(4000),
  webSearch: z.boolean().optional().default(false),
  // Client correlation id so an interrupted client can find its finished result.
  clientRequestId: z.string().min(1).max(64).optional(),
  // Full chat transcript for AI context — the agent uses this to understand
  // references and user intent across the whole conversation.
  chatHistory: chatHistorySchema,
});
router.post("/generate", requireAI, async (req: any, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A prompt is required" });

  const jobId = createJob(req.user.id);
  res.json({ jobId });

  // All AI work runs in the background so the HTTP response returns instantly
  // regardless of how long generation takes.
  (async () => {
    const signal = getJobSignal(jobId);
    setJobProgress(jobId, "routing and source discovery", 10);
    const jobCancelled = () => (getJob(jobId, req.user.id) as any)?.status === "cancelled";
    const requestId = randomUUID();
    const pipelineStartedAt = Date.now();
    const timings = newStageTimings(requestId, parsed.data.expertMode, parsed.data.phdMode, parsed.data.webSearch);
    let trackingFinished = false;
    startTracking(requestId, {
      query: parsed.data.prompt,
      user_id: req.user?.id ?? null,
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      country: req.headers["cf-ipcountry"] as string | undefined
        || req.headers["x-vercel-ip-country"] as string | undefined,
      city: req.headers["x-vercel-ip-city"] as string | undefined,
      search_mode: "genius_generate",
    });
    const stopIfCancelled = () => {
      if (!jobCancelled()) return false;
      timings.totalMs = Date.now() - pipelineStartedAt;
      if (!trackingFinished) {
        finishTracking(requestId, 0);
        trackingFinished = true;
      }
      logStageTimings("generate", "cancelled", timings);
      return true;
    };
    try {
      // Routing and source discovery are independent fast-helper calls. Start
      // both immediately, then reuse the references in whichever branch wins.
      const [intentResult, sourceResult] = await Promise.all([
        classifyIntent(parsed.data.prompt, false, parsed.data.expertMode, signal, parsed.data.chatHistory),
        startReferenceLookup(parsed.data.prompt, parsed.data.webSearch, signal),
      ]);
      const { intent } = intentResult;
      timings.routingMs = intentResult.durationMs ?? 0;
      timings.sourceLookupMs = sourceResult.durationMs;
      trackStage(requestId, "intent_routing", intentResult.model ?? "gpt-4o-mini", timings.routingMs, {
        prompt_tokens: intentResult.promptTokens ?? 0,
        completion_tokens: intentResult.completionTokens ?? 0,
        total_tokens: intentResult.totalTokens ?? 0,
      });
      if (parsed.data.webSearch) {
        trackStage(requestId, "source_lookup", "gpt-4o-mini", timings.sourceLookupMs);
      }
      if (stopIfCancelled()) return;
      if (intent === "question") {
        const { answer, calculationExample } = await answerQuestion(
          parsed.data.prompt,
          undefined,
          parsed.data.webSearch,
          parsed.data.expertMode,
          signal,
          parsed.data.chatHistory,
          sourceResult.refs,
        );
        if (stopIfCancelled()) return;
        resolveJob(jobId, { type: "answer", reply: answer, calculationExample });
        timings.totalMs = Date.now() - pipelineStartedAt;
        finishTracking(requestId, 0, { intent });
        trackingFinished = true;
        logStageTimings("generate", "complete", timings);
        return;
      }

      setJobProgress(jobId, "building verified calculation", 35);
      const result = await generateCalculation(parsed.data.prompt, {
        webSearch: parsed.data.webSearch,
        expertMode: parsed.data.expertMode,
        phdMode: parsed.data.phdMode,
        webReferences: sourceResult.refs,
      }, signal, parsed.data.chatHistory);
      if (stopIfCancelled()) return;
      timings.expertGenerationMs = result.durationMs;
      timings.recomputationMs = result.recomputationMs;
      trackApiCall(requestId, {
        timestamp: Date.now(),
        service: "ai_generate",
        model: result.model,
        tokens: {
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
          total_tokens: result.totalTokens,
        },
        duration_ms: result.durationMs,
      });
      trackStage(requestId, "server_recompute", "deterministic", result.recomputationMs);
      if (stopIfCancelled()) return;

      setJobProgress(jobId, "saving verified calculation", 75);
      const persistenceStartedAt = Date.now();
      const docWithVersion = { ...result.doc, versions: stampVersion([]) };
      const row = await withDbRetry(() =>
        insertCalculationWithSnapshot({
          userId: req.user.id,
          title: docTitle(docWithVersion),
          document: docWithVersion,
          clientRequestId: parsed.data.clientRequestId ?? null,
        }),
      );
      await pruneUnpinnedHistory(req.user.id);
      if (stopIfCancelled()) return;
      // Reserve the assistant turn with a deterministic summary. Deferred
      // commentary replaces this exact row, so later prompts cannot overtake it.
      const commentaryRowId = await reserveCommentaryTurn(
        row.id,
        parsed.data.chatHistory,
        parsed.data.prompt,
        fallbackCommentary(docWithVersion),
      );
      if (stopIfCancelled()) return;
      timings.persistenceMs = Date.now() - persistenceStartedAt;
      timings.firstVerifiedMs = Date.now() - pipelineStartedAt;
      trackStage(requestId, "calculation_persistence", "database", timings.persistenceMs);
      publishVerifiedJob(jobId, { ...row, timings: { ...timings } });
      logStageTimings("generate", "verified", timings);

      // Commentary is outside time-to-first-result but remains part of the
      // cancellable job, so Stop still aborts this request and history append.
      setJobProgress(jobId, "adding optional engineering commentary", 92);
      const commentaryStartedAt = Date.now();
      const commentary = await generateCommentary(result.doc, { kind: "new" }, parsed.data.expertMode, signal);
      timings.commentaryMs = Date.now() - commentaryStartedAt;
      trackStage(requestId, "calculation_commentary", "gpt-4o-mini", timings.commentaryMs);
      if (stopIfCancelled()) return;
      await replaceReservedCommentary(commentaryRowId, row.id, commentary);
      if (stopIfCancelled()) return;
      timings.totalMs = Date.now() - pipelineStartedAt;
      resolveJob(jobId, { ...row, commentary, timings: { ...timings } });
      finishTracking(requestId, result.doc.steps?.length ?? 0, { intent });
      trackingFinished = true;
      logStageTimings("generate", "complete", timings);
    } catch (err: any) {
      if (!trackingFinished) {
        finishTracking(requestId, 0);
        trackingFinished = true;
      }
      timings.totalMs = Date.now() - pipelineStartedAt;
      // Abort/cancellation errors are expected — don't overwrite cancelled status.
      if (jobCancelled()) {
        logStageTimings("generate", "cancelled", timings);
      } else {
        logStageTimings("generate", "error", timings);
        console.error("[genius] generate failed:", err?.message);
        failJob(jobId, err instanceof GeniusStageTimeoutError
          ? `${err.stage} timed out. Your attachment and inputs are still available; retry the calculation.`
          : "Could not generate the calculation. Please retry.");
      }
    }
  })();
});

// Explain one persisted step. This is deliberately a separate endpoint from
// follow-up messages: explanation is a read-only chat turn and must never
// reach intent classification or the worksheet mutation path.
const explainStepSchema = withQualityMode({
  question: z.string().min(1).max(500),
});
router.post("/:id/steps/:stepId/explain", requireAI, async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = explainStepSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A question is required" });

  try {
    const [existing] = await withDbRetry(() =>
      db
        .select({ document: geniusCalculations.document })
        .from(geniusCalculations)
        .where(and(eq(geniusCalculations.id, id), eq(geniusCalculations.userId, req.user.id)))
        .limit(1),
    );
    if (!existing) return res.status(404).json({ error: "Not found" });
    const document = geniusCalculationDocSchema.parse(existing.document);
    const step = document.steps.find((candidate) => candidate.id === req.params.stepId);
    if (!step) return res.status(404).json({ error: "Calculation step not found" });

    const jobId = createJob(req.user.id);
    res.json({ jobId });

    (async () => {
      const signal = getJobSignal(jobId);
      const requestId = randomUUID();
      startTracking(requestId, {
        query: parsed.data.question,
        user_id: req.user?.id ?? null,
        ip_address: req.ip,
        user_agent: req.headers["user-agent"],
        country: req.headers["cf-ipcountry"] as string | undefined
          || req.headers["x-vercel-ip-country"] as string | undefined,
        city: req.headers["x-vercel-ip-city"] as string | undefined,
        search_mode: "genius_step_explanation",
      });
      try {
        const { answer } = await explainCalculationStep(document, step, parsed.data.expertMode, signal);
        if ((getJob(jobId, req.user.id) as any)?.status === "cancelled") {
          finishTracking(requestId, 0);
          return;
        }
        // This persists in the existing transcript only; no calculation row is
        // updated and therefore no values, versions, or recomputation can change.
        await saveChatTurn(id, parsed.data.question, answer);
        resolveJob(jobId, { type: "answer", reply: answer });
        finishTracking(requestId, 0, { intent: "question" });
      } catch (err: any) {
        finishTracking(requestId, 0);
        if ((getJob(jobId, req.user.id) as any)?.status !== "cancelled") {
          console.error("[genius] step explanation failed:", err?.message);
          failJob(jobId, "Could not explain this calculation step. Please try again.");
        }
      }
    })();
  } catch (err: any) {
    console.error("[genius] step explanation setup failed:", err?.message);
    res.status(500).json({ error: "Could not explain this calculation step" });
  }
});

// Send a follow-up instruction that mutates an existing calculation.
// Returns a job id immediately; the follow-up runs in the background.
const messageSchema = withQualityMode({
  message: z.string().min(1).max(4000),
  webSearch: z.boolean().optional().default(false),
  // Client correlation id so an interrupted client can find the exact result it requested.
  clientRequestId: z.string().min(1).max(64).optional(),
  // Full chat transcript for AI context.
  chatHistory: chatHistorySchema,
});
router.post("/:id/message", requireAI, async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A message is required" });

  // Fetch the existing row synchronously so we can 404/403 before creating the job.
  const [existing] = await withDbRetry(() =>
    db
      .select()
      .from(geniusCalculations)
      .where(and(eq(geniusCalculations.id, id), eq(geniusCalculations.userId, req.user.id)))
      .limit(1),
  );
  if (!existing) return res.status(404).json({ error: "Not found" });
  let current = geniusCalculationDocSchema.parse(existing.document);

  const jobId = createJob(req.user.id);
  res.json({ jobId });

  (async () => {
    const signal = getJobSignal(jobId);
    setJobProgress(jobId, "preparing approved calculation", 20);
    const jobCancelled = () => (getJob(jobId, req.user.id) as any)?.status === "cancelled";
    const requestId = randomUUID();
    const pipelineStartedAt = Date.now();
    const timings = newStageTimings(requestId, parsed.data.expertMode, parsed.data.phdMode, parsed.data.webSearch);
    let trackingFinished = false;
    let releaseMutation: (() => void) | undefined;
    startTracking(requestId, {
      query: parsed.data.message,
      user_id: req.user?.id ?? null,
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      country: req.headers["cf-ipcountry"] as string | undefined
        || req.headers["x-vercel-ip-country"] as string | undefined,
      city: req.headers["x-vercel-ip-city"] as string | undefined,
      search_mode: "genius_followup",
    });
    const stopIfCancelled = () => {
      if (!jobCancelled()) return false;
      timings.totalMs = Date.now() - pipelineStartedAt;
      if (!trackingFinished) {
        finishTracking(requestId, 0);
        trackingFinished = true;
      }
      logStageTimings("message", "cancelled", timings);
      return true;
    };
    try {
      releaseMutation = await acquireCalculationMutation(id, signal);
      if (stopIfCancelled()) return;
      // Another queued mutation may have completed after the route-level
      // ownership check. Generate from the latest verified document.
      const [latest] = await withDbRetry(() =>
        db
          .select({ document: geniusCalculations.document })
          .from(geniusCalculations)
          .where(and(eq(geniusCalculations.id, id), eq(geniusCalculations.userId, req.user.id)))
          .limit(1),
      );
      if (!latest) throw new Error("Calculation no longer exists");
      current = geniusCalculationDocSchema.parse(latest.document);

      const sourceTopic = `${current.projectTitle}: ${parsed.data.message}`.slice(0, 500);
      const [intentResult, sourceResult] = await Promise.all([
        classifyIntent(parsed.data.message, true, parsed.data.expertMode, signal, parsed.data.chatHistory),
        startReferenceLookup(sourceTopic, parsed.data.webSearch, signal),
      ]);
      const { intent } = intentResult;
      timings.routingMs = intentResult.durationMs ?? 0;
      timings.sourceLookupMs = sourceResult.durationMs;
      trackStage(requestId, "intent_routing", intentResult.model ?? "gpt-4o-mini", timings.routingMs, {
        prompt_tokens: intentResult.promptTokens ?? 0,
        completion_tokens: intentResult.completionTokens ?? 0,
        total_tokens: intentResult.totalTokens ?? 0,
      });
      if (parsed.data.webSearch) {
        trackStage(requestId, "source_lookup", "gpt-4o-mini", timings.sourceLookupMs);
      }
      if (stopIfCancelled()) return;
      if (intent === "question") {
        const { answer, calculationExample } = await answerQuestion(
          parsed.data.message,
          current,
          parsed.data.webSearch,
          parsed.data.expertMode,
          signal,
          parsed.data.chatHistory,
          sourceResult.refs,
        );
        // Persist the Q&A turn against the calculation it was asked about —
        // no document change, but it's still part of this calc's conversation.
        if (stopIfCancelled()) return;
        await saveChatTurn(id, parsed.data.message, answer);
        if (stopIfCancelled()) return;
        releaseMutation();
        releaseMutation = undefined;
        resolveJob(jobId, { type: "answer", reply: answer, calculationExample });
        timings.totalMs = Date.now() - pipelineStartedAt;
        finishTracking(requestId, 0, { intent });
        trackingFinished = true;
        logStageTimings("message", "complete", timings);
        return;
      }

      const result = await followUpCalculation(parsed.data.message, current, {
        webSearch: parsed.data.webSearch,
        expertMode: parsed.data.expertMode,
        phdMode: parsed.data.phdMode,
        webReferences: sourceResult.refs,
      }, signal, parsed.data.chatHistory);
      if (stopIfCancelled()) return;
      timings.expertGenerationMs = result.durationMs;
      timings.recomputationMs = result.recomputationMs;
      trackApiCall(requestId, {
        timestamp: Date.now(),
        service: "ai_followup",
        model: result.model,
        tokens: {
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
          total_tokens: result.totalTokens,
        },
        duration_ms: result.durationMs,
      });
      trackStage(requestId, "server_recompute", "deterministic", result.recomputationMs);
      if (stopIfCancelled()) return;

      const persistenceStartedAt = Date.now();
       const docWithVersion = {
         ...result.doc,
         details: current.details,
         versions: stampVersion(current.versions),
       };
       const row = await withDbRetry(() =>
         updateCalculationWithSnapshot(id, req.user.id, current, {
           title: docTitle(docWithVersion),
           document: docWithVersion,
           clientRequestId: parsed.data.clientRequestId ?? null,
           updatedAt: new Date(),
         }),
       );
       if (!row) throw new Error("Calculation not found");
      if (stopIfCancelled()) return;
      const commentaryRowId = await reserveCommentaryTurn(
        id,
        undefined,
        parsed.data.message,
        fallbackCommentary(docWithVersion),
      );
      if (stopIfCancelled()) return;
      timings.persistenceMs = Date.now() - persistenceStartedAt;
      timings.firstVerifiedMs = Date.now() - pipelineStartedAt;
      trackStage(requestId, "calculation_persistence", "database", timings.persistenceMs);
      publishVerifiedJob(jobId, { ...row, timings: { ...timings } });
      releaseMutation();
      releaseMutation = undefined;
      logStageTimings("message", "verified", timings);

      const commentaryStartedAt = Date.now();
      const commentary = await generateCommentary(result.doc, {
        kind: "update",
        userMessage: parsed.data.message,
        previous: current,
      }, parsed.data.expertMode, signal);
      timings.commentaryMs = Date.now() - commentaryStartedAt;
      trackStage(requestId, "calculation_commentary", "gpt-4o-mini", timings.commentaryMs);
      if (stopIfCancelled()) return;
      await replaceReservedCommentary(commentaryRowId, id, commentary);
      if (stopIfCancelled()) return;
      timings.totalMs = Date.now() - pipelineStartedAt;
      resolveJob(jobId, { ...row, commentary, timings: { ...timings } });
      finishTracking(requestId, result.doc.steps?.length ?? 0, { intent });
      trackingFinished = true;
      logStageTimings("message", "complete", timings);
    } catch (err: any) {
      if (!trackingFinished) {
        finishTracking(requestId, 0);
        trackingFinished = true;
      }
      timings.totalMs = Date.now() - pipelineStartedAt;
      if (jobCancelled()) {
        logStageTimings("message", "cancelled", timings);
      } else {
        logStageTimings("message", "error", timings);
        console.error("[genius] message failed:", err?.message);
        failJob(jobId, err instanceof GeniusStageTimeoutError
          ? `${err.stage} timed out. The saved calculation was not changed; retry the update.`
          : "Calculation update failed. Please retry.");
      }
    } finally {
      releaseMutation?.();
    }
  })();
});

// Deterministically recompute after the user edits inputs/assumptions.
const recalcSchema = withQualityMode({
  document: geniusCalculationDocSchema,
  // Client correlation id — stored so a concurrent message-recovery poll won't
  // mistake this recalc for the dropped message request's result.
  clientRequestId: z.string().min(1).max(64).optional(),
});
router.post("/:id/recalc", async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = recalcSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid document" });
  let releaseMutation: (() => void) | undefined;
  try {
    releaseMutation = await acquireCalculationMutation(id);
    const [existing] = await withDbRetry(() =>
      db
        .select()
        .from(geniusCalculations)
        .where(and(eq(geniusCalculations.id, id), eq(geniusCalculations.userId, req.user.id)))
        .limit(1),
    );
    if (!existing) return res.status(404).json({ error: "Not found" });
    const previousParse = geniusCalculationDocSchema.safeParse(existing.document);
    const existingVersions = previousParse.success ? previousParse.data.versions : [];
    const recomputed = recomputeDoc(parsed.data.document);
    const previous = previousParse.success ? previousParse.data : undefined;
    // Refresh expertSummary and generate commentary in parallel so the saved
    // doc always reflects the current computed values in both places.
    const [freshSummary, commentary] = await Promise.all([
      refreshExpertSummary(recomputed, previous),
      generateCommentary(recomputed, {
        kind: "recalc",
        previous,
      }, parsed.data.expertMode),
    ]);
    const doc = {
      ...recomputed,
      details: previous?.details,
      expertSummary: freshSummary,
      versions: stampVersion(existingVersions),
    };
    const row = await withDbRetry(() =>
      updateCalculationWithSnapshot(id, req.user.id, previous!, {
        title: docTitle(doc),
        document: doc,
        clientRequestId: parsed.data.clientRequestId ?? null,
        updatedAt: new Date(),
      }),
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    // Recalcs have no free-text user prompt (they're triggered by editing
    // inputs), so record a synthetic note alongside the reasoned reply —
    // this keeps the persisted transcript complete for calcs with edits.
    await saveChatTurn(id, "Recalculated after editing inputs/assumptions.", commentary);
    res.json({ ...row, commentary });
  } catch (err: any) {
    console.error("[genius] recalc failed:", err?.message);
    res.status(500).json({ error: "Could not recalculate" });
  } finally {
    releaseMutation?.();
  }
});

// Save an example/edited document as a new calculation.
const saveSchema = z.object({ document: geniusCalculationDocSchema });
router.post("/", async (req: any, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid document" });
  try {
    const doc = { ...recomputeDoc(parsed.data.document), versions: stampVersion([]) };
    const row = await withDbRetry(() =>
      insertCalculationWithSnapshot({ userId: req.user.id, title: docTitle(doc), document: doc }),
    );
    await pruneUnpinnedHistory(req.user.id);
    res.json(row);
  } catch (err: any) {
    console.error("[genius] save failed:", err?.message);
    res.status(500).json({ error: "Could not save calculation" });
  }
});

// ---------------------------------------------------------------------------
// Upload an image or PDF → store it, understand it, and propose a reviewable
// "calculation task" (the calculation is only built after user approval).
// ---------------------------------------------------------------------------

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Maximum pages rendered from a scanned PDF — avoids memory/timeout issues with large files. */
const MAX_SCANNED_PDF_PAGES = 3;
/** Render density (dpi) — 150 keeps JPEG images well under the gpt-4o 20 MB/image limit. */
const SCANNED_PDF_DENSITY = 150;

const geniusUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype) || file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only images (PNG, JPEG, WebP, GIF) and PDF documents are supported"));
    }
  },
});

// Generate a reviewable proposal from plain text (no file upload needed).
const planBodySchema = withQualityMode({ text: z.string().min(1).max(8000) });
const examplePlanBodySchema = withQualityMode({
  example: z.object({
    request: z.string().min(1).max(4000),
    method: z.string().min(1).max(6000),
  }),
});
router.post("/plan/example", requireAI, async (req: any, res) => {
  const parsed = examplePlanBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A calculation explanation is required" });
  try {
    const result = await proposeTaskFromExplanation(
      parsed.data.example,
      parsed.data.expertMode,
      parsed.data.phdMode,
    );
    return res.json({
      proposal: result.proposal,
      reply: result.reply || "Here is a reviewable calculation example. AI-supplied assumptions are listed below—review or edit them before approving the build.",
    });
  } catch (err: any) {
    console.error("[genius] example plan failed:", err?.message);
    return res.status(500).json({ error: "Could not prepare a calculation example. Please try again." });
  }
});
router.post("/plan", requireAI, async (req: any, res) => {
  const parsed = planBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A text description is required" });
  try {
    const result = await proposeTaskFromText(
      parsed.data.text,
      parsed.data.expertMode,
      parsed.data.phdMode,
    );
    return res.json({
      proposal: result.proposal,
      reply: result.reply || proposalFallbackReply(result.proposal, "upload"),
    });
  } catch (err: any) {
    console.error("[genius] plan failed:", err?.message);
    return res.status(500).json({ error: "Could not generate a plan. Please try again." });
  }
});

router.post("/upload", requireAI, (req: any, res) => {
  geniusUpload.single("file")(req, res, async (multerErr: any) => {
    if (multerErr) {
      const msg =
        multerErr.code === "LIMIT_FILE_SIZE"
          ? "File exceeds the 15 MB limit. Please compress or crop it and try again."
          : multerErr.message || "Upload failed";
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: "A file is required" });

    const file = req.file as Express.Multer.File;
    const kind: "image" | "pdf" = file.mimetype === "application/pdf" ? "pdf" : "image";
    const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 2000) : undefined;
    const uploadModes = {
      expertMode: req.body?.expertMode === true || req.body?.expertMode === "true",
      phdMode: req.body?.phdMode === true || req.body?.phdMode === "true",
    };
    if (uploadModes.expertMode && uploadModes.phdMode) {
      return res.status(400).json({ error: "Expert and PhD modes cannot be enabled together" });
    }
    const requestId = randomUUID();
    startTracking(requestId, {
      query: `[upload] ${file.originalname}`,
      user_id: req.user?.id ?? null,
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      country: req.headers["cf-ipcountry"] as string | undefined
        || req.headers["x-vercel-ip-country"] as string | undefined,
      city: req.headers["x-vercel-ip-city"] as string | undefined,
      search_mode: "genius_upload",
    });

    try {
      // 1) Understand the document first — if this fails we don't store junk.
      let pdfText: string | undefined;
      let imageDataUrl: string | undefined;
      let imageDataUrls: string[] | undefined;
      let pdfDataUrl: string | undefined;
      if (kind === "pdf") {
        try {
          pdfText = await extractPdfTextFromBuffer(file.buffer);
        } catch {
          // Text extraction failed — likely a scanned / image-only PDF.
          // Render the first N pages with pdf2pic (capped at MAX_SCANNED_PDF_PAGES)
          // so we pass vision-friendly JPEG images instead of large raw PDF bytes.
          // Fall back to the raw-PDF vision path if rendering is unavailable.
          console.info("[genius] PDF has no extractable text — attempting pdf2pic render");
          try {
            const { fromBuffer } = await import("pdf2pic");

            // Determine actual page count so we never request non-existent pages.
            let actualPageCount = MAX_SCANNED_PDF_PAGES;
            try {
              const pdfParse = (await import("pdf-parse")).default;
              const meta = await pdfParse(file.buffer, { max: 0 } as any);
              if (meta.numpages > 0) actualPageCount = meta.numpages;
            } catch {
              // Ignore — fall back to the configured cap.
            }

            const pagesToRender = Math.min(MAX_SCANNED_PDF_PAGES, actualPageCount);
            const convert = fromBuffer(file.buffer, {
              density: SCANNED_PDF_DENSITY,
              format: "jpeg",
              width: 2000,
              height: 2800,
            });
            const pageNumbers = Array.from({ length: pagesToRender }, (_, i) => i + 1);
            const pages = await convert.bulk(pageNumbers, { responseType: "base64" });
            const validPages = pages.filter((p: any) => p?.base64);

            if (validPages.length > 0) {
              imageDataUrls = validPages.map((p: any) => `data:image/jpeg;base64,${p.base64}`);
              console.info(`[genius] rendered ${imageDataUrls.length} page(s) from scanned PDF`);
            } else {
              // pdf2pic produced no output — fall back to raw PDF vision.
              console.warn("[genius] pdf2pic returned no pages — falling back to raw PDF vision");
              pdfDataUrl = `data:application/pdf;base64,${file.buffer.toString("base64")}`;
            }
          } catch (renderErr: any) {
            // Rendering failed (e.g. missing system dependency) — fall back to
            // the raw PDF bytes so the upload remains functional.
            console.warn("[genius] pdf2pic render failed, using raw PDF vision fallback:", renderErr?.message);
            pdfDataUrl = `data:application/pdf;base64,${file.buffer.toString("base64")}`;
          }
        }
      } else {
        imageDataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      }

      // 2) Persist the attachment on this app's private storage volume.
      let url = "";
      try {
        const storage = new ObjectStorageService();
        url = await storage.uploadFileBuffer(
          file.buffer,
          file.mimetype,
          "genius",
          file.originalname,
          { owner: req.user.id, visibility: "private" },
        );
      } catch (storageErr: any) {
        finishTracking(requestId, 0);
        console.error("[genius] attachment storage failed:", storageErr?.message);
        res.status(503).json({ error: "Could not save the attachment. Please try again." });
        return;
      }

      const attachment: GeniusAttachment = {
        id: randomUUID(),
        kind,
        name: file.originalname,
        url,
        mimeType: file.mimetype,
        size: file.size,
      };

      // 3) Propose the calculation task for review.
      const result = await proposeTaskFromDocument(
        { kind, name: file.originalname, imageDataUrl, imageDataUrls, pdfDataUrl, pdfText },
        note,
        uploadModes.expertMode,
        uploadModes.phdMode,
      );
      trackApiCall(requestId, {
        timestamp: Date.now(),
        service: "ai_propose_task",
        model: result.model,
        tokens: {
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
          total_tokens: result.totalTokens,
        },
        duration_ms: result.durationMs,
      });
      finishTracking(requestId, 1);
      res.json({
        attachment,
        proposal: result.proposal,
        reply: result.reply || proposalFallbackReply(result.proposal, "upload"),
      });
    } catch (err: any) {
      finishTracking(requestId, 0);
      console.error("[genius] upload failed:", err?.message);
      res.status(500).json({ error: "Could not analyze the uploaded file. Please try again." });
    }
  });
});

// Conversationally revise a pending proposal before it is approved.
const refineSchema = withQualityMode({
  proposal: geniusTaskProposalSchema,
  message: z.string().min(1).max(4000),
});
router.post("/proposal/refine", requireAI, async (req: any, res) => {
  const parsed = refineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A proposal and message are required" });
  try {
    const result = await refineTaskProposal(
      parsed.data.proposal,
      parsed.data.message,
      parsed.data.expertMode,
      parsed.data.phdMode,
    );
    res.json({
      proposal: result.proposal,
      reply: result.reply || proposalFallbackReply(result.proposal, "refine"),
    });
  } catch (err: any) {
    console.error("[genius] proposal refine failed:", err?.message);
    res.status(500).json({ error: "Could not update the proposal. Please try again." });
  }
});

// Approve a proposal → build the full deterministic calculation.
// Returns a job id immediately; the build runs in the background.
const buildSchema = withQualityMode({
  proposal: geniusTaskProposalSchema,
  webSearch: z.boolean().optional().default(false),
  // Client correlation id so an interrupted client can find its finished result.
  clientRequestId: z.string().min(1).max(64).optional(),
  // The plan/upload/refine conversation that led to this proposal — persisted
  // in full against the resulting calculation so the real history survives,
  // not just a synthetic "Approved" placeholder.
  chatHistory: chatHistorySchema,
});
router.post("/proposal/build", requireAI, async (req: any, res) => {
  const parsed = buildSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A proposal is required" });

  const jobId = createJob(req.user.id);
  res.json({ jobId });

  (async () => {
    const signal = getJobSignal(jobId);
    const jobCancelled = () => (getJob(jobId, req.user.id) as any)?.status === "cancelled";

    const requestId = randomUUID();
    const pipelineStartedAt = Date.now();
    const timings = newStageTimings(requestId, parsed.data.expertMode, parsed.data.phdMode, parsed.data.webSearch);
    let trackingFinished = false;
    startTracking(requestId, {
      query: `[build] ${parsed.data.proposal.title}`,
      user_id: req.user?.id ?? null,
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
      country: req.headers["cf-ipcountry"] as string | undefined
        || req.headers["x-vercel-ip-country"] as string | undefined,
      city: req.headers["x-vercel-ip-city"] as string | undefined,
      search_mode: "genius_build",
    });
    const stopIfCancelled = () => {
      if (!jobCancelled()) return false;
      timings.totalMs = Date.now() - pipelineStartedAt;
      if (!trackingFinished) {
        finishTracking(requestId, 0);
        trackingFinished = true;
      }
      logStageTimings("build", "cancelled", timings);
      return true;
    };
    try {
      const sourceTopic = `${parsed.data.proposal.title}: ${parsed.data.proposal.problem}`.slice(0, 500);
      const sourceResult = await startReferenceLookup(sourceTopic, parsed.data.webSearch, signal);
      timings.sourceLookupMs = sourceResult.durationMs;
      if (parsed.data.webSearch) {
        trackStage(requestId, "source_lookup", "gpt-4o-mini", timings.sourceLookupMs);
      }
      setJobProgress(jobId, "building verified calculation", 35);
      const result = await generateFromProposal(parsed.data.proposal, {
        webSearch: parsed.data.webSearch,
        expertMode: parsed.data.expertMode,
        phdMode: parsed.data.phdMode,
        webReferences: sourceResult.refs,
      }, signal);
      if (stopIfCancelled()) return;
      timings.expertGenerationMs = result.durationMs;
      timings.recomputationMs = result.recomputationMs;
      trackApiCall(requestId, {
        timestamp: Date.now(),
        service: "ai_generate",
        model: result.model,
        tokens: {
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
          total_tokens: result.totalTokens,
        },
        duration_ms: result.durationMs,
      });
      trackStage(requestId, "server_recompute", "deterministic", result.recomputationMs);
      if (stopIfCancelled()) return;

      setJobProgress(jobId, "saving verified calculation", 75);
      const persistenceStartedAt = Date.now();
      const docWithVersion = { ...result.doc, versions: stampVersion([]) };
      const row = await withDbRetry(() =>
        insertCalculationWithSnapshot({
          userId: req.user.id,
          title: docTitle(docWithVersion),
          document: docWithVersion,
          clientRequestId: parsed.data.clientRequestId ?? null,
        }),
      );
      await pruneUnpinnedHistory(req.user.id);
      if (stopIfCancelled()) return;
      const commentaryRowId = await reserveCommentaryTurn(
        row.id,
        parsed.data.chatHistory,
        "Approved — build the calculation.",
        fallbackCommentary(docWithVersion),
      );
      if (stopIfCancelled()) return;
      timings.persistenceMs = Date.now() - persistenceStartedAt;
      timings.firstVerifiedMs = Date.now() - pipelineStartedAt;
      trackStage(requestId, "calculation_persistence", "database", timings.persistenceMs);
      publishVerifiedJob(jobId, { ...row, timings: { ...timings } });
      logStageTimings("build", "verified", timings);

      setJobProgress(jobId, "adding optional engineering commentary", 92);
      const commentaryStartedAt = Date.now();
      const commentary = await generateCommentary(result.doc, { kind: "build" }, parsed.data.expertMode, signal);
      timings.commentaryMs = Date.now() - commentaryStartedAt;
      trackStage(requestId, "calculation_commentary", "gpt-4o-mini", timings.commentaryMs);
      if (stopIfCancelled()) return;
      await replaceReservedCommentary(commentaryRowId, row.id, commentary);
      if (stopIfCancelled()) return;
      timings.totalMs = Date.now() - pipelineStartedAt;
      resolveJob(jobId, { ...row, commentary, timings: { ...timings } });
      finishTracking(requestId, result.doc.steps?.length ?? 0);
      trackingFinished = true;
      logStageTimings("build", "complete", timings);
    } catch (err: any) {
      if (!trackingFinished) {
        finishTracking(requestId, 0);
        trackingFinished = true;
      }
      timings.totalMs = Date.now() - pipelineStartedAt;
      if (jobCancelled()) {
        logStageTimings("build", "cancelled", timings);
      } else {
        logStageTimings("build", "error", timings);
        console.error("[genius] proposal build failed:", err?.message);
        failJob(jobId, err instanceof GeniusStageTimeoutError
          ? `${err.stage} timed out. The approved proposal is unchanged; retry the build.`
          : "Calculation build failed. Please retry.");
      }
    }
  })();
});

router.delete("/:id", async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    await withDbRetry(() =>
      db
        .delete(geniusCalculations)
        .where(and(eq(geniusCalculations.id, id), eq(geniusCalculations.userId, req.user.id))),
    );
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[genius] delete failed:", err?.message);
    res.status(500).json({ error: "Could not delete calculation" });
  }
});

// ---------------------------------------------------------------------------
// Admin-only: Genius X1 generation model settings.
// ---------------------------------------------------------------------------

function requireAdmin(req: any, res: any, next: any) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

router.get("/admin/settings", requireAdmin, async (_req, res) => {
  try {
    const settings = await getGeniusSettings();
    res.json(settings);
  } catch (err: any) {
    console.error("[genius] admin get settings failed:", err?.message);
    res.status(500).json({ error: "Could not load settings" });
  }
});

const adminSettingsSchema = z.object({
  generationModel: z.enum(["gpt-4o", "gpt-4o-mini", "o3", "o3-mini", "gpt-5.4-2026-03-05", "gpt-5.6-sol"]).optional(),
  reasoningEffort: z.enum(["none", "low", "medium", "high"]).optional(),
  temperature: z.coerce.number().min(0).max(1).optional(),
});

router.put("/admin/settings", requireAdmin, async (req: any, res) => {
  const parsed = adminSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid settings", issues: parsed.error.issues });
  try {
    const updated = await saveGeniusSettings({
      ...parsed.data,
      temperature: parsed.data.temperature !== undefined ? String(parsed.data.temperature) : undefined,
    });
    res.json(updated);
  } catch (err: any) {
    console.error("[genius] admin save settings failed:", err?.message);
    res.status(500).json({ error: "Could not save settings" });
  }
});

export default router;
