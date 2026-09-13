import { apiRequest } from "@/lib/queryClient";
import type {
  GeniusAnswerResponse,
  GeniusAttachment,
  GeniusCalculationDoc,
  GeniusCalculationRow,
  GeniusCalculationVersion,
  GeniusCalculationVersionSnapshot,
  GeniusStepComment,
  GeniusTaskProposal,
  GeniusCalculationExampleContext,
} from "./types";

/** Thrown by pollJob when the server reports the job was cancelled. */
export class CancelledError extends Error {
  constructor() {
    super("Job cancelled");
    this.name = "CancelledError";
  }
}

export type CalcOrAnswer = GeniusCalculationRow | GeniusAnswerResponse;

/**
 * Poll the server until a background job reaches "done" or "error".
 *
 * Backoff: 1 s, 2 s, 3 s, 4 s, 5 s, then 5 s until the server's durable job
 * reaches a terminal state. The browser must not invent a shorter deadline.
 * Network errors during individual polls are swallowed and retried — the
 * connection itself is short-lived so proxy timeouts cannot affect polling.
 */
const POLL_DELAYS_MS = [
  1000, 2000, 3000, 4000, 5000,
];
export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export async function generateCalc(
  prompt: string,
  webSearch: boolean,
  expertMode = false,
  phdMode = false,
  clientRequestId?: string,
  onJobId?: (jobId: string) => void,
  signal?: AbortSignal,
  chatHistory?: ChatHistoryItem[],
  onVerified?: (result: GeniusCalculationRow) => void,
): Promise<CalcOrAnswer> {
  const response = await apiRequest("/api/genius/generate", {
    method: "POST",
    body: JSON.stringify({ prompt, webSearch, expertMode, phdMode, clientRequestId, chatHistory }),
  });
  // Q&A answers are returned inline (fast, no job needed).
  if (response?.type === "answer") return response as GeniusAnswerResponse;
  // Calculation: server returned a jobId — poll until the result is ready.
  onJobId?.(response.jobId);
  return pollJob<GeniusCalculationRow>(response.jobId, signal, onVerified);
}

export async function messageCalc(
  id: number,
  message: string,
  webSearch: boolean,
  expertMode = false,
  phdMode = false,
  clientRequestId?: string,
  onJobId?: (jobId: string) => void,
  signal?: AbortSignal,
  chatHistory?: ChatHistoryItem[],
  onVerified?: (result: GeniusCalculationRow) => void,
): Promise<CalcOrAnswer> {
  const response = await apiRequest(`/api/genius/${id}/message`, {
    method: "POST",
    body: JSON.stringify({ message, webSearch, expertMode, phdMode, clientRequestId, chatHistory }),
  });
  // Q&A answers are returned inline.
  if (response?.type === "answer") return response as GeniusAnswerResponse;
  // Follow-up calculation: poll for the result.
  onJobId?.(response.jobId);
  return pollJob<GeniusCalculationRow>(response.jobId, signal, onVerified);
}

/** Ask for an explanation of one saved calculation step without changing the worksheet. */
export async function explainCalculationStep(
  id: number,
  stepId: string,
  question: string,
  expertMode = false,
  phdMode = false,
  onJobId?: (jobId: string) => void,
  signal?: AbortSignal,
): Promise<GeniusAnswerResponse> {
  const response = await apiRequest(`/api/genius/${id}/steps/${encodeURIComponent(stepId)}/explain`, {
    method: "POST",
    body: JSON.stringify({ question, expertMode, phdMode }),
  });
  onJobId?.(response.jobId);
  return pollJob<GeniusAnswerResponse>(response.jobId, signal);
}

export async function recalcCalc(
  id: number,
  document: GeniusCalculationDoc,
  clientRequestId?: string,
): Promise<GeniusCalculationRow> {
  return apiRequest(`/api/genius/${id}/recalc`, {
    method: "POST",
    body: JSON.stringify({ document, clientRequestId }),
  });
}

export async function saveCalc(document: GeniusCalculationDoc): Promise<GeniusCalculationRow> {
  return apiRequest("/api/genius", {
    method: "POST",
    body: JSON.stringify({ document }),
  });
}

export async function deleteCalc(id: number): Promise<void> {
  await apiRequest(`/api/genius/${id}`, { method: "DELETE" });
}

export async function patchCalc(id: number, patch: { title?: string; pinned?: boolean }): Promise<void> {
  await apiRequest(`/api/genius/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function createStepComment(id: number, stepId: string, content: string): Promise<GeniusStepComment> {
  return apiRequest(`/api/genius/${id}/steps/${encodeURIComponent(stepId)}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export async function updateStepComment(
  id: number,
  stepId: string,
  commentId: number,
  content: string,
): Promise<GeniusStepComment> {
  return apiRequest(`/api/genius/${id}/steps/${encodeURIComponent(stepId)}/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

export async function deleteStepComment(id: number, stepId: string, commentId: number): Promise<void> {
  await apiRequest(`/api/genius/${id}/steps/${encodeURIComponent(stepId)}/comments/${commentId}`, {
    method: "DELETE",
  });
}

export type CalculationDetails = NonNullable<GeniusCalculationDoc["details"]>;

export async function saveCalculationDetails(
  id: number,
  details: CalculationDetails,
): Promise<GeniusCalculationDoc> {
  const response = await apiRequest(`/api/genius/${id}/details`, {
    method: "PATCH",
    body: JSON.stringify(details),
  });
  return response.document;
}

export async function getCalculationVersions(id: number): Promise<GeniusCalculationVersion[]> {
  return apiRequest(`/api/genius/${id}/versions`);
}

export async function getCalculationVersion(
  id: number,
  version: number,
): Promise<GeniusCalculationVersionSnapshot> {
  return apiRequest(`/api/genius/${id}/versions/${version}`);
}

export interface UploadResponse {
  attachment: GeniusAttachment;
  proposal: GeniusTaskProposal;
  /** Contextual assistant reply explaining what was understood. */
  reply?: string;
}

export async function uploadDocument(file: File, note?: string, expertMode = false, phdMode = false): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  if (note) form.append("note", note);
  form.append("expertMode", String(expertMode));
  form.append("phdMode", String(phdMode));
  return apiRequest("/api/genius/upload", { method: "POST", body: form });
}

export interface PlanResponse {
  proposal: GeniusTaskProposal;
  reply?: string;
}

export async function planCalculationExample(
  example: GeniusCalculationExampleContext,
  expertMode = false,
  phdMode = false,
): Promise<PlanResponse> {
  return apiRequest("/api/genius/plan/example", {
    method: "POST",
    body: JSON.stringify({ example, expertMode, phdMode }),
  });
}

export async function planFromText(
  text: string,
  expertMode = false,
  phdMode = false,
): Promise<PlanResponse> {
  return apiRequest("/api/genius/plan", {
    method: "POST",
    body: JSON.stringify({ text, expertMode, phdMode }),
  });
}

export async function refineProposal(
  proposal: GeniusTaskProposal,
  message: string,
  expertMode = false,
  phdMode = false,
): Promise<{ proposal: GeniusTaskProposal; reply?: string }> {
  return apiRequest("/api/genius/proposal/refine", {
    method: "POST",
    body: JSON.stringify({ proposal, message, expertMode, phdMode }),
  });
}

export async function buildFromProposal(
  proposal: GeniusTaskProposal,
  webSearch: boolean,
  expertMode = false,
  phdMode = false,
  clientRequestId?: string,
  onJobId?: (jobId: string) => void,
  signal?: AbortSignal,
  chatHistory?: ChatHistoryItem[],
  onVerified?: (result: GeniusCalculationRow) => void,
): Promise<GeniusCalculationRow> {
  const response = await apiRequest("/api/genius/proposal/build", {
    method: "POST",
    body: JSON.stringify({ proposal, webSearch, expertMode, phdMode, clientRequestId, chatHistory }),
  });
  // Build always creates a calculation — poll for the result.
  onJobId?.(response.jobId);
  return pollJob<GeniusCalculationRow>(response.jobId, signal, onVerified);
}

/** Cancel a running background job. Resolves silently even on benign races. */
export async function cancelJobRequest(jobId: string): Promise<void> {
  try {
    await apiRequest(`/api/genius/jobs/${jobId}`, { method: "DELETE" });
  } catch {
    // Ignore network errors — the UI clears busy state regardless.
  }
}

export async function pollJob<T>(
  jobId: string,
  signal?: AbortSignal,
  onVerified?: (result: T) => void,
): Promise<T> {
  let verifiedDelivered = false;
  let attempt = 0;
  while (true) {
    const delay = POLL_DELAYS_MS[Math.min(attempt++, POLL_DELAYS_MS.length - 1)] ?? 5000;
    // Check for client-side abort before each wait so cancellation is instant.
    if (signal?.aborted) throw new CancelledError();
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    if (signal?.aborted) throw new CancelledError();
    let response: any;
    try {
      response = await apiRequest(`/api/genius/jobs/${jobId}`);
    } catch {
      // Network error on this particular poll — retry after the next interval.
      continue;
    }
    if (response.status === "done") return response.result as T;
    if (response.status === "verified" && !verifiedDelivered) {
      verifiedDelivered = true;
      onVerified?.(response.result as T);
    }
    if (response.status === "cancelled") throw new CancelledError();
    if (response.status === "error") {
      throw new Error(response.error ?? "Generation failed — please try again.");
    }
    // status === "pending" → keep polling
  }
}
