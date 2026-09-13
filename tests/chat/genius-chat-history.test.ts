import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { buildChatApp } from "../helpers/app";
import { mintMemberToken, authHeader } from "../helpers/auth";
import { seedUser, closeDatabaseConnection } from "../helpers/db";

const mocks = vi.hoisted(() => ({
  chatCreate: vi.fn(),
  responsesCreate: vi.fn(),
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

// classifyIntent defaults to "calculation"; individual tests can override
// via mockResolvedValueOnce to simulate a Q&A turn followed by a calculation.
vi.mock("../../server/services/genius-service.js", async (importOriginal) => {
  const mod = await importOriginal<any>();
  return {
    ...mod,
    classifyIntent: mocks.classifyIntent,
  };
});

/**
 * Genius X1 — persisted chat history per calculation (Task #137).
 *
 * Verifies:
 *   - the initiating prompt + AI reply are saved on /generate
 *   - follow-up prompts + replies are appended on /message
 *   - GET /:id returns the full transcript in order
 *   - a calculation saved via the plain POST / (no chat) loads with empty history
 */

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
    id: "test-completion-id",
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
}

async function pollJobResult(app: Express, token: string, jobId: string, maxAttempts = 100): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    const res = await request(app).get(`/api/genius/jobs/${jobId}`).set(authHeader(token));
    if (res.body.status === "done") return res.body.result;
    if (res.body.status === "error") throw new Error(res.body.error ?? "Job failed");
  }
  throw new Error("Job did not complete within the allotted time");
}

describe("Genius X1 — persisted chat history per calculation", () => {
  let app: Express;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    app = await buildChatApp();
    userId = `genius-history-${Date.now()}`;
    token = mintMemberToken(userId);
    await seedUser({ id: userId, email: `${userId}@test.example` });
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

  it("persists the initiating prompt + reply on generate, and restores them on load", async () => {
    mockCompletionOnce(VALID_DOC_JSON); // generation pass
    mockCompletionOnce("Here's the power calc — 200 W from a 100 N force."); // commentary pass

    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power from a 100 N force", webSearch: false });
    expect(jobRes.status).toBe(200);
    const created = await pollJobResult(app, token, jobRes.body.jobId);

    const loaded = await request(app).get(`/api/genius/${created.id}`).set(authHeader(token));
    expect(loaded.status).toBe(200);
    expect(loaded.body.chatHistory).toEqual([
      { role: "user", content: "Compute power from a 100 N force" },
      { role: "assistant", content: "Here's the power calc — 200 W from a 100 N force." },
    ]);
  });

  it("appends follow-up turns in order and preserves the full transcript", async () => {
    mockCompletionOnce(VALID_DOC_JSON);
    mockCompletionOnce("Initial reply.");
    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power", webSearch: false });
    const created = await pollJobResult(app, token, jobRes.body.jobId);

    const updated = JSON.parse(VALID_DOC_JSON);
    updated.inputs[0].value = 150;
    mockCompletionOnce(JSON.stringify(updated));
    mockCompletionOnce("Follow-up reply.");
    const followRes = await request(app)
      .post(`/api/genius/${created.id}/message`)
      .set(authHeader(token))
      .send({ message: "Change the force to 150 N", webSearch: false });
    await pollJobResult(app, token, followRes.body.jobId);

    const loaded = await request(app).get(`/api/genius/${created.id}`).set(authHeader(token));
    expect(loaded.body.chatHistory).toEqual([
      { role: "user", content: "Compute power" },
      { role: "assistant", content: "Initial reply." },
      { role: "user", content: "Change the force to 150 N" },
      { role: "assistant", content: "Follow-up reply." },
    ]);
  });

  it("explains a saved step in chat without changing the calculation document", async () => {
    const saveRes = await request(app)
      .post("/api/genius")
      .set(authHeader(token))
      .send({ document: JSON.parse(VALID_DOC_JSON) });
    expect(saveRes.status).toBe(200);

    mockCompletionOnce("Power is the rate of work, so this step doubles the listed force.");
    const explainRes = await request(app)
      .post(`/api/genius/${saveRes.body.id}/steps/s1/explain`)
      .set(authHeader(token))
      .send({ question: "Explain the “Power” calculation step." });
    expect(explainRes.status).toBe(200);
    const answer = await pollJobResult(app, token, explainRes.body.jobId);
    expect(answer).toEqual({
      type: "answer",
      reply: "Power is the rate of work, so this step doubles the listed force.",
    });

    const loaded = await request(app).get(`/api/genius/${saveRes.body.id}`).set(authHeader(token));
    expect(loaded.body.document).toEqual(saveRes.body.document);
    expect(loaded.body.chatHistory).toEqual([
      { role: "user", content: "Explain the “Power” calculation step." },
      { role: "assistant", content: "Power is the rate of work, so this step doubles the listed force." },
    ]);
    const requestText = mocks.chatCreate.mock.calls[0][0].messages[1].content;
    expect(requestText).toContain("Step label: Power");
    expect(requestText).toContain("Verified result: 200 W");
  });

  it("backfills a Q&A turn that happened before any calculation existed once one is generated", async () => {
    // First turn: classified as a question — no calculation exists yet, so
    // nothing can be persisted server-side (matches the client's calcId === null state).
    mocks.classifyIntent.mockResolvedValueOnce({ intent: "question", reasoning: "test" });
    mockCompletionOnce("Steel density is about 7850 kg/m^3."); // answerQuestion pass
    const qaRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "What is the density of steel?", webSearch: false });
    expect(qaRes.status).toBe(200);
    const answer = await pollJobResult(app, token, qaRes.body.jobId);
    expect(answer.type).toBe("answer");

    // Second turn: the client sends the full local transcript (including the
    // unsaved Q&A above) as chatHistory when it now asks for a calculation.
    mocks.classifyIntent.mockResolvedValueOnce({ intent: "calculation", reasoning: "test" });
    mockCompletionOnce(VALID_DOC_JSON);
    mockCompletionOnce("Here's the beam calc.");
    const genRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({
        prompt: "Now size a steel beam for a 50 kN load",
        webSearch: false,
        chatHistory: [
          { role: "user", content: "What is the density of steel?" },
          { role: "assistant", content: "Steel density is about 7850 kg/m^3." },
        ],
      });
    const created = await pollJobResult(app, token, genRes.body.jobId);

    const loaded = await request(app).get(`/api/genius/${created.id}`).set(authHeader(token));
    expect(loaded.body.chatHistory).toEqual([
      { role: "user", content: "What is the density of steel?" },
      { role: "assistant", content: "Steel density is about 7850 kg/m^3." },
      { role: "user", content: "Now size a steel beam for a 50 kN load" },
      { role: "assistant", content: "Here's the beam calc." },
    ]);
  });

  it("persists the plan/refine conversation that led to a proposal when it is approved and built", async () => {
    const proposal = {
      title: "Beam deflection check",
      understanding: "A simply supported beam with a mid-span load.",
      problem: "Find the maximum deflection of the beam.",
      inputs: [{ label: "Span", value: "2", unit: "m" }],
      assumptions: ["Steel E = 210 GPa"],
      approach: "Use the standard simply-supported beam deflection formula.",
    };

    mockCompletionOnce(VALID_DOC_JSON);
    mockCompletionOnce("Built the beam deflection calc.");
    const buildRes = await request(app)
      .post("/api/genius/proposal/build")
      .set(authHeader(token))
      .send({
        proposal,
        webSearch: false,
        chatHistory: [
          { role: "user", content: "Check my beam for deflection" },
          { role: "assistant", content: "I drafted a calculation plan. Review it below." },
          { role: "user", content: "Use 210 GPa for the steel" },
          { role: "assistant", content: "Updated the assumption to 210 GPa." },
        ],
      });
    const created = await pollJobResult(app, token, buildRes.body.jobId);

    const loaded = await request(app).get(`/api/genius/${created.id}`).set(authHeader(token));
    expect(loaded.body.chatHistory).toEqual([
      { role: "user", content: "Check my beam for deflection" },
      { role: "assistant", content: "I drafted a calculation plan. Review it below." },
      { role: "user", content: "Use 210 GPa for the steel" },
      { role: "assistant", content: "Updated the assumption to 210 GPa." },
      { role: "user", content: "Approved — build the calculation." },
      { role: "assistant", content: "Built the beam deflection calc." },
    ]);
  });

  it("loads pre-existing calculations (saved without chat history) with an empty transcript", async () => {
    const saveRes = await request(app)
      .post("/api/genius")
      .set(authHeader(token))
      .send({ document: JSON.parse(VALID_DOC_JSON) });
    expect(saveRes.status).toBe(200);

    const loaded = await request(app).get(`/api/genius/${saveRes.body.id}`).set(authHeader(token));
    expect(loaded.status).toBe(200);
    expect(loaded.body.chatHistory).toEqual([]);
  });

  it("deleting a calculation also removes its genius_chat_messages rows (cascade)", async () => {
    // Lazy-import the rewired db so the vi.mock in setup.ts applies.
    const { db } = await import("../../server/db.js");
    const { geniusChatMessages } = await import("../../shared/schema.js");

    // 1. Create a calculation that will have two chat rows persisted.
    mockCompletionOnce(VALID_DOC_JSON);
    mockCompletionOnce("Power is 200 W.");
    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power from a 100 N force", webSearch: false });
    expect(jobRes.status).toBe(200);
    const created = await pollJobResult(app, token, jobRes.body.jobId);

    // 2. Confirm chat rows were persisted.
    const before = await db
      .select()
      .from(geniusChatMessages)
      .where(eq(geniusChatMessages.calculationId, created.id));
    expect(before.length).toBeGreaterThan(0);

    // 3. Delete the calculation via the API.
    const delRes = await request(app)
      .delete(`/api/genius/${created.id}`)
      .set(authHeader(token));
    expect(delRes.status).toBe(200);
    expect(delRes.body.ok).toBe(true);

    // 4. Assert no orphaned chat rows remain for that calculation.
    const after = await db
      .select()
      .from(geniusChatMessages)
      .where(eq(geniusChatMessages.calculationId, created.id));
    expect(after).toHaveLength(0);
  });
});
