import { describe, it, expect } from "vitest";
import {
  extractNumericTokens,
  commentaryNumbersAreGrounded,
} from "../../server/services/genius-eval";
import type { GeniusCalculationDoc } from "../../shared/schema";

const doc: GeniusCalculationDoc = {
  projectTitle: "Ball screw drive",
  problemStatement: "Torque for a 5000 N load",
  inputs: [
    { id: "i1", symbol: "F", label: "Force", value: 5000, unit: "N", editable: true },
    { id: "i2", symbol: "lead", label: "Lead", value: 10, unit: "mm", editable: true },
  ],
  assumptions: [
    { id: "a1", symbol: "eff", label: "Efficiency", value: 0.9, unit: "", rationale: "", editable: true },
  ],
  steps: [
    {
      id: "s1",
      symbol: "T",
      title: "Torque",
      description: "",
      formula: "",
      expr: "F * (lead/1000) / (2*pi*eff)",
      calculation: "",
      result: "8.842",
      unit: "N·m",
      sources: [1],
      warnings: [],
    },
  ],
  results: [{ id: "r1", label: "Torque", symbol: "T", value: "8.842", unit: "N·m", sources: [1] }],
  references: [{ id: 1, title: "Ref", url: "https://example.com" }],
  confidence: { score: 82, explanation: "", factors: [] },
  visualizations: [],
};

describe("extractNumericTokens", () => {
  it("extracts plain, decimal and scientific numbers", () => {
    expect(extractNumericTokens("torque of 8.842 N·m at 5e3 N")).toEqual([8.842, 5000]);
  });

  it("handles thousands separators", () => {
    expect(extractNumericTokens("a load of 5,000 N")).toEqual([5000]);
  });
});

describe("commentaryNumbersAreGrounded", () => {
  it("accepts commentary quoting only document numbers", () => {
    expect(
      commentaryNumbersAreGrounded(
        "The torque of 8.842 N·m is modest for a 5000 N load; the 0.9 efficiency assumption drives it.",
        [doc],
      ),
    ).toBe(true);
  });

  it("accepts rounded forms of document numbers (within tolerance)", () => {
    expect(commentaryNumbersAreGrounded("Roughly 8.8 N·m of torque is required.", [doc])).toBe(true);
  });

  it("always allows small counting integers", () => {
    expect(commentaryNumbersAreGrounded("All 3 assumptions in step 1 hold.", [doc])).toBe(true);
  });

  it("rejects invented numbers", () => {
    expect(commentaryNumbersAreGrounded("That works out to about 42.7 N·m.", [doc])).toBe(false);
  });

  it("accepts numbers grounded in a previous document version", () => {
    const prev = { ...doc, results: [{ ...doc.results[0], value: "17.68" }] };
    expect(
      commentaryNumbersAreGrounded("Torque dropped from 17.68 to 8.842 N·m.", [doc, prev]),
    ).toBe(true);
  });
});
