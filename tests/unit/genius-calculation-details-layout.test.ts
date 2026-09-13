import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Worksheet } from "../../client/src/features/genius/Worksheet";
import type { GeniusCalculationDoc } from "../../shared/schema";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const BASE_DOC: GeniusCalculationDoc = {
  projectTitle: "Report details check",
  problemStatement: "",
  inputs: [],
  assumptions: [],
  steps: [],
  results: [],
  references: [],
  confidence: { score: 0, explanation: "", factors: [] },
  visualizations: [],
  expertSummary: "",
  recommendations: [],
  versions: [],
};

function renderWorksheet(doc: GeniusCalculationDoc, readOnly = false): string {
  return renderToStaticMarkup(React.createElement(Worksheet, {
    doc,
    onChange: () => {},
    onRecalc: () => {},
    isRecalculating: false,
    onExplainStep: () => {},
    isExplaining: false,
    readOnly,
    calculationId: 1,
  }));
}

describe("Genius calculation details layout", () => {
  it("renders one accessible Details control and editable labelled fields", () => {
    const html = renderWorksheet(BASE_DOC);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="calculation-details"');
    expect(html).toContain(">Details<");
    expect(html).toContain("Project name/number");
    expect(html).not.toContain("Save details");
    expect(html).toContain("calculation-details-content");
  });

  it("prints completed details but omits an empty metadata block", () => {
    const populated = renderWorksheet({
      ...BASE_DOC,
      details: { authorName: "A. Engineer", projectNameNumber: "NB-42", notes: "Use verified dimensions." },
    });
    const blank = renderWorksheet(BASE_DOC);

    expect(populated).toContain("print-calculation-details");
    expect(populated).toContain("A. Engineer");
    expect(populated).toContain("NB-42");
    expect(populated).toContain("Use verified dimensions.");
    expect(blank).not.toContain("print-calculation-details");
  });

  it("renders historical details without autosave feedback and locks their fields", () => {
    const html = renderWorksheet({
      ...BASE_DOC,
      details: { authorName: "A. Engineer", projectNameNumber: "", notes: "" },
    }, true);
    expect(html).toContain('readonly=""');
    expect(html).not.toContain("Saving…");
    expect(html).not.toContain("Saved");
  });
});