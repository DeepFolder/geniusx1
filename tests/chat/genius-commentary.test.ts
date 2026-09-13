import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { buildChatApp } from "../helpers/app";
import { mintMemberToken, authHeader } from "../helpers/auth";
import { seedUser, closeDatabaseConnection } from "../helpers/db";

const mocks = vi.hoisted(() => ({
  chatCreate: vi.fn(),
  responsesCreate: vi.fn(),
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

// classifyIntent calls chatCreate for intent detection. Mock it to always
// return "calculation" so it never consumes a mock meant for generation or
// commentary, and call counts in assertions remain predictable.
vi.mock("../../server/services/genius-service.js", async (importOriginal) => {
  const mod = await importOriginal<any>();
  return {
    ...mod,
    classifyIntent: vi.fn().mockResolvedValue({ intent: "calculation", reasoning: "test" }),
  };
});

/**
 * Genius X1 — reasoned assistant commentary.
 *
 * After a calculation is generated/updated/recalculated/built, a second
 * lightweight AI pass produces a short reasoned reply. Covers:
 *   - commentary present in generate / message / recalc / build responses
 *   - graceful fallback to a factual summary when the commentary pass fails
 *   - commentary that invents numbers absent from the recomputed document
 *     is rejected and replaced by the factual summary
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

const VALID_PROPOSAL = {
  title: "Beam deflection check",
  understanding: "A simply supported beam drawing with a mid-span load.",
  problem: "Find the maximum deflection of the beam.",
  inputs: [{ label: "Span", value: "2", unit: "m" }],
  assumptions: ["Steel E = 210 GPa"],
  approach: "Use the standard simply-supported beam deflection formula.",
};

// Grounded commentary: 200 (computed result) and 100 (input) exist in the doc.
const GROUNDED_COMMENTARY =
  "The 200 W figure is what you'd expect from a 100 N input at this ratio — the magnitude looks right. The result scales linearly with force, so verify that input first. Want me to sweep the force over a range?";

function mockCompletionOnce(content: string) {
  mocks.chatCreate.mockResolvedValueOnce({
    id: "test-completion-id",
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
}

/** Poll GET /api/genius/jobs/:jobId until the job is done or errors. */
async function pollJobResult(
  app: Express,
  token: string,
  jobId: string,
  maxAttempts = 100,
): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    const res = await request(app)
      .get(`/api/genius/jobs/${jobId}`)
      .set(authHeader(token));
    if (res.body.status === "done") return res.body.result;
    if (res.body.status === "error") throw new Error(res.body.error ?? "Job failed");
  }
  throw new Error("Job did not complete within the allotted time");
}

describe("Genius X1 — reasoned assistant commentary", () => {
  let app: Express;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    app = await buildChatApp();
    userId = `genius-commentary-${Date.now()}`;
    token = mintMemberToken(userId);
    await seedUser({ id: userId, email: `${userId}@test.example` });
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  beforeEach(() => {
    mocks.chatCreate.mockReset();
    mocks.responsesCreate.mockReset();
  });

  /**
   * Generate a calculation via the job-backed endpoint and wait for it to
   * finish polling. Returns the full calculation row (id, document, commentary).
   */
  async function generateCalcRow(): Promise<any> {
    mockCompletionOnce(VALID_DOC_JSON); // generation pass
    mockCompletionOnce(GROUNDED_COMMENTARY); // commentary pass
    const jobRes = await request(app)
      .post("/api/genius/generate")
      .set(authHeader(token))
      .send({ prompt: "Compute power from a 100 N force", webSearch: false });
    expect(jobRes.status).toBe(200);
    expect(jobRes.body.jobId).toBeDefined();
    return pollJobResult(app, token, jobRes.body.jobId);
  }

  describe("POST /api/genius/generate", () => {
    it("returns AI commentary alongside the calculation", async () => {
      const result = await generateCalcRow();
      expect(result.commentary).toBe(GROUNDED_COMMENTARY);
      // Both passes ran: generation + commentary.
      expect(mocks.chatCreate).toHaveBeenCalledTimes(2);
      // The generated Calculation Summary must explain the result rather than
      // duplicate the separate confidence section or restate the problem.
      const generationArgs = mocks.chatCreate.mock.calls[0][0];
      const generationSystem = generationArgs.messages.find((m: any) => m.role === "system");
      expect(generationSystem.content).toContain("explain why its magnitude is plausible");
      expect(generationSystem.content).toContain("do not merely restate the problem");
      expect(generationSystem.content).toContain("Do not include a confidence score or confidence note");
      // The commentary pass received the recomputed document and the no-invention rule.
      const commentaryArgs = mocks.chatCreate.mock.calls[1][0];
      const sys = commentaryArgs.messages.find((m: any) => m.role === "system");
      const usr = commentaryArgs.messages.find((m: any) => m.role === "user");
      expect(sys.content).toContain("NEVER compute, derive, approximate, re-round, or invent any number");
      expect(usr.content).toContain("200"); // server-recomputed value present in readable summary
    });

    it("falls back to a factual summary when the commentary pass fails", async () => {
      mockCompletionOnce(VALID_DOC_JSON);
      mocks.chatCreate.mockRejectedValueOnce(new Error("commentary model down"));

      const jobRes = await request(app)
        .post("/api/genius/generate")
        .set(authHeader(token))
        .send({ prompt: "Compute power", webSearch: false });

      expect(jobRes.status).toBe(200);
      expect(jobRes.body.jobId).toBeDefined();
      const result = await pollJobResult(app, token, jobRes.body.jobId);
      expect(result.document.steps[0].result).toBe("200");
      expect(result.commentary).toContain("Test Power Calc");
      expect(result.commentary).toContain("200 W");
    });

    it("rejects commentary that invents numbers absent from the recomputed document", async () => {
      mockCompletionOnce(VALID_DOC_JSON);
      mockCompletionOnce(
        "The result of 47234.9 W is far above the 900 W limit you'd normally allow.",
      );

      const jobRes = await request(app)
        .post("/api/genius/generate")
        .set(authHeader(token))
        .send({ prompt: "Compute power", webSearch: false });

      expect(jobRes.status).toBe(200);
      const result = await pollJobResult(app, token, jobRes.body.jobId);
      // Invented numbers → replaced by the factual summary (which only uses doc values).
      expect(result.commentary).not.toContain("47234.9");
      expect(result.commentary).toContain("Test Power Calc");
    });
  });

  describe("POST /api/genius/:id/message", () => {
    it("returns commentary that saw the user's request and the previous results", async () => {
      const created = await generateCalcRow();
      const id = created.id;

      mocks.chatCreate.mockReset();
      const updated = JSON.parse(VALID_DOC_JSON);
      updated.inputs[0].value = 150;
      mockCompletionOnce(JSON.stringify(updated)); // follow-up generation
      mockCompletionOnce("Doubling down: with 150 N the power lands at 300 W — still linear, as expected."); // commentary

      const jobRes = await request(app)
        .post(`/api/genius/${id}/message`)
        .set(authHeader(token))
        .send({ message: "Change the force to 150 N", webSearch: false });

      expect(jobRes.status).toBe(200);
      expect(jobRes.body.jobId).toBeDefined();
      const result = await pollJobResult(app, token, jobRes.body.jobId);

      expect(result.document.steps[0].result).toBe("300");
      expect(result.commentary).toContain("300 W");

      const commentaryArgs = mocks.chatCreate.mock.calls[1][0];
      const usr = commentaryArgs.messages.find((m: any) => m.role === "user");
      expect(usr.content).toContain("Change the force to 150 N");
      expect(usr.content).toContain("BEFORE the change");
    });
  });

  describe("POST /api/genius/:id/recalc", () => {
    it("returns commentary after a deterministic recompute", async () => {
      const created = await generateCalcRow();
      const id = created.id;
      const doc = created.document;

      mocks.chatCreate.mockReset();
      mockCompletionOnce("Power is now 100 W after recalculation. This is the delivered power for the current force input. The magnitude follows directly from the 50 N force through the linear power relationship. Force therefore remains the main sensitivity.");
      mockCompletionOnce("With the force at 50 N the power drops to 100 W — half the earlier 200 W, exactly linear.");

      const edited = { ...doc, inputs: doc.inputs.map((input, index) => index === 0 ? { ...input, value: 50 } : input) };
      const res = await request(app)
        .post(`/api/genius/${id}/recalc`)
        .set(authHeader(token))
        .send({ document: edited });

      expect(res.status).toBe(200);
      expect(res.body.document.steps[0].result).toBe("100");
      expect(res.body.document.expertSummary).toContain("50 N");
      expect(res.body.commentary).toContain("100 W");

      const summaryArgs = mocks.chatCreate.mock.calls[0][0];
      const summarySystem = summaryArgs.messages.find((m: any) => m.role === "system");
      expect(summarySystem.content).toContain("explain why its magnitude is plausible");
      expect(summarySystem.content).toContain("Do not merely restate the problem");
      expect(summarySystem.content).toContain("Do not include a confidence score or confidence note");
    });

    it("replaces the old expert summary with current values when summary generation fails", async () => {
      const created = await generateCalcRow();
      const id = created.id;
      const doc = {
        ...created.document,
        expertSummary: "The force is 100 N and the power is 200 W.",
      };

      mocks.chatCreate.mockReset();
      mocks.chatCreate.mockRejectedValueOnce(new Error("summary model down"));
      mockCompletionOnce("At 25 N, the recomputed power is 50 W.");

      const edited = { ...doc, inputs: doc.inputs.map((input, index) => index === 0 ? { ...input, value: 25 } : input) };
      const res = await request(app)
        .post(`/api/genius/${id}/recalc`)
        .set(authHeader(token))
        .send({ document: edited });

      expect(res.status).toBe(200);
      expect(res.body.document.steps[0].result).toBe("50");
      expect(res.body.document.expertSummary).toContain("25 N");
      expect(res.body.document.expertSummary).not.toContain("force is 100 N");
      expect(res.body.document.expertSummary).not.toContain("Confidence");
    });

    it("persists an incompatible model equation as review-needed instead of a trusted result", async () => {
      const created = await generateCalcRow();
      const id = created.id;
      const invalid = {
        ...created.document,
        steps: created.document.steps.map((step) => ({ ...step, expr: "F * 2", formula: "P = 2F", unit: "W" })),
      };

      mocks.chatCreate.mockReset();
      mockCompletionOnce("The dimensional mismatch needs review.");
      mockCompletionOnce("The force-only expression cannot verify a power result.");

      const res = await request(app)
        .post(`/api/genius/${id}/recalc`)
        .set(authHeader(token))
        .send({ document: invalid });

      expect(res.status).toBe(200);
      expect(res.body.document.steps[0]).toMatchObject({ result: "—", reviewNeeded: true });
      expect(res.body.document.results[0]).toMatchObject({ value: "—", reviewNeeded: true });
      expect(res.body.document.steps[0].warnings.join(" ")).toMatch(/expects force but declares power/);
    });
  });

  describe("POST /api/genius/proposal/build", () => {
    it("returns commentary alongside the built calculation", async () => {
      mockCompletionOnce(VALID_DOC_JSON);
      mockCompletionOnce(GROUNDED_COMMENTARY);

      const jobRes = await request(app)
        .post("/api/genius/proposal/build")
        .set(authHeader(token))
        .send({ proposal: VALID_PROPOSAL, webSearch: false });

      expect(jobRes.status).toBe(200);
      expect(jobRes.body.jobId).toBeDefined();
      const result = await pollJobResult(app, token, jobRes.body.jobId);
      expect(result.id).toBeDefined();
      expect(result.commentary).toBe(GROUNDED_COMMENTARY);
    });
  });

  describe("proposal replies are contextual", () => {
    it("carries the model's conversational reply through /proposal/refine", async () => {
      mockCompletionOnce(
        JSON.stringify({
          ...VALID_PROPOSAL,
          inputs: [{ label: "Span", value: "3", unit: "m" }],
          reply: "I stretched the span to 3 m; deflection grows with the cube of span, so expect a visibly larger number.",
        }),
      );

      const res = await request(app)
        .post("/api/genius/proposal/refine")
        .set(authHeader(token))
        .send({ proposal: VALID_PROPOSAL, message: "Change the span to 3 m" });

      expect(res.status).toBe(200);
      expect(res.body.reply).toContain("stretched the span to 3 m");
      // The reply is not persisted inside the proposal itself.
      expect(res.body.proposal.reply).toBeUndefined();
    });

    it("falls back to a contextual reply when the model omits one", async () => {
      mockCompletionOnce(JSON.stringify(VALID_PROPOSAL)); // no "reply" field

      const res = await request(app)
        .post("/api/genius/proposal/refine")
        .set(authHeader(token))
        .send({ proposal: VALID_PROPOSAL, message: "tweak it" });

      expect(res.status).toBe(200);
      expect(res.body.reply).toContain("Updated. Review the proposal below");
    });
  });
});
