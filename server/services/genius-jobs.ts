/**
 * Durable job state for long-running Genius work.
 *
 * The in-process controller is only an execution aid. Every user-visible
 * transition is mirrored to Postgres, so polling can recover completed work
 * after a deployment handoff. A pending job found after a handoff is reported
 * as retryable rather than pretending that the provider is still running.
 */
import { randomUUID } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, withDbRetry } from "../db.js";
import { geniusJobs } from "../../shared/schema.js";

export type JobStatus = "pending" | "verified" | "done" | "error" | "cancelled";
export interface Job {
  userId: string;
  status: JobStatus;
  stage: string;
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: number;
  verifiedDelivered?: boolean;
  verifiedResult?: unknown;
  verifiedPending?: boolean;
}

const jobs = new Map<string, Job>();
const controllers = new Map<string, AbortController>();
const JOB_TTL_MS = 24 * 60 * 60 * 1000;
let durableStoreUnavailable = process.env.NODE_ENV === "test";

function mirror(id: string, job: Job, payload?: unknown) {
  if (durableStoreUnavailable) return;
  // Defer persistence one turn so starting a job never delays the AI pipeline
  // behind a database connection attempt.
  void Promise.resolve().then(() => withDbRetry(() => db.insert(geniusJobs).values({
    id, userId: job.userId, kind: "calculation", status: job.status,
    stage: job.stage, progress: job.progress, payload,
    result: job.result ?? null, error: job.error ?? null,
    createdAt: new Date(job.createdAt), updatedAt: new Date(),
    expiresAt: new Date(job.createdAt + JOB_TTL_MS),
  }).onConflictDoUpdate({
    target: geniusJobs.id,
    set: { status: job.status, stage: job.stage, progress: job.progress,
      result: job.result ?? null, error: job.error ?? null, updatedAt: new Date() },
  }))).catch((err) => {
    durableStoreUnavailable = true;
    console.error("[genius] durable job write failed:", err?.message);
  });
}

export function createJob(userId: string, payload?: unknown): string {
  const id = randomUUID();
  const job: Job = { userId, status: "pending", stage: "queued", progress: 0, createdAt: Date.now() };
  jobs.set(id, job);
  controllers.set(id, new AbortController());
  mirror(id, job, payload);
  return id;
}

export function getJobSignal(id: string): AbortSignal | undefined { return controllers.get(id)?.signal; }
export function getJob(id: string, userId: string): Job | null | "forbidden" {
  const job = jobs.get(id);
  if (!job) return null;
  return job.userId === userId ? job : "forbidden";
}
export function setJobProgress(id: string, stage: string, progress: number) {
  const job = jobs.get(id);
  if (!job || job.status !== "pending") return;
  job.stage = stage; job.progress = Math.max(0, Math.min(100, progress));
  mirror(id, job);
}
export function publishVerifiedJob(id: string, result: unknown): void {
  const job = jobs.get(id); if (!job || job.status !== "pending") return;
  job.status = "verified"; job.stage = "post-processing"; job.progress = 90; job.result = result; mirror(id, job);
}
export function resolveJob(id: string, result: unknown): void {
  const job = jobs.get(id); if (!job || (job.status !== "pending" && job.status !== "verified")) return;
  const verifiedResult = job.status === "verified" && !job.verifiedDelivered ? job.result : undefined;
  job.status = "done"; job.stage = "complete"; job.progress = 100; job.result = result;
  if (verifiedResult !== undefined) { job.verifiedResult = verifiedResult; job.verifiedPending = true; }
  controllers.delete(id); mirror(id, job);
}
export function failJob(id: string, error: string): void {
  const job = jobs.get(id); if (!job || (job.status !== "pending" && job.status !== "verified")) return;
  if (job.status === "verified") return resolveJob(id, job.result);
  job.status = "error"; job.stage = "failed"; job.error = error; controllers.delete(id); mirror(id, job);
}
export function cancelJob(id: string, userId: string): "ok" | "not_found" | "forbidden" | "already_done" {
  const job = jobs.get(id);
  if (!job) return "not_found";
  if (job.userId !== userId) return "forbidden";
  if (job.status !== "pending" && job.status !== "verified") return "already_done";
  job.status = "cancelled"; job.stage = "cancelled"; controllers.get(id)?.abort(); controllers.delete(id); mirror(id, job);
  return "ok";
}
export function getJobUpdate(id: string, userId: string): Job | null | "forbidden" {
  const job = getJob(id, userId);
  if (!job || job === "forbidden") return job;
  if (job.status === "verified") { job.verifiedDelivered = true; return job; }
  if (job.status === "done" && job.verifiedPending) {
    job.verifiedPending = false;
    return { userId: job.userId, status: "verified", stage: "post-processing", progress: 90, result: job.verifiedResult, createdAt: job.createdAt };
  }
  return job;
}

/** Hydrate a completed job, or turn an orphaned in-flight handoff into a retryable error. */
export async function getDurableJobUpdate(id: string, userId: string): Promise<Job | null | "forbidden"> {
  const inMemory = getJobUpdate(id, userId);
  if (inMemory) return inMemory;
  if (durableStoreUnavailable) return null;
  let row: typeof geniusJobs.$inferSelect | undefined;
  try {
    [row] = await withDbRetry(() => db.select().from(geniusJobs).where(and(eq(geniusJobs.id, id), gt(geniusJobs.expiresAt, new Date()))).limit(1));
  } catch (err: any) {
    // A rolling schema deploy must keep the existing in-memory generation
    // path usable until the migration has reached every instance.
    durableStoreUnavailable = true;
    console.warn("[genius] durable job lookup unavailable:", err?.message);
    return null;
  }
  if (!row) return null;
  if (row.userId !== userId) return "forbidden";
  if (row.status === "pending" || row.status === "verified") {
    const orphan: Job = { userId, status: "error", stage: "interrupted", progress: Number(row.progress), error: "This calculation was interrupted by a deployment handoff. Retry it to continue.", createdAt: row.createdAt.getTime() };
    jobs.set(id, orphan); mirror(id, orphan);
    return orphan;
  }
  return { userId, status: row.status as JobStatus, stage: row.stage, progress: row.progress, result: row.result ?? undefined, error: row.error ?? undefined, createdAt: row.createdAt.getTime() };
}