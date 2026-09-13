import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { buildChatApp } from "../helpers/app";
import { mintMemberToken, authHeader } from "../helpers/auth";
import { seedUser, closeDatabaseConnection } from "../helpers/db";

const mocks = vi.hoisted(() => ({
  chatCreate: vi.fn(),
  responsesCreate: vi.fn(),
  extractPdfText: vi.fn(),
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

vi.mock("../../server/services/datasheet-summarizer", () => ({
  extractPdfTextFromBuffer: mocks.extractPdfText,
}));

// Prevent classifyIntent from consuming chatCreate mocks reserved for generation.
vi.mock("../../server/services/genius-service.js", async (importOriginal) => {
  const mod = await importOriginal<any>();
  return {
    ...mod,
    classifyIntent: vi.fn().mockResolvedValue({ intent: "calculation", reasoning: "test" }),
  };
});

/**
 * Genius X1 — web-search toggle, document upload → task proposal flow.
 *
 * Covers server/routes/genius.ts:
 *   POST /api/genius/generate         (webSearch flag)
 *   POST /api/genius/upload           (image → attachment + proposal)
 *   POST /api/genius/proposal/refine  (conversational revision)
 *   POST /api/genius/proposal/build   (approved proposal → calculation row)
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

const VALID_PROPOSAL_JSON = JSON.stringify({
  title: "Beam deflection check",
  understanding: "A simply supported beam drawing with a mid-span load.",
  problem: "Find the maximum deflection of the beam.",
  inputs: [{ label: "Span", value: "2", unit: "m" }],
  assumptions: ["Steel E = 210 GPa"],
  approach: "Use the standard simply-supported beam deflection formula.",
});

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

// 1x1 transparent PNG.
const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// Minimal valid PDF header — content doesn't matter since extraction is mocked.
const PDF_BUFFER = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");

describe("Genius X1 — web search, uploads and task proposals", () => {
  let app: Express;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    app = await buildChatApp();
    userId = `genius-test-${Date.now()}`;
    token = mintMemberToken(userId);
    await seedUser({ id: userId, email: `${userId}@test.example` });
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  beforeEach(() => {
    mocks.chatCreate.mockReset();
    mocks.responsesCreate.mockReset();
    mocks.extractPdfText.mockReset();
  });

  describe("POST /api/genius/generate — webSearch flag", () => {
    it("generates without touching the web-search API when webSearch is false", async () => {
      mockCompletionOnce(VALID_DOC_JSON);
      const jobRes = await request(app)
        .post("/api/genius/generate")
        .set(authHeader(token))
        .send({ prompt: "Compute power from a 100 N force", webSearch: false });

      expect(jobRes.status).toBe(200);
      expect(jobRes.body.jobId).toBeDefined();

      const result = await pollJobResult(app, token, jobRes.body.jobId);
      expect(result.document.projectTitle).toBe("Test Power Calc");
      // Deterministic recompute: F * 2 = 200
      expect(result.document.steps[0].result).toBe("200");
      expect(mocks.responsesCreate).not.toHaveBeenCalled();
    });

    it("performs a live web search first when webSearch is true", async () => {
      mocks.responsesCreate.mockResolvedValueOnce({
        status: "completed",
        output_text:
          "Shigley's Mechanical Engineering Design :: https://example.com/shigley\n" +
          "Machinery's Handbook :: https://example.com/machinery",
        output: [],
      });
      mockCompletionOnce(VALID_DOC_JSON);

      const jobRes = await request(app)
        .post("/api/genius/generate")
        .set(authHeader(token))
        .send({ prompt: "Compute power from a 100 N force", webSearch: true });

      expect(jobRes.status).toBe(200);
      const result = await pollJobResult(app, token, jobRes.body.jobId);
      expect(result.document.projectTitle).toBe("Test Power Calc");
      expect(mocks.responsesCreate).toHaveBeenCalledTimes(1);
      const searchArgs = mocks.responsesCreate.mock.calls[0][0];
      expect(searchArgs.tools).toEqual([{ type: "web_search_preview" }]);
      // The found references must be injected into the generation prompt.
      const genArgs = mocks.chatCreate.mock.calls[0][0];
      const userMsg = genArgs.messages.find((m: any) => m.role === "user");
      expect(userMsg.content).toContain("https://example.com/shigley");
      expect(userMsg.content).toContain("VERIFIED WEB REFERENCES");
    });

    it("still generates when the web search itself fails", async () => {
      mocks.responsesCreate.mockRejectedValueOnce(new Error("search down"));
      mockCompletionOnce(VALID_DOC_JSON);

      const jobRes = await request(app)
        .post("/api/genius/generate")
        .set(authHeader(token))
        .send({ prompt: "Compute power", webSearch: true });

      expect(jobRes.status).toBe(200);
      const result = await pollJobResult(app, token, jobRes.body.jobId);
      expect(result.document.projectTitle).toBe("Test Power Calc");
    });

    it("returns 401 without a token", async () => {
      const res = await request(app)
        .post("/api/genius/generate")
        .send({ prompt: "anything" });
      expect(res.status).toBe(401);
    });

    it("rejects a request that enables both Expert and PhD modes", async () => {
      const res = await request(app)
        .post("/api/genius/generate")
        .set(authHeader(token))
        .send({ prompt: "Compute power", expertMode: true, phdMode: true });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/prompt|required/i);
      expect(mocks.chatCreate).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/genius/upload — image → attachment + proposal", () => {
    it("returns an attachment and a reviewable task proposal for an image", async () => {
      mockCompletionOnce(VALID_PROPOSAL_JSON);

      const res = await request(app)
        .post("/api/genius/upload")
        .set(authHeader(token))
        .field("note", "This is my beam sketch")
        .attach("file", PNG_BUFFER, { filename: "beam.png", contentType: "image/png" });

      expect(res.status).toBe(200);
      expect(res.body.attachment.kind).toBe("image");
      expect(res.body.attachment.name).toBe("beam.png");
      expect(res.body.attachment.mimeType).toBe("image/png");
      expect(res.body.proposal.title).toBe("Beam deflection check");
      expect(res.body.proposal.inputs).toEqual([{ label: "Span", value: "2", unit: "m" }]);

      // The vision request must include the image and the user's note.
      const args = mocks.chatCreate.mock.calls[0][0];
      const userMsg = args.messages.find((m: any) => m.role === "user");
      const parts = userMsg.content as any[];
      expect(parts.some((p) => p.type === "image_url")).toBe(true);
      expect(parts.find((p) => p.type === "text").text).toContain("This is my beam sketch");
    });

    it("rejects unsupported file types", async () => {
      const res = await request(app)
        .post("/api/genius/upload")
        .set(authHeader(token))
        .attach("file", Buffer.from("hello"), {
          filename: "notes.txt",
          contentType: "text/plain",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/supported/i);
    });

    it("rejects requests without a file", async () => {
      const res = await request(app)
        .post("/api/genius/upload")
        .set(authHeader(token))
        .field("note", "no file here");
      expect(res.status).toBe(400);
    });

    it("rejects a multipart upload that enables both Expert and PhD modes", async () => {
      const res = await request(app)
        .post("/api/genius/upload")
        .set(authHeader(token))
        .field("expertMode", "true")
        .field("phdMode", "true")
        .attach("file", PNG_BUFFER, { filename: "beam.png", contentType: "image/png" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot be enabled together/i);
      expect(mocks.chatCreate).not.toHaveBeenCalled();
    });

    it("returns 401 without a token", async () => {
      const res = await request(app)
        .post("/api/genius/upload")
        .attach("file", PNG_BUFFER, { filename: "beam.png", contentType: "image/png" });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/genius/proposal/refine", () => {
    it("returns the revised proposal", async () => {
      const revised = JSON.parse(VALID_PROPOSAL_JSON);
      revised.inputs = [{ label: "Span", value: "3", unit: "m" }];
      mockCompletionOnce(JSON.stringify(revised));

      const res = await request(app)
        .post("/api/genius/proposal/refine")
        .set(authHeader(token))
        .send({
          proposal: JSON.parse(VALID_PROPOSAL_JSON),
          message: "Change the span to 3 m",
        });

      expect(res.status).toBe(200);
      expect(res.body.proposal.inputs[0].value).toBe("3");
    });

    it("rejects an invalid body", async () => {
      const res = await request(app)
        .post("/api/genius/proposal/refine")
        .set(authHeader(token))
        .send({ message: "no proposal" });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/genius/plan/example", () => {
    it("turns explicit answer context into a reviewable proposal with assumptions", async () => {
      mockCompletionOnce(VALID_PROPOSAL_JSON);

      const res = await request(app)
        .post("/api/genius/plan/example")
        .set(authHeader(token))
        .send({
          example: {
            request: "Estimate pinned-column buckling load.",
            method: "Use Euler buckling and disclose missing values as assumptions.",
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.proposal.assumptions).toEqual(["Steel E = 210 GPa"]);
      const prompt = mocks.chatCreate.mock.calls[0][0].messages[1].content;
      expect(prompt).toContain("EXAMPLE PROBLEM:");
      expect(prompt).toContain("EXPLANATION METHOD:");
    });

    it("rejects a missing explicit answer context", async () => {
      const res = await request(app)
        .post("/api/genius/plan/example")
        .set(authHeader(token))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("A calculation explanation is required");
    });
  });

  describe("POST /api/genius/upload — PDF uploads (text-based and scanned)", () => {
    it("uses the text-extraction path for a text-based PDF", async () => {
      // Simulate a PDF with extractable text.
      mocks.extractPdfText.mockResolvedValueOnce(
        "Load = 50 kN applied at mid-span of a 6 m simply-supported steel beam.",
      );
      mockCompletionOnce(VALID_PROPOSAL_JSON);

      const res = await request(app)
        .post("/api/genius/upload")
        .set(authHeader(token))
        .attach("file", PDF_BUFFER, { filename: "beam-spec.pdf", contentType: "application/pdf" });

      expect(res.status).toBe(200);
      expect(res.body.attachment.kind).toBe("pdf");
      expect(res.body.attachment.name).toBe("beam-spec.pdf");
      expect(res.body.proposal.title).toBe("Beam deflection check");

      // The chat call must use the cheaper text path — no image_url or file parts.
      const args = mocks.chatCreate.mock.calls[0][0];
      const userMsg = args.messages.find((m: any) => m.role === "user");
      expect(typeof userMsg.content).toBe("string");
      expect(userMsg.content).toContain("Load = 50 kN");
      expect(userMsg.content).not.toContain("image_url");
    });

    it("falls back to the vision path when text extraction fails (scanned PDF)", async () => {
      // Simulate a scanned / image-only PDF — extractPdfTextFromBuffer throws.
      mocks.extractPdfText.mockRejectedValueOnce(new Error("No text layer found"));
      mockCompletionOnce(VALID_PROPOSAL_JSON);

      const res = await request(app)
        .post("/api/genius/upload")
        .set(authHeader(token))
        .attach("file", PDF_BUFFER, { filename: "scanned-drawing.pdf", contentType: "application/pdf" });

      expect(res.status).toBe(200);
      expect(res.body.attachment.kind).toBe("pdf");
      expect(res.body.attachment.name).toBe("scanned-drawing.pdf");
      expect(res.body.proposal.title).toBe("Beam deflection check");

      // The chat call must include a file content part carrying the raw PDF bytes.
      const args = mocks.chatCreate.mock.calls[0][0];
      const userMsg = args.messages.find((m: any) => m.role === "user");
      const parts = userMsg.content as any[];
      const filePart = parts.find((p: any) => p.type === "file");
      expect(filePart).toBeDefined();
      expect(filePart.file.file_data).toMatch(/^data:application\/pdf;base64,/);
      expect(filePart.file.filename).toBe("scanned-drawing.pdf");

      // Must NOT contain image_url parts (vision via file part, not rendered images).
      expect(parts.some((p: any) => p.type === "image_url")).toBe(false);
    });

    it("still returns a proposal when the PDF is large but within limits", async () => {
      // Simulate a large text-based PDF.
      mocks.extractPdfText.mockResolvedValueOnce("A".repeat(20000));
      mockCompletionOnce(VALID_PROPOSAL_JSON);

      const res = await request(app)
        .post("/api/genius/upload")
        .set(authHeader(token))
        .attach("file", PDF_BUFFER, { filename: "large-spec.pdf", contentType: "application/pdf" });

      expect(res.status).toBe(200);
      // Text is sliced to 24000 chars — verify the model was still called.
      expect(mocks.chatCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/genius/proposal/build", () => {
    it("builds and persists a calculation from an approved proposal", async () => {
      mockCompletionOnce(VALID_DOC_JSON);

      const jobRes = await request(app)
        .post("/api/genius/proposal/build")
        .set(authHeader(token))
        .send({ proposal: JSON.parse(VALID_PROPOSAL_JSON), webSearch: false });

      expect(jobRes.status).toBe(200);
      expect(jobRes.body.jobId).toBeDefined();

      const result = await pollJobResult(app, token, jobRes.body.jobId);
      expect(result.id).toBeDefined();
      expect(result.userId).toBe(userId);
      expect(result.document.projectTitle).toBe("Test Power Calc");

      // The generation prompt must carry the approved task details.
      const args = mocks.chatCreate.mock.calls[0][0];
      const userMsg = args.messages.find((m: any) => m.role === "user");
      expect(userMsg.content).toContain("APPROVED calculation task");
      expect(userMsg.content).toContain("Beam deflection check");
      expect(userMsg.content).toContain("Steel E = 210 GPa");
    });

    it("rejects an invalid proposal body", async () => {
      const res = await request(app)
        .post("/api/genius/proposal/build")
        .set(authHeader(token))
        .send({});
      expect(res.status).toBe(400);
    });

    it("rejects an approved build that enables both Expert and PhD modes", async () => {
      const res = await request(app)
        .post("/api/genius/proposal/build")
        .set(authHeader(token))
        .send({
          proposal: JSON.parse(VALID_PROPOSAL_JSON),
          expertMode: true,
          phdMode: true,
        });

      expect(res.status).toBe(400);
      expect(mocks.chatCreate).not.toHaveBeenCalled();
    });
  });
});
