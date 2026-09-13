import { describe, expect, it } from "vitest";
import type { GeniusCalculationDoc } from "../../shared/schema.js";
import { BALL_SCREW_EXAMPLE } from "../../shared/genius-example.js";
import { recomputeDoc } from "../../server/services/genius-eval.js";

function calculationDoc(): GeniusCalculationDoc {
  return {
    projectTitle: "Input substitution regression",
    problemStatement: "",
    inputs: [
      {
        id: "input-force",
        symbol: "F",
        label: "Force",
        value: 180,
        unit: "N",
        editable: true,
        description: "",
      },
    ],
    assumptions: [
      {
        id: "assumption-speed",
        symbol: "v",
        label: "Speed",
        value: 0.6,
        unit: "m/s",
        rationale: "",
        editable: true,
      },
    ],
    steps: [
      {
        id: "step-power",
        symbol: "P",
        title: "Power",
        description: "",
        formula: "F \\cdot v",
        expr: "F * v",
        calculation: "180 \\cdot 0.6",
        result: "108",
        unit: "N·m/s",
        sources: [],
        warnings: [],
      },
      {
        id: "step-rated",
        symbol: "P_r",
        title: "Rated power",
        description: "",
        formula: "P \\cdot 2",
        expr: "P * 2",
        calculation: "108 \\cdot 2",
        result: "216",
        unit: "N·m/s",
        sources: [],
        warnings: [],
      },
    ],
    results: [
      {
        id: "result-rated",
        label: "Rated power",
        symbol: "P_r",
        value: "216",
        unit: "N·m/s",
        sources: [],
        description: "",
      },
    ],
    references: [],
    confidence: { score: 100, explanation: "", factors: [] },
    visualizations: [],
    expertSummary: "",
    recommendations: [],
    versions: [],
  };
}

describe("recomputeDoc calculation substitutions", () => {
  it("replaces stale numeric calculation text with current input and assumption values", () => {
    const doc = calculationDoc();
    doc.inputs[0].value = 500;
    doc.assumptions[0].value = 0.8;

    const recomputed = recomputeDoc(doc);

    expect(recomputed.steps[0].calculation).toBe("500 \\cdot 0.8");
    expect(recomputed.steps[0].result).toBe("400");
    expect(recomputed.results[0].value).toBe("800");
  });

  it("refreshes chained substitutions from newly computed upstream step values", () => {
    const doc = calculationDoc();
    doc.inputs[0].value = 500;
    doc.assumptions[0].value = 0.8;

    const first = recomputeDoc(doc);
    expect(first.steps[1].calculation).toBe("400 \\cdot 2");

    first.inputs[0].value = 250;
    const second = recomputeDoc(first);

    expect(second.steps[0].calculation).toBe("250 \\cdot 0.8");
    expect(second.steps[1].calculation).toBe("200 \\cdot 2");
    expect(second.results[0].value).toBe("400");
  });

  it("self-heals legacy numeric snapshots on the next recalculation", () => {
    const doc = calculationDoc();
    doc.steps[0].calculation = "\\frac{180 \\cdot 0.6}{1}";
    doc.inputs[0].value = 360;

    const recomputed = recomputeDoc(doc);

    expect(recomputed.steps[0].calculation).toBe("360 \\cdot 0.6");
    expect(recomputed.steps[0].calculation).not.toContain("180");
  });

  it("updates every direct and chained substitution in the real ball-screw example", () => {
    const doc = structuredClone(BALL_SCREW_EXAMPLE);
    doc.inputs.find((input) => input.symbol === "F")!.value = 40_000;
    doc.inputs.find((input) => input.symbol === "v")!.value = 200;

    const recomputed = recomputeDoc(doc);

    expect(recomputed.steps.map((step) => step.calculation)).toEqual([
      "(200 / 10) \\cdot 60",
      "40000 \\cdot (10/1000) / (2 \\cdot \\pi \\cdot 0.9)",
      "40000 \\cdot (200/1000)",
      "8000 / 0.9",
      "8888.89 \\cdot 2",
    ]);
  });

  it("normalizes inverse-trig notation in symbolic and substituted formulae", () => {
    const doc = calculationDoc();
    doc.steps = [
      {
        ...doc.steps[0],
        symbol: "theta",
        formula: "\\atan\\left(\\frac{v}{F}\\right)",
        expr: "atan(v/F)",
        calculation: "",
        unit: "rad",
      },
    ];
    doc.results = [
      {
        ...doc.results[0],
        symbol: "theta",
        unit: "rad",
      },
    ];

    const recomputed = recomputeDoc(doc);

    expect(recomputed.steps[0].formula).toBe("\\arctan\\left(\\frac{v}{F}\\right)");
    expect(recomputed.steps[0].calculation).toBe("\\arctan(0.6/180)");
    expect(recomputed.steps[0].formula).not.toContain("\\atan");
    expect(recomputed.steps[0].calculation).not.toContain("\\atan");
  });
});