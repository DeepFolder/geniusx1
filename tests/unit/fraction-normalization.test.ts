import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import katex from "katex";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { convertDivisionsToFrac, RichTextRenderer } from "../../client/src/components/chat/RichTextRenderer";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("convertDivisionsToFrac", () => {
  it("converts parenthesized numerator over symbol", () => {
    expect(
      convertDivisionsToFrac("I_{pack} = (P_{motor,select} + P_{aux}) / V_{batt}"),
    ).toBe("I_{pack} = \\frac{P_{motor,select} + P_{aux}}{V_{batt}}");
  });

  it("converts simple division", () => {
    expect(convertDivisionsToFrac("a / b")).toBe("\\frac{a}{b}");
  });

  it("converts parenthesized numerator and denominator", () => {
    expect(convertDivisionsToFrac("(a + b) / (c - d)")).toBe("\\frac{a + b}{c - d}");
  });

  it("handles chained divisions", () => {
    expect(convertDivisionsToFrac("a/b/c")).toBe("\\frac{\\frac{a}{b}}{c}");
  });

  it("leaves slashes inside braces (units) untouched", () => {
    expect(convertDivisionsToFrac("v = d / t \\approx 5\\;\\mathrm{m/s}")).toBe(
      "v = \\frac{d}{t} \\approx 5\\;\\mathrm{m/s}",
    );
  });

  it("does not touch existing \\frac", () => {
    expect(convertDivisionsToFrac("\\frac{a}{b}")).toBe("\\frac{a}{b}");
  });

  it("handles LaTeX command denominators", () => {
    expect(convertDivisionsToFrac("P_{motor} / \\eta")).toBe("\\frac{P_{motor}}{\\eta}");
  });

  it("handles exponent tokens", () => {
    expect(convertDivisionsToFrac("10^{-3} / 2")).toBe("\\frac{10^{-3}}{2}");
  });

  it("handles numeric substitution chains", () => {
    expect(convertDivisionsToFrac("x = (1500 + 250) / 48 \\approx 36.5")).toBe(
      "x = \\frac{1500 + 250}{48} \\approx 36.5",
    );
  });

  it("output renders in KaTeX without errors", () => {
    const out = convertDivisionsToFrac(
      "I_{pack} = (P_{motor,select} + P_{aux}) / V_{batt} \\approx 36.5\\;\\mathrm{A}",
    );
    const html = katex.renderToString(out, {
      displayMode: true,
      throwOnError: true,
      strict: false,
    });
    expect(html).toContain("mfrac");
  });
});

describe("RichTextRenderer numbered explanations", () => {
  it("renders inline LaTeX in a numbered step heading", () => {
    const html = renderToStaticMarkup(
      React.createElement(RichTextRenderer, {
        content: "5. Calculate \\( P_{\\text{cr}} \\): use the critical-load equation.",
      }),
    );

    expect(html).toContain("katex");
    expect(html).toContain("P");
    expect(html).toContain("cr");
    expect(html).not.toContain("\\( P_{\\text{cr}} \\)");
  });

  it("recovers single-backslash JSON escapes and renders a bare explanatory equation", () => {
    const malformed = "P = \frac{T \times \text{RPM} \times 2\\pi}{60} to calculate power.";
    const html = renderToStaticMarkup(
      React.createElement(RichTextRenderer, { content: malformed }),
    );

    expect(html).toContain("katex");
    expect(html).toContain("mfrac");
    expect(html).not.toContain("\frac");
    expect(html).not.toContain("\times");
  });

  it("recovers additional JSON-decoded LaTeX command prefixes", () => {
    const malformed = "Gradient \nabla f and angle \beta.";
    const html = renderToStaticMarkup(
      React.createElement(RichTextRenderer, { content: malformed }),
    );

    expect(html).toContain("katex");
    expect(html).not.toContain("\nabla");
    expect(html).not.toContain("\beta");
  });

  it("renders bare ratio-and-power formulae in calculation plan prose", () => {
    const html = renderToStaticMarkup(
      React.createElement(RichTextRenderer, {
        content: "Apply the ISO 281 basic life relation L10 = (C/P)^p in millions of revolutions. Convert the resulting life to hours using the rotational speed and 60 minutes per hour.",
      }),
    );

    expect(html).toContain("katex");
    expect(html).toContain("mfrac");
    expect(html).toContain('class="katex-inline"');
    expect(html).toContain("Apply the ISO 281 basic life relation ");
    expect(html).toContain(" in millions of revolutions.");
    expect(html).toContain('class="msupsub"');
    expect(html).toContain(">10<");
  });
});
