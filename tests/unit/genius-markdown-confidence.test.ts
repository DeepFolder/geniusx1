import { describe, expect, it } from "vitest";
import { docToMarkdown } from "../../client/src/features/genius/markdown";
import type { GeniusCalculationDoc } from "../../shared/schema";

const savedCalculation: GeniusCalculationDoc = {
  projectTitle: "Saved beam check",
  problemStatement: "",
  inputs: [],
  assumptions: [],
  steps: [],
  results: [],
  references: [],
  confidence: {
    score: 74,
    explanation: "A saved numeric score remains supported.",
    factors: ["Inputs were complete"],
  },
  visualizations: [],
  expertSummary: "",
  recommendations: [],
  versions: [],
};

describe("Genius Markdown confidence", () => {
  it("uses a text confidence level for saved numeric scores without exposing a percentage", () => {
    const markdown = docToMarkdown(savedCalculation);

    expect(markdown).toContain("**Medium Confidence**");
    expect(markdown).toContain("A saved numeric score remains supported.");
    expect(markdown).toContain("- Inputs were complete");
    expect(markdown).not.toContain("74%");
  });
});