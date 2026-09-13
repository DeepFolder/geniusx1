import { beforeEach, describe, expect, it, vi } from "vitest";

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

const DOC = {
  projectTitle: "Routing test",
  problemStatement: "Compute force.",
  inputs: [{ id: "i1", symbol: "m", label: "Mass", value: 10, unit: "kg", editable: true }],
  assumptions: [{ id: "a1", symbol: "a", label: "Acceleration", value: 2, unit: "m/s²", rationale: "test", editable: true }],
  steps: [{
    id: "s1", symbol: "F", title: "Force", description: "", formula: "F = ma",
    expr: "m * a", calculation: "", result: "", unit: "N", sources: [1], warnings: [],
  }],
  results: [{ id: "r1", label: "Force", symbol: "F", value: "", unit: "N", sources: [1] }],
  references: [{ id: 1, title: "NIST", url: "" }],
  confidence: { score: 80, explanation: "test", factors: ["test"] },
  visualizations: [],
  expertSummary: "Force is computed.",
  recommendations: ["Verify acceleration."],
};

const PROPOSAL = {
  title: "Force",
  understanding: "Compute force.",
  problem: "Find force.",
  inputs: [{ label: "Mass", value: "10", unit: "kg" }],
  assumptions: ["Acceleration is 2 m/s²"],
  approach: "Use Newton's second law.",
};

function completion(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

describe("Genius exact expert model routing", () => {
  beforeEach(() => {
    mocks.chatCreate.mockReset();
    mocks.responsesCreate.mockReset();
  });

  it("accepts bare LaTex escapes in a reasoning-model proposal response", async () => {
    const { extractProposalJson } = await import("../../server/services/genius-service.js");
    const raw = String.raw`{"approach":"Use \(F = m \cdot a\) and \frac{F}{A}."}`;

    expect(extractProposalJson(raw)).toEqual({
      approach: String.raw`Use \(F = m \cdot a\) and \frac{F}{A}.`,
    });
  });

  it("preserves already JSON-escaped LaTex in a reasoning-model proposal response", async () => {
    const { extractProposalJson } = await import("../../server/services/genius-service.js");
    const approach = String.raw`Use \frac{F}{A}.`;

    expect(extractProposalJson(JSON.stringify({ approach }))).toEqual({ approach });
  });

  it("uses gpt-4o-mini with bounded deterministic params for intent in expert mode", async () => {
    const { classifyIntent } = await import("../../server/services/genius-service.js");
    mocks.chatCreate.mockResolvedValueOnce(completion(JSON.stringify({ intent: "calculation" })));

    await classifyIntent("calculate force", false, true);

    expect(mocks.chatCreate.mock.calls[0][0]).toMatchObject({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 120,
      response_format: { type: "json_object" },
    });
  });

  it("uses gpt-4o-mini with the configured 300-token ceiling for expert commentary", async () => {
    const { generateCommentary } = await import("../../server/services/genius-service.js");
    mocks.chatCreate.mockResolvedValueOnce(completion("Mass dominates the 20 N force."));

    await generateCommentary(DOC as any, { kind: "new" }, true);

    expect(mocks.chatCreate.mock.calls[0][0]).toMatchObject({
      model: "gpt-4o-mini",
      max_tokens: 300,
    });
  });

  it("uses gpt-4o-mini web search and honors cancellation signals", async () => {
    const { searchEngineeringReferences } = await import("../../server/services/genius-service.js");
    mocks.responsesCreate.mockResolvedValueOnce({
      output_text: "NIST :: https://www.nist.gov/pml/special-publication-811",
      output: [],
    });
    const controller = new AbortController();

    await searchEngineeringReferences("force", controller.signal);

    expect(mocks.responsesCreate.mock.calls[0][0]).toMatchObject({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
    });
    expect(mocks.responsesCreate.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("keeps expert Q&A on gpt-5.4 while routing proposal refinement to Sol", async () => {
    const { answerQuestion, refineTaskProposal } = await import("../../server/services/genius-service.js");
    mocks.chatCreate
      .mockResolvedValueOnce(completion("Force is mass times acceleration."))
      .mockResolvedValueOnce(completion(JSON.stringify(PROPOSAL)));

    await answerQuestion("What is force?", undefined, false, true);
    await refineTaskProposal(PROPOSAL, "Keep it concise", true);

    expect(mocks.chatCreate.mock.calls[0][0].model).toBe("gpt-5.4-2026-03-05");
    expect(mocks.chatCreate.mock.calls[1][0]).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning_effort: "high",
      response_format: { type: "text" },
    });
  });

  it("returns explicit example context only when the answer identifies a calculable method", async () => {
    const { answerQuestion, proposeTaskFromExplanation } = await import("../../server/services/genius-service.js");
    mocks.chatCreate
      .mockResolvedValueOnce(completion(JSON.stringify({
        answer: "Use Euler buckling to estimate the critical load.",
        calculationExample: {
          request: "Estimate the critical load for a pinned steel column.",
          method: "Use Euler buckling with the member length, modulus, and second moment of area. State any missing boundary condition or material values as assumptions.",
        },
      })))
      .mockResolvedValueOnce(completion(JSON.stringify(PROPOSAL)));

    const answer = await answerQuestion("How do I calculate column buckling?");
    expect(answer.calculationExample).toMatchObject({
      request: "Estimate the critical load for a pinned steel column.",
      method: expect.stringContaining("Euler buckling"),
    });

    const planned = await proposeTaskFromExplanation(answer.calculationExample!, false);
    expect(planned.proposal).toMatchObject(PROPOSAL);
    const planPrompt = mocks.chatCreate.mock.calls[1][0].messages[1].content;
    expect(planPrompt).toContain("EXAMPLE PROBLEM:");
    expect(planPrompt).toContain("EXPLANATION METHOD:");
  });

  it("keeps a legacy prose answer usable when the optional action contract is absent", async () => {
    const { answerQuestion } = await import("../../server/services/genius-service.js");
    mocks.chatCreate.mockResolvedValueOnce(completion("Force is mass times acceleration."));

    await expect(answerQuestion("What is force?")).resolves.toEqual({
      answer: "Force is mass times acceleration.",
    });
  });

  it("uses JSON mode for expert answers and never exposes an invalid JSON envelope", async () => {
    const { answerQuestion } = await import("../../server/services/genius-service.js");
    mocks.chatCreate.mockResolvedValueOnce(completion('{"answer":"P = \\q"}'));

    await expect(answerQuestion("What is power?", undefined, false, true)).resolves.toEqual({
      answer: "I couldn't safely format that answer. Please try again.",
    });
    expect(mocks.chatCreate.mock.calls[0][0]).toMatchObject({
      model: "gpt-5.4-2026-03-05",
      response_format: { type: "json_object" },
    });
  });

  it("gives chat the evaluator diagnostics needed to explain a withheld result", async () => {
    const { answerQuestion } = await import("../../server/services/genius-service.js");
    const failingDoc = {
      ...DOC,
      inputs: [{ ...DOC.inputs[0], value: "" }],
      steps: [{
        ...DOC.steps[0],
        result: "—",
        reviewNeeded: true,
        warnings: ['Unit review: missing or invalid numeric input "Mass" (m).'],
      }],
      results: [{
        ...DOC.results[0],
        value: "—",
        reviewNeeded: true,
        warnings: ["Unit review: the source calculation step needs review."],
      }],
    };
    mocks.chatCreate.mockResolvedValueOnce(completion(JSON.stringify({
      answer: "Mass is missing; enter a finite value in kg and recalculate.",
      calculationExample: null,
    })));

    await answerQuestion("Why is my force blank?", failingDoc as any);

    const requestContext = mocks.chatCreate.mock.calls[0][0].messages.at(-1).content;
    expect(requestContext).toContain("VERIFICATION DIAGNOSTICS");
    expect(requestContext).toContain('missing or invalid numeric input "Mass" (m)');
    expect(requestContext).toContain("Mass (m) =");
  });

  it("builds step explanations from the selected verified step fields", async () => {
    const { buildStepExplanationPrompt } = await import("../../server/services/genius-service.js");
    const step = {
      ...DOC.steps[0],
      calculation: "10 \\times 2",
      result: "20",
      description: "Converts mass and acceleration into the applied force.",
      warnings: ["Confirm the acceleration is a peak load."],
    };

    const prompt = buildStepExplanationPrompt(DOC as any, step);

    expect(prompt).toContain("Step label: Force");
    expect(prompt).toContain("Symbol: F");
    expect(prompt).toContain("Formula: F = ma");
    expect(prompt).toContain("Substituted calculation: 10 \\times 2");
    expect(prompt).toContain("Verified result: 20 N");
    expect(prompt).toContain("Note: Converts mass and acceleration");
    expect(prompt).toContain("Warnings: Confirm the acceleration");
    expect(prompt).toContain("no more than about 140 words");
    expect(prompt).toContain("two compact, unlabeled paragraphs");
    expect(prompt).toContain("visible display-math line between the paragraphs");
    expect(prompt).toContain("using exactly \\[ and \\] delimiters so it renders like the worksheet equations");
    expect(prompt).toContain("Never put explanatory words inside the math delimiters.");
    expect(prompt).toContain("Do not use headings, labels, numbered sections, or bullet lists.");
    expect(prompt).toContain("Do not suggest changes or recalculate anything.");
  });

  it("keeps expert generation and approved builds on gpt-5.6-sol with high reasoning", async () => {
/*

    expect(prompt).toContain("Step label: Force");
    expect(prompt).toContain("Symbol: F");
    expect(prompt).toContain("Formula: F = ma");
    expect(prompt).toContain("Substituted calculation: 10 \\times 2");
    expect(prompt).toContain("Verified result: 20 N");
    expect(prompt).toContain("Note: Converts mass and acceleration");
    expect(prompt).toContain("Warnings: Confirm the acceleration");
    expect(prompt).toContain("Do not use headings, numbered sections, or a rigid list.");
    expect(prompt).toContain("Do not suggest changes or recalculate anything.");
  });

  it("keeps expert generation and approved builds on gpt-5.6-sol with high reasoning", async () => {
*/
    const { generateCalculation, generateFromProposal } = await import("../../server/services/genius-service.js");
    mocks.chatCreate
      .mockResolvedValueOnce(completion(JSON.stringify(DOC)))
      .mockResolvedValueOnce(completion(JSON.stringify(DOC)));

    const generated = await generateCalculation("calculate force", { expertMode: true });
    const built = await generateFromProposal(PROPOSAL, { expertMode: true });

    for (const call of mocks.chatCreate.mock.calls) {
      expect(call[0]).toMatchObject({
        model: "gpt-5.6-sol",
        reasoning_effort: "high",
        response_format: { type: "text" },
      });
    }
    expect(generated.doc.results[0].value).toBe("20");
    expect(built.doc.results[0].value).toBe("20");
  });

  it("routes primary, follow-up, and approved-build calculations through Astra at high reasoning in PhD mode", async () => {
    const { generateCalculation, followUpCalculation, generateFromProposal } = await import("../../server/services/genius-service.js");
    mocks.chatCreate
      .mockResolvedValueOnce(completion(JSON.stringify(DOC)))
      .mockResolvedValueOnce(completion(JSON.stringify(DOC)))
      .mockResolvedValueOnce(completion(JSON.stringify(DOC)));

    await generateCalculation("calculate force", { phdMode: true });
    await followUpCalculation("Double the acceleration", DOC as any, { phdMode: true });
    await generateFromProposal(PROPOSAL, { phdMode: true });

    expect(mocks.chatCreate).toHaveBeenCalledTimes(3);
    for (const [params] of mocks.chatCreate.mock.calls) {
      expect(params).toMatchObject({
        model: "gpt-6-astra",
        reasoning_effort: "high",
        response_format: { type: "text" },
      });
      expect(params).not.toHaveProperty("temperature");
    }
  });

  it("keeps Standard text plans and refinements on the established JSON proposal route", async () => {
    const { proposeTaskFromText, refineTaskProposal } = await import("../../server/services/genius-service.js");
    mocks.chatCreate
      .mockResolvedValueOnce(completion(JSON.stringify(PROPOSAL)))
      .mockResolvedValueOnce(completion(JSON.stringify(PROPOSAL)));

    await proposeTaskFromText("Calculate a force.");
    await refineTaskProposal(PROPOSAL, "Use a 12 kg mass.");

    for (const [params] of mocks.chatCreate.mock.calls) {
      expect(params).toMatchObject({
        model: "gpt-4o",
        temperature: 0.2,
        response_format: { type: "json_object" },
      });
      expect(params).not.toHaveProperty("reasoning_effort");
    }
  });

  it("routes Standard image proposals through the configured Standard calculation model", async () => {
    const { proposeTaskFromDocument } = await import("../../server/services/genius-service.js");
    mocks.chatCreate.mockResolvedValueOnce(completion(JSON.stringify(PROPOSAL)));

    await proposeTaskFromDocument({
      kind: "image",
      name: "free-body.png",
      imageDataUrl: "data:image/png;base64,AA==",
    });

    expect(mocks.chatCreate.mock.calls[0][0]).toMatchObject({
      model: "gpt-5.4-2026-03-05",
      response_format: { type: "text" },
    });
    expect(mocks.chatCreate.mock.calls[0][0]).not.toHaveProperty("temperature");
  });

  it("routes Expert text plans, image proposals, and refinements through Sol", async () => {
    const { proposeTaskFromText, proposeTaskFromDocument, refineTaskProposal } =
      await import("../../server/services/genius-service.js");
    mocks.chatCreate
      .mockResolvedValueOnce(completion(JSON.stringify(PROPOSAL)))
      .mockResolvedValueOnce(completion(JSON.stringify(PROPOSAL)))
      .mockResolvedValueOnce(completion(JSON.stringify(PROPOSAL)));

    await proposeTaskFromText("Calculate a force.", true);
    await proposeTaskFromDocument(
      { kind: "image", name: "free-body.png", imageDataUrl: "data:image/png;base64,AA==" },
      undefined,
      true,
    );
    await refineTaskProposal(PROPOSAL, "Use a 12 kg mass.", true);

    for (const [params] of mocks.chatCreate.mock.calls) {
      expect(params).toMatchObject({
        model: "gpt-5.6-sol",
        reasoning_effort: "high",
        response_format: { type: "text" },
      });
      expect(params).not.toHaveProperty("temperature");
    }
    const imageContent = mocks.chatCreate.mock.calls[1][0].messages[1].content;
    expect(imageContent).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "image_url", image_url: { url: "data:image/png;base64,AA==", detail: "high" } }),
    ]));
  });

  it("routes PhD text plans, image proposals, and refinements through Sol at high reasoning", async () => {
    const { proposeTaskFromText, proposeTaskFromDocument, refineTaskProposal } =
      await import("../../server/services/genius-service.js");
    mocks.chatCreate
      .mockResolvedValueOnce(completion(JSON.stringify(PROPOSAL)))
      .mockResolvedValueOnce(completion(JSON.stringify(PROPOSAL)))
      .mockResolvedValueOnce(completion(JSON.stringify(PROPOSAL)));

    await proposeTaskFromText("Calculate a force.", false, true);
    await proposeTaskFromDocument(
      { kind: "image", name: "free-body.png", imageDataUrl: "data:image/png;base64,AA==" },
      undefined,
      false,
      true,
    );
    await refineTaskProposal(PROPOSAL, "Use a 12 kg mass.", false, true);

    for (const [params] of mocks.chatCreate.mock.calls) {
      expect(params).toMatchObject({
        model: "gpt-5.6-sol",
        reasoning_effort: "high",
        response_format: { type: "text" },
      });
      expect(params).not.toHaveProperty("temperature");
    }
    const imageContent = mocks.chatCreate.mock.calls[1][0].messages[1].content;
    expect(imageContent).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "image_url", image_url: { url: "data:image/png;base64,AA==", detail: "high" } }),
    ]));
  });

  it("rejects an invalid dual quality-mode proposal request", async () => {
    const { proposeTaskFromText } = await import("../../server/services/genius-service.js");

    await expect(proposeTaskFromText("Calculate a force.", true, true))
      .rejects.toThrow("Expert and PhD modes cannot be enabled together");
    expect(mocks.chatCreate).not.toHaveBeenCalled();
  });
});
