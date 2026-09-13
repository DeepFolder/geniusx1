import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { buildChatApp } from "../helpers/app";
import { authHeader, mintMemberToken } from "../helpers/auth";
import { closeDatabaseConnection, seedUser } from "../helpers/db";

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

vi.mock("../../server/services/genius-service.js", async (importOriginal) => {
  const mod = await importOriginal<any>();
  return { ...mod, classifyIntent: mocks.classifyIntent };
});

const BASE_DOC = {
  projectTitle: "Expert pipeline benchmark",
  problemStatement: "Compute force and power.",
  inputs: [
    { id: "i1", symbol: "m", label: "Mass", value: 50, unit: "kg", editable: true },
    { id: "i2", symbol: "a", label: "Acceleration", value: 2, unit: "m/s²", editable: true },
    { id: "i3", symbol: "v", label: "Velocity", value: 3, unit: "m/s", editable: true },
  ],
  assumptions: [],
  steps: [
    {
      id: "s1", symbol: "F", title: "Force", description: "", formula: "F = ma",
      expr: "m * a", calculation: "", result: "untrusted", unit: "N", sources: [1], warnings: [],
    },
    {
      id: "s2", symbol: "P", title: "Power", description: "", formula: "P = Fv",
      expr: "F * v", calculation: "", result: "untrusted", unit: "W", sources: [1], warnings: [],
    },
  ],
  results: [
    { id: "r1", label: "Force", symbol: "F", value: "untrusted", unit: "N", sources: [1] },
    { id: "r2", label: "Power", symbol: "P", value: "untrusted", unit: "W", sources: [1] },
  ],
  references: [{ id: 1, title: "NIST Guide to SI", url: "https://www.nist.gov/pml/special-publication-811" }],
  confidence: { score: 90, explanation: "Controlled benchmark.", factors: ["Known expressions"] },
  visualizations: [],
  expertSummary: "Force and power are recomputed by the server.",
  recommendations: ["Verify the inputs."],
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function completion(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

async function pollMilestones(app: Express, token: string, jobId: string, startedAt: number) {
  let verified: any;
  let verifiedMs = 0;
  for (let i = 0; i < 300; i++) {
    await wait(5);
    const response = await request(app)
      .get(`/api/genius/jobs/${jobId}`)
      .set(authHeader(token));
    if (response.body.status === "verified" && !verified) {
      verified = response.body.result;
      verifiedMs = Date.now() - startedAt;
    }
    if (response.body.status === "done") {
      return {
        verified,
        final: response.body.result,
        verifiedMs,
        finalMs: Date.now() - startedAt,
      };
    }
    if (response.body.status === "error") throw new Error(response.body.error);
  }
  throw new Error("Benchmark job timed out");
}

describe("Genius expert route benchmark", () => {
  let app: Express;
  let token: string;

  beforeAll(async () => {
    app = await buildChatApp();
    const userId = `genius-benchmark-${Date.now()}`;
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
    mocks.classifyIntent.mockImplementation(async () => {
      await wait(10);
      return {
        intent: "calculation",
        model: "gpt-4o-mini",
        promptTokens: 4,
        completionTokens: 2,
        totalTokens: 6,
        durationMs: 10,
      };
    });
    mocks.responsesCreate.mockImplementation(async () => {
      await wait(25);
      return {
        output_text: "NIST Guide to SI :: https://www.nist.gov/pml/special-publication-811",
        output: [],
      };
    });
    mocks.chatCreate.mockImplementation(async (params: any) => {
      const system = params.messages?.find((message: any) => message.role === "system")?.content ?? "";
      const user = params.messages?.findLast((message: any) => message.role === "user")?.content ?? "";
      if (system.includes("senior engineer reviewing")) {
        await wait(90);
        const power = user.includes("400") ? "400" : "300";
        return completion(`Mass and velocity dominate the ${power} W output from the 100 N force.`);
      }
      await wait(user.includes("multi-step") ? 55 : 40);
      const doc = structuredClone(BASE_DOC);
      if (user.includes("velocity to 4")) doc.inputs[2].value = 4;
      if (user.includes("simple force")) {
        doc.steps = [doc.steps[0]];
        doc.results = [doc.results[0]];
      }
      return completion(JSON.stringify(doc));
    });
  });

  it("reduces route time to first verified result without changing persisted correctness", { timeout: 30000 }, async () => {
    const fixtures = [
      { name: "simple", prompt: "simple force calculation", webSearch: false, expected: ["100 N"] },
      { name: "multi-step", prompt: "multi-step force and power calculation", webSearch: false, expected: ["100 N", "300 W"] },
      { name: "web-search", prompt: "power calculation with an authoritative source", webSearch: true, expected: ["100 N", "300 W"] },
    ];
    const measurements: any[] = [];

    for (const fixture of fixtures) {
      const startedAt = Date.now();
      const start = await request(app)
        .post("/api/genius/generate")
        .set(authHeader(token))
        .send({ prompt: fixture.prompt, webSearch: fixture.webSearch, expertMode: true });
      const result = await pollMilestones(app, token, start.body.jobId, startedAt);
      expect(result.verified).toBeDefined();
      expect(result.verified.document.results.map((row: any) => `${row.value} ${row.unit}`)).toEqual(fixture.expected);
      expect(result.final.document.results).toEqual(result.verified.document.results);
      expect(result.final.timings.firstVerifiedMs).toBeLessThan(result.final.timings.totalMs);

      const loaded = await request(app)
        .get(`/api/genius/${result.final.id}`)
        .set(authHeader(token));
      expect(loaded.body.chatHistory.map((turn: any) => turn.role)).toEqual(["user", "assistant"]);
      if (fixture.webSearch) {
        expect(result.final.document.references[0].url).toContain("nist.gov");
      }

      measurements.push({
        fixture: fixture.name,
        legacyFinalOnlyMs: result.finalMs,
        optimizedFirstVerifiedMs: result.verifiedMs,
        improvementPct: Math.round((1 - result.verifiedMs / result.finalMs) * 100),
        serverStages: result.final.timings,
      });
    }

    const saved = await request(app)
      .post("/api/genius")
      .set(authHeader(token))
      .send({ document: BASE_DOC });
    const followStartedAt = Date.now();
    const follow = await request(app)
      .post(`/api/genius/${saved.body.id}/message`)
      .set(authHeader(token))
      .send({ message: "Change velocity to 4 m/s", webSearch: true, expertMode: true });
    const followResult = await pollMilestones(app, token, follow.body.jobId, followStartedAt);
    expect(followResult.verified.document.results[1]).toMatchObject({ value: "400", unit: "W" });
    measurements.push({
      fixture: "follow-up",
      legacyFinalOnlyMs: followResult.finalMs,
      optimizedFirstVerifiedMs: followResult.verifiedMs,
      improvementPct: Math.round((1 - followResult.verifiedMs / followResult.finalMs) * 100),
      serverStages: followResult.final.timings,
    });

    const meanImprovementPct = Math.round(
      measurements.reduce((sum, measurement) => sum + measurement.improvementPct, 0) / measurements.length,
    );
    expect(meanImprovementPct).toBeGreaterThanOrEqual(20);
    console.log(JSON.stringify({
      benchmark: "Genius expert route pipeline",
      methodology: "Actual authenticated routes, persistence, job polling, history restoration, and deterministic recompute; controlled AI delays. Legacy is final-only arrival, matching the former client contract.",
      meanImprovementPct,
      correctness: {
        recomputedValuesUnchangedBetweenMilestones: true,
        unitsPreserved: true,
        citationsRestored: true,
        historyRestored: true,
      },
      measurements,
    }, null, 2));
  });
});