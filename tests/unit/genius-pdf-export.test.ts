// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import {
  calculationPdfTitle,
  fitPrintFormulas,
  fittedPrintMathSize,
  printCalculationPdf,
} from "../../client/src/features/genius/pdfExport";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("Genius calculation PDF export", () => {
  it("starts Calculation Steps on a new page without keeping the whole chapter unbreakable", () => {
    const printCss = fs.readFileSync("client/src/index.css", "utf8");

    expect(printCss).toMatch(/#section-steps\s*\{[^}]*break-before:\s*page\s*!important/s);
    expect(printCss).toMatch(/#section-steps\s*\{[^}]*break-inside:\s*auto\s*!important/s);
    expect(printCss).toMatch(/#section-steps[\s\S]*?#section-steps tbody\s*\{[^}]*break-inside:\s*auto\s*!important/s);
  });

  it("prints calculation rows in their completed visible animation state", () => {
    const printCss = fs.readFileSync("client/src/index.css", "utf8");

    expect(printCss).toMatch(
      /\.result-row-reveal,[\s\S]*?\{[^}]*opacity:\s*1\s*!important;[^}]*animation:\s*none\s*!important;/s,
    );
  });

  it("keeps layered KaTeX fraction elements transparent so denominators print", () => {
    const printCss = fs.readFileSync("client/src/index.css", "utf8");

    expect(printCss).toMatch(
      /\.worksheet-print-root \*\s*\{[^}]*background-color:\s*transparent\s*!important;/s,
    );
    expect(printCss).not.toContain("background-color: inherit !important");
  });

  it("uses a filesystem-safe calculation name for the suggested PDF title", () => {
    expect(calculationPdfTitle("  Beam / Column: Check?  ")).toBe("Beam Column Check");
    expect(calculationPdfTitle("...")).toBe("Genius X1 Calculation");
  });

  it("fits oversized equations to the printable formula width without enlarging short ones", () => {
    expect(fittedPrintMathSize(400, 500)).toBe(0.88);
    expect(fittedPrintMathSize(1000, 500)).toBeCloseTo(0.44);
  });

  it("applies an individual print size to a formula that exceeds the A4 math column", () => {
    document.body.innerHTML = `
      <div class="step-math-print">
        <span class="katex-block"><span class="katex">long equation</span></span>
      </div>
    `;
    const widthSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 1000,
      height: 20,
      top: 0,
      right: 1000,
      bottom: 20,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fitPrintFormulas(document);

    const formula = document.querySelector<HTMLElement>(".katex-block");
    expect(Number.parseFloat(formula?.style.getPropertyValue("--step-print-math-size") ?? "")).toBeLessThan(0.5);
    expect(document.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
    widthSpy.mockRestore();
  });

  it("sets the calculation name while opening print and restores the app title afterward", () => {
    vi.useFakeTimers();
    document.title = "Genius X1";
    const seenTitles: string[] = [];

    printCalculationPdf("Motor sizing", () => seenTitles.push(document.title));

    expect(seenTitles).toEqual(["Motor sizing"]);
    expect(document.title).toBe("Motor sizing");

    vi.runAllTimers();
    expect(document.title).toBe("Genius X1");
  });
});