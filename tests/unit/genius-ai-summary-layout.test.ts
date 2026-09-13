import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Worksheet } from "../../client/src/features/genius/Worksheet";
import { formatSummarySentenceRows } from "../../client/src/features/genius/summarySentenceRows";
import { getGeniusConfidenceLevel, type GeniusCalculationDoc } from "../../shared/schema";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const BASE_DOC: GeniusCalculationDoc = {
  projectTitle: "Motor sizing",
  problemStatement: "Size a motor.",
  inputs: [],
  assumptions: [],
  steps: [],
  results: [],
  references: [],
  confidence: {
    score: 92,
    explanation: "Established equations and complete headline inputs.",
    factors: ["All required inputs provided"],
    sourceQualityNote: "Live source verification was not enabled.",
  },
  visualizations: [],
  expertSummary: "The motor requires 10 kW. The force and speed explain that magnitude.",
  recommendations: [],
  versions: [],
};

function renderWorksheet(doc: GeniusCalculationDoc): string {
  return renderToStaticMarkup(
    React.createElement(Worksheet, {
      doc,
      onChange: () => {},
      onRecalc: () => {},
      isRecalculating: false,
    }),
  );
}

describe("Genius AI Summary layout", () => {
  it("renders calculation reasoning before confidence and keeps confidence details together", () => {
    const html = renderWorksheet(BASE_DOC);
    const summaryIndex = html.indexOf("Calculation Summary");
    const confidenceIndex = html.indexOf("Calculation Confidence");

    expect(summaryIndex).toBeGreaterThan(-1);
    expect(confidenceIndex).toBeGreaterThan(summaryIndex);
    expect(html).toContain('role="separator"');
    expect(html).toContain("High Confidence");
    expect(html).not.toContain("92%");
    expect(html).toContain("Established equations and complete headline inputs.");
    expect(html).toContain("All required inputs provided");
    expect(html).toContain("Live source verification was not enabled.");
  });

  it("does not add a divider when only one subsection has content", () => {
    const summaryOnly = renderWorksheet({
      ...BASE_DOC,
      confidence: { score: 0, explanation: "", factors: [] },
    });
    const confidenceOnly = renderWorksheet({ ...BASE_DOC, expertSummary: "" });

    expect(summaryOnly).toContain("Calculation Summary");
    expect(summaryOnly).not.toContain("Calculation Confidence");
    expect(summaryOnly).not.toContain('role="separator"');

    expect(confidenceOnly).not.toContain("Calculation Summary");
    expect(confidenceOnly).toContain("Calculation Confidence");
    expect(confidenceOnly).not.toContain('role="separator"');
  });

  it("places complete summary sentences on separate rows", () => {
    const html = renderWorksheet(BASE_DOC);

    expect(html.match(/data-testid="calculation-summary-sentence"/g)).toHaveLength(2);
    expect(html).toContain(">The motor requires 10 kW.</p>");
    expect(html).toContain(">The force and speed explain that magnitude.</p>");
  });

  it("does not split engineering decimals, abbreviations, or inline notation", () => {
    expect(
      formatSummarySentenceRows(
        "The stress is 12.5 MPa at 1.25 m/s, e.g. under the nominal case. Ref. 4 supports the method. The U.S. guideline uses Eq. (2).",
      ),
    ).toEqual([
      "The stress is 12.5 MPa at 1.25 m/s, e.g. under the nominal case.",
      "Ref. 4 supports the method.",
      "The U.S. guideline uses Eq. (2).",
    ]);
  });

  it("keeps a single sentence and an empty summary stable", () => {
    expect(formatSummarySentenceRows("The selected shaft is adequate.")).toEqual([
      "The selected shaft is adequate.",
    ]);
    expect(formatSummarySentenceRows("")).toEqual([]);
  });

  it.each([
    [75, "High"],
    [74, "Medium"],
    [50, "Medium"],
    [49, "Low"],
  ] as const)("maps stored confidence score %i to %s Confidence", (score, level) => {
    expect(getGeniusConfidenceLevel(score)).toBe(level);
    const html = renderWorksheet({ ...BASE_DOC, confidence: { score, explanation: "", factors: [] } });

    expect(html).toContain(`${level} Confidence`);
    expect(html).not.toContain(`${score}%`);
  });
});