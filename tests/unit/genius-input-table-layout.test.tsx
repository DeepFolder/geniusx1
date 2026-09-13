import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { InputsTable } from "../../client/src/features/genius/InputsTable";
import { SymbolLegend } from "../../client/src/features/genius/SymbolLegend";
import type { GeniusCalculationDoc } from "../../shared/schema";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const doc: GeniusCalculationDoc = {
  inputs: [{
    id: "yield",
    symbol: "sigma_yield",
    label: "Minimum specified material yield strength at the design temperature",
    value: 250,
    unit: "MPa",
  }],
  assumptions: [{
    id: "power",
    symbol: "P_motor_req",
    label: "Required motor power including the selected service factor",
    value: 5000,
    unit: "W",
  }],
  steps: [],
  results: [],
};

describe("Genius input table layout", () => {
  it("uses the same symbol guide as the legend for short and legacy-long symbols", () => {
    const inputs = renderToStaticMarkup(React.createElement(InputsTable, {
      doc,
      onChange: () => {},
      onRecalc: () => {},
      isRecalculating: false,
    }));
    const legend = renderToStaticMarkup(React.createElement(SymbolLegend, { doc }));

    expect(inputs).toContain("worksheet-aligned-table");
    expect(inputs).toContain("worksheet-symbol-column");
    expect(inputs).toContain("worksheet-parameter-column");
    expect(legend).toContain("worksheet-aligned-table");
    expect(legend).toContain("worksheet-symbol-column");
    expect(legend).toContain("worksheet-parameter-column");
    expect(legend).toContain("w-full border-collapse table-fixed");
  });

  it("anchors labels to a fixed shared guide and reserves the editable value column", () => {
    const inputs = renderToStaticMarkup(React.createElement(InputsTable, {
      doc,
      onChange: () => {},
      onRecalc: () => {},
      isRecalculating: false,
    }));

    expect(inputs).toContain("worksheet-inputs-table");
    expect(inputs).toContain("worksheet-value-column");
    expect(inputs).toContain("worksheet-source-column");
    expect(inputs).toContain("worksheet-parameter-label");
    expect(inputs).toContain("w-full border-collapse table-fixed");
    expect(inputs).not.toContain('<col class="w-full"/>');
    expect(inputs).not.toContain('class="truncate"');
  });

  it("defines one responsive symbol width and print-safe label wrapping", () => {
    const stylesheet = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8").replace(/\r\n/g, "\n");

    expect(stylesheet).toContain("--worksheet-symbol-column-width: 7rem");
    expect(stylesheet).toContain(".worksheet-aligned-table .worksheet-symbol-column");
    expect(stylesheet).toContain(".worksheet-inputs-table .worksheet-parameter-column");
    expect(stylesheet).toContain("width: 10rem;");
    expect(stylesheet).toContain("@media (max-width: 639px)");
    expect(stylesheet).toContain("--worksheet-symbol-column-width: 3.25rem");
    expect(stylesheet).toContain("width: 7.5rem;");
    expect(stylesheet).toContain(".worksheet-parameter-label {\n    white-space: normal !important;");
  });
});
