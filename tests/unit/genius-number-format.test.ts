import { describe, expect, it } from "vitest";
import {
  formatGeniusNumber,
  requestedGeniusDecimals,
} from "../../shared/genius-number-format.js";
import { applyBestSIPrefix, formatNumber } from "../../server/services/genius-eval.js";

describe("Genius number display formatting", () => {
  it("uses at most two decimals by default and removes trailing zeros", () => {
    expect(formatGeniusNumber("10.0")).toBe("10");
    expect(formatGeniusNumber(18.126)).toBe("18.13");
    expect(formatNumber(2.5)).toBe("2.5");
    expect(applyBestSIPrefix(12_345, "N")).toEqual({ value: "12.35", unit: "kN" });
  });

  it("keeps tiny non-zero values useful instead of rounding them to zero", () => {
    expect(formatGeniusNumber(0.004321)).toBe("0.00432");
    expect(formatGeniusNumber(-0.00000001)).toBe("-1e-8");
  });

  it("honors explicitly requested extra decimal places without padding zeros", () => {
    expect(formatGeniusNumber(18.12649, 4)).toBe("18.1265");
    expect(formatGeniusNumber(10, 4)).toBe("10");
    expect(requestedGeniusDecimals("Show all results to 4 decimal places.")).toBe(4);
    expect(requestedGeniusDecimals("Please use more decimals.", 2)).toBe(4);
    expect(requestedGeniusDecimals("Use the default precision.", 6)).toBe(2);
  });
});