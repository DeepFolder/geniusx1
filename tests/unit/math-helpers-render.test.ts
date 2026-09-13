import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SymbolMath,
  UnitMath,
  engineeringSymbolToLatex,
  normalizeEngineeringLatexSymbols,
} from "../../client/src/components/chat/MathHelpers";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("Genius calculation math tokens", () => {
  it("renders scripted and Greek symbols at the shared inline symbol size", () => {
    const scripted = renderToStaticMarkup(React.createElement(SymbolMath, { content: "C_d" }));
    const greek = renderToStaticMarkup(React.createElement(SymbolMath, { content: "theta" }));

    expect(scripted).toContain('class="genius-symbol"');
    expect(scripted).toContain('class="katex-inline"');
    expect(scripted).toContain("mord mathnormal");
    expect(greek).toContain('class="genius-symbol"');
    expect(greek).toContain("θ");
  });

  it("keeps canonical unit rendering unchanged", () => {
    expect(renderToStaticMarkup(React.createElement(UnitMath, { unit: "Nm" }))).toBe("N·m");
    expect(renderToStaticMarkup(React.createElement(UnitMath, { unit: "m/s2" }))).toBe("m/s²");
  });

  it("compacts verbose and unit-bearing legacy symbols into one subscript", () => {
    expect(engineeringSymbolToLatex("P_motor_kw")).toBe("P_{d}");
    expect(engineeringSymbolToLatex("P_{motor}_{kw}")).toBe("P_{d}");
    expect(engineeringSymbolToLatex("F_net")).toBe("F_{n}");
    expect(engineeringSymbolToLatex("sigma_y")).toBe("\\sigma_{y}");
  });

  it("normalizes verbose symbols embedded in calculation formulas", () => {
    expect(
      normalizeEngineeringLatexSymbols(
        "\\frac{P_{motor}_{kw}}{\\eta_m} + F_axial_max",
      ),
    ).toBe("\\frac{P_{d}}{\\eta_{m}} + F_{a,max}");
  });

  it("repairs non-standard inverse-trig commands before KaTeX rendering", () => {
    expect(
      normalizeEngineeringLatexSymbols(
        "\\atan(x) + \\asin(y) + \\acos(z) + \\atan2(y, x)",
      ),
    ).toBe(
      "\\arctan(x) + \\arcsin(y) + \\arccos(z) + \\operatorname{atan2}(y, x)",
    );
  });
});