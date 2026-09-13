import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { buildChatApp } from "../helpers/app";
import { mintMemberToken, authHeader } from "../helpers/auth";
import { seedUser, closeDatabaseConnection } from "../helpers/db";

/**
 * Background job lifecycle — GET /api/genius/jobs/:jobId
 *
 * Verifies:
 *   - 404 for an unknown job id
 *   - pending status while generation is still in flight
 *   - done status with the full result after generation succeeds
 *   - error status when the generation step throws
 *   - 403 when a different authenticated user tries to poll another user's job
 */

const mocks = vi.hoisted(() => ({
  chatCreate: vi.fn(),
  responsesCreate: vi.fn(),
  // Tracks classifyIntent calls so tests can assert on chatHistory forwarding.
  classifyIntent: vi.fn(),
}));

vi.mock("openai", () => {
  const MockOpenAI = function (this: any) {
    return {
      chat: { completions: { create: mocks.chatCreate } },
      responses: { create: mocks.responsesCreate },
    };
  };
  return { default: MockOpenAI, OpenAI: MockOpenAI };
});

// Prevent classifyIntent from consuming chatCreate mocks reserved for generation.
vi.mock("../../server/services/genius-service.js", async (importOriginal) => {
  const mod = await importOriginal<any>();
  return {
    ...mod,
    classifyIntent: mocks.classifyIntent,
  };
});

const VALID_DOC_JSON = JSON.stringify({
  projectTitle: "Test Power Calc",
  problemStatement: "Compute power from force.",
  inputs: [
    { id: "i1", symbol: "F", label: "Force", value: 100, unit: "N", editable: true },
    { id: "i2", symbol: "v", label: "Velocity", value: 2, unit: "m/s", editable: true },
  ],
  assumptions: [],
  steps: [
    {
      id: "s1",
      symbol: "P",
      title: "Power",
      description: "",
      formula: "P = Fv",
      expr: "F * v",
      calculation: "",
      result: "",
      unit: "W",
      sources: [1],
      warnings: [],
    },
  ],
  results: [{ id: "r1", label: "Power", symbol: "P", value: "", unit: "W", sources: [1] }],
  references: [{ id: 1, title: "Ref", url: "https://example.com" }],
  confidence: { score: 80, explanation: "ok", factors: ["test"] },
  visualizations: [],
});

function mockCompletionOnce(content: string) {
  mocks.chatCreate.mockResolvedValueOnce({
    id: "test-id",
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
}

/** Poll the jobs endpoint until the job reaches a terminal state. */
async function pollUntilTerminal(
  app: Express,
  token: string,
  jobId: string,
  maxAttempts = 100,
): Promise<{ status: string; result?: any; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    const res = await request(app)
      .get(`/api/genius/jobs/${jobId}`)
      .set(authHeader(token));
    if (res.body.status === "done" || res.body.status === "error") return res.body;
  }
  throw new Error("Job did not reach a terminal state in time");
}

async function waitForStatus(
  app: Express,
  token: string,
  jobId: string,
  expected: string,
  maxAttempts = 100,
): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    const res = await request(app)
      .get(`/api/genius/jobs/${jobId}`)
      .set(authHeader(token));
    if (res.body.status === expected) return res.body;
    if (res.body.status === "error") throw new Error(res.body.error ?? "Job failed");
  }
  throw new Error(`Job did not reach ${expected} in time`);
}

describe("GET /api/genius/jobs/:jobId — background job lifecycle", () => {
  let app: Express;
  let userId: string;
  let token: string;
  let otherUserId: string;
  let otherToken: string;

  beforeAll(async () => {
    app = await buildChatApp();
    userId = `genius-jobs-${Date.now()}`;
    otherUserId = `genius-jobs-other-${Date.now()}`;
    token = mintMemberToken(userId);
    otherToken = mintMemberToken(otherUserId);
    await seedUser({ id: userId, email: `${userId}@test.example` });
    await seedUser({ id: otherUserId, email: `${otherUserId}@test.example` });
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  beforeEach(() => {
    mocks.chatCreate.mockReset();
    mocks.responsesCreate.mockReset();
    mocks.classifyIntent.mockReset();
    mocks.classifyIntent.mockResolvedValue({ intent: "calculation", reasoning: "test" });
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app)
      .get("/api/genius/jobs/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown job id", async () => {
    const res = await request(app)
      .get("/api/genius/jobs/00000000-0000-0000-0000-000000000000")
      .set(authHeader(token));
    expect(res.status).toBe(404);
  });

  it("returns pending while generation is still in flight", { timeout: 15000 }, async () => {
    // classifyIntent is mocked above and returns instantly; stall
    // generateCalculation (the first real chatCreate call in the background job).
    let resolveGen!: (val: any) => void;
    mocks.chatCreate.mockImplementationOnce(
      () => new Promise((resolve) => { resolveGen = resolve; }),
    );

    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power from a 100 N force", webSearch: false });

    expect(jobRes.status).toBe(200);
    const { jobId } = jobRes.body;
    expect(jobId).toBeDefined();

    // Yield to the event loop so the background IIFE can start, run through
    // the (instant) mocked classifyIntent, and block at generateCalculation.
    await new Promise<void>((resolve) => setImmediate(resolve));

    // The generation is stalled — poll and expect pending.
    const pollRes = await request(app)
      .get(`/api/genius/jobs/${jobId}`)
      .set(authHeader(token));
    expect(pollRes.status).toBe(200);
    expect(pollRes.body.status).toBe("pending");

    // Add the commentary mock before resolving so it is queued for the
    // generateCommentary call that immediately follows generateCalculation.
    mockCompletionOnce("Result looks correct.");
    resolveGen({
      id: "test-id",
      choices: [{ message: { role: "assistant", content: VALID_DOC_JSON }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });

    const terminal = await pollUntilTerminal(app, token, jobId);
    expect(terminal.status).toBe("done");
  });

  it("returns done with the full calculation row when generation succeeds", async () => {
    mockCompletionOnce(VALID_DOC_JSON); // generation
    mockCompletionOnce("Power result looks correct."); // commentary

    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power from a 100 N force", webSearch: false });

    expect(jobRes.status).toBe(200);
    const { jobId } = jobRes.body;

    const terminal = await pollUntilTerminal(app, token, jobId);
    expect(terminal.status).toBe("done");
    expect(terminal.result.id).toBeDefined();
    expect(terminal.result.document.projectTitle).toBe("Test Power Calc");
    expect(terminal.result.document.steps[0].result).toBe("200");
  });

  it("publishes the saved recomputed row before slow commentary completes", async () => {
    mockCompletionOnce(VALID_DOC_JSON);
    let resolveCommentary!: (value: any) => void;
    mocks.chatCreate.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCommentary = resolve; }),
    );

    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power quickly", webSearch: false, expertMode: true });

    const verified = await waitForStatus(app, token, jobRes.body.jobId, "verified");
    expect(verified.result.document.steps[0].result).toBe("200");
    expect(verified.result.commentary).toBeUndefined();
    expect(verified.result.timings.expertMode).toBe(true);
    expect(verified.result.timings.firstVerifiedMs).toBeGreaterThanOrEqual(0);
    expect(verified.result.timings.commentaryMs).toBe(0);

    resolveCommentary({
      id: "commentary-id",
      choices: [{ message: { role: "assistant", content: "Power is 200 W from the 100 N input." } }],
      usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 },
    });
    const terminal = await pollUntilTerminal(app, token, jobRes.body.jobId);
    expect(terminal.status).toBe("done");
    expect(terminal.result.commentary).toContain("200 W");
    expect(terminal.result.timings.commentaryMs).toBeGreaterThanOrEqual(0);
  });

  it("cancels deferred commentary after the verified row is available", async () => {
    mockCompletionOnce(VALID_DOC_JSON);
    mocks.chatCreate.mockImplementationOnce((_params: any, options: any) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }),
    );

    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power then explain", webSearch: false, expertMode: true });
    const verified = await waitForStatus(app, token, jobRes.body.jobId, "verified");
    expect(verified.result.document.steps[0].result).toBe("200");

    const cancelled = await request(app)
      .delete(`/api/genius/jobs/${jobRes.body.jobId}`)
      .set(authHeader(token));
    expect(cancelled.body.outcome).toBe("ok");

    const status = await request(app)
      .get(`/api/genius/jobs/${jobRes.body.jobId}`)
      .set(authHeader(token));
    expect(status.body.status).toBe("cancelled");
  });

  it("starts one abortable source lookup alongside intent routing and reuses it", async () => {
    let resolveIntent!: (value: any) => void;
    mocks.classifyIntent.mockImplementationOnce(
      () => new Promise((resolve) => { resolveIntent = resolve; }),
    );
    mocks.responsesCreate.mockResolvedValueOnce({
      output_text: "NIST Guide :: https://www.nist.gov/pml/special-publication-811",
      output: [],
    });
    mockCompletionOnce(VALID_DOC_JSON);
    mockCompletionOnce("Power is 200 W.");

    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power with sources", webSearch: true, expertMode: true });

    await vi.waitFor(() => expect(mocks.responsesCreate).toHaveBeenCalledTimes(1));
    // Source discovery started even though routing is still unresolved.
    resolveIntent({ intent: "calculation", reasoning: "test" });
    const terminal = await pollUntilTerminal(app, token, jobRes.body.jobId);
    expect(terminal.status).toBe("done");
    expect(mocks.responsesCreate).toHaveBeenCalledTimes(1);
    expect(mocks.responsesCreate.mock.calls[0][0]).toMatchObject({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
    });
    expect(mocks.responsesCreate.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("serializes overlapping follow-up mutations and preserves submission-order history", async () => {
    const initial = await request(app)
      .post("/api/genius")
      .set(authHeader(token))
      .send({ document: JSON.parse(VALID_DOC_JSON) });
    expect(initial.status).toBe(200);

    const firstDoc = JSON.parse(VALID_DOC_JSON);
    firstDoc.inputs[0].value = 150;
    const secondDoc = JSON.parse(VALID_DOC_JSON);
    secondDoc.inputs[0].value = 200;

    let resolveFirst!: (value: any) => void;
    mocks.chatCreate.mockImplementation((params: any) => {
      const system = params.messages?.find((message: any) => message.role === "system")?.content ?? "";
      const user = params.messages?.findLast((message: any) => message.role === "user")?.content ?? "";
      if (system.includes("senior engineer reviewing")) {
        const number = user.includes("400") ? "400" : "300";
        return Promise.resolve({
          choices: [{ message: { content: `Updated power is ${number} W.` } }],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        });
      }
      if (user.includes("first update")) {
        return new Promise((resolve) => { resolveFirst = resolve; });
      }
      if (user.includes("second update")) {
        return Promise.resolve({
          choices: [{ message: { content: JSON.stringify(secondDoc) } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        });
      }
      throw new Error(`Unexpected model request: ${user.slice(-120)}`);
    });

    const first = await request(app)
      .post(`/api/genius/${initial.body.id}/message`)
      .set(authHeader(token))
      .send({ message: "first update: change force to 150 N", webSearch: false });
    await vi.waitFor(() => expect(mocks.chatCreate).toHaveBeenCalledTimes(1));

    const second = await request(app)
      .post(`/api/genius/${initial.body.id}/message`)
      .set(authHeader(token))
      .send({ message: "second update: change force to 200 N", webSearch: false });
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    // The second model call cannot start from the stale document while the
    // first mutation still owns the calculation.
    expect(mocks.chatCreate).toHaveBeenCalledTimes(1);

    resolveFirst({
      choices: [{ message: { content: JSON.stringify(firstDoc) } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });

    await Promise.all([
      pollUntilTerminal(app, token, first.body.jobId),
      pollUntilTerminal(app, token, second.body.jobId),
    ]);

    const loaded = await request(app)
      .get(`/api/genius/${initial.body.id}`)
      .set(authHeader(token));
    expect(loaded.body.document.inputs[0].value).toBe(200);
    expect(loaded.body.document.steps[0].result).toBe("400");
    expect(loaded.body.chatHistory.map((turn: any) => turn.content)).toEqual([
      "first update: change force to 150 N",
      "Updated power is 300 W.",
      "second update: change force to 200 N",
      "Updated power is 400 W.",
    ]);
  });

  it("returns error status when generation fails", async () => {
    mocks.chatCreate.mockRejectedValueOnce(new Error("AI service unavailable"));

    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power", webSearch: false });

    expect(jobRes.status).toBe(200);
    const { jobId } = jobRes.body;

    const terminal = await pollUntilTerminal(app, token, jobId);
    expect(terminal.status).toBe("error");
    expect(terminal.error).toMatch(/generate/i);
  });

  it("returns 403 when another authenticated user tries to poll a job they do not own", async () => {
    mockCompletionOnce(VALID_DOC_JSON);
    mockCompletionOnce("OK.");

    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power", webSearch: false });

    expect(jobRes.status).toBe(200);
    const { jobId } = jobRes.body;

    // otherToken belongs to a different user — must be rejected with 403.
    const crossRes = await request(app)
      .get(`/api/genius/jobs/${jobId}`)
      .set(authHeader(otherToken));
    expect(crossRes.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // Cancellation — DELETE /api/genius/jobs/:jobId
  // ---------------------------------------------------------------------------

  it("DELETE /api/genius/jobs/:jobId — non-owner gets 403", async () => {
    // Let the job complete normally so we don't need to stall it.
    mockCompletionOnce(VALID_DOC_JSON);
    mockCompletionOnce("Commentary.");

    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power", webSearch: false });

    expect(jobRes.status).toBe(200);
    const { jobId } = jobRes.body;

    // Non-owner is rejected regardless of job state.
    const forbiddenRes = await request(app)
      .delete(`/api/genius/jobs/${jobId}`)
      .set(authHeader(otherToken));
    expect(forbiddenRes.status).toBe(403);

    // Allow the background job to finish cleanly.
    await pollUntilTerminal(app, token, jobId);
  });

  it("DELETE /api/genius/jobs/:jobId — owner gets 200 and job shows cancelled", { timeout: 15000 }, async () => {
    // Stall generation at chatCreate to keep the job alive long enough to cancel.
    let resolveGen: ((val: any) => void) | undefined;
    mocks.chatCreate.mockImplementationOnce(
      () => new Promise((resolve) => { resolveGen = resolve; }),
    );

    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power", webSearch: false });

    expect(jobRes.status).toBe(200);
    const { jobId } = jobRes.body;

    // Wait long enough for the background IIFE to start, classify intent
    // (instant mock), and block at chatCreate.
    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    const cancelRes = await request(app)
      .delete(`/api/genius/jobs/${jobId}`)
      .set(authHeader(token));
    expect(cancelRes.status).toBe(200);

    const pollRes = await request(app)
      .get(`/api/genius/jobs/${jobId}`)
      .set(authHeader(token));
    expect(pollRes.body.status).toBe("cancelled");

    // Unblock the stalled chatCreate (background handler ignores result).
    resolveGen?.({ id: "x", choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
  });

  it("cancelling before DB write leaves no calculation row", { timeout: 15000 }, async () => {
    // Stall the generation step so we can cancel before any DB write.
    let resolveGen: ((val: any) => void) | undefined;
    mocks.chatCreate.mockImplementationOnce(
      () => new Promise((resolve) => { resolveGen = resolve; }),
    );

    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power before DB write", webSearch: false });

    const { jobId } = jobRes.body;

    // Wait for the IIFE to reach the stall at chatCreate.
    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    // Cancel — no commentary or DB write has happened yet.
    await request(app)
      .delete(`/api/genius/jobs/${jobId}`)
      .set(authHeader(token));

    // Unblock generation — the handler detects cancellation and aborts.
    resolveGen?.({ id: "x", choices: [{ message: { role: "assistant", content: VALID_DOC_JSON }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } });

    // Allow background cleanup to settle.
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    const pollRes = await request(app)
      .get(`/api/genius/jobs/${jobId}`)
      .set(authHeader(token));

    // Job is cancelled — no calculation row should have been inserted.
    expect(pollRes.body.status).toBe("cancelled");
    expect(pollRes.body.result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Chat history forwarding
  // ---------------------------------------------------------------------------

  it("chatHistory in the request body is accepted and forwarded to classifyIntent", async () => {
    mockCompletionOnce(VALID_DOC_JSON); // generation
    mockCompletionOnce("Commentary.");  // commentary

    const chatHistory = [
      { role: "user" as const, content: "What beam should I use?" },
      { role: "assistant" as const, content: "A W8x31 I-beam is a common choice." },
    ];

    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Size the beam for 50 kN load", webSearch: false, chatHistory });

    expect(jobRes.status).toBe(200);
    const terminal = await pollUntilTerminal(app, token, jobRes.body.jobId);
    expect(terminal.status).toBe("done");

    // classifyIntent must have been called with the chatHistory as its last arg.
    const lastCall = mocks.classifyIntent.mock.calls[mocks.classifyIntent.mock.calls.length - 1];
    expect(lastCall[4]).toEqual(chatHistory);
  });
});
