import { describe, it, expect } from "vitest";
import { applyBestSIPrefix, formatNumber } from "../../server/services/genius-eval.js";

describe("applyBestSIPrefix", () => {
  describe("base SI unit scaling", () => {
    it("scales N to kN (200000 N → 200 kN)", () => {
      const r = applyBestSIPrefix(200000, "N");
      expect(r.value).toBe("200");
      expect(r.unit).toBe("kN");
    });

    it("scales Pa to MPa (1500000 Pa → 1.5 MPa)", () => {
      const r = applyBestSIPrefix(1_500_000, "Pa");
      expect(r.value).toBe("1.5");
      expect(r.unit).toBe("MPa");
    });

    it("scales m to mm (0.003 m → 3 mm)", () => {
      const r = applyBestSIPrefix(0.003, "m");
      expect(r.value).toBe("3");
      expect(r.unit).toBe("mm");
    });

    it("scales W to kW (5000 W → 5 kW)", () => {
      const r = applyBestSIPrefix(5000, "W");
      expect(r.value).toBe("5");
      expect(r.unit).toBe("kW");
    });

    it("scales J to kJ (2500 J → 2.5 kJ)", () => {
      const r = applyBestSIPrefix(2500, "J");
      expect(r.value).toBe("2.5");
      expect(r.unit).toBe("kJ");
    });

    it("scales Hz to MHz (2400000 Hz → 2.4 MHz)", () => {
      const r = applyBestSIPrefix(2_400_000, "Hz");
      expect(r.value).toBe("2.4");
      expect(r.unit).toBe("MHz");
    });

    it("scales V to kV (11000 V → 11 kV)", () => {
      const r = applyBestSIPrefix(11000, "V");
      expect(r.value).toBe("11");
      expect(r.unit).toBe("kV");
    });

    it("uses µ prefix for very small values (0.000005 m → 5 µm)", () => {
      const r = applyBestSIPrefix(0.000005, "m");
      expect(r.value).toBe("5");
      expect(r.unit).toBe("µm");
    });

    it("keeps value in base unit when already in [1, 1000) range (500 N → 500 N)", () => {
      const r = applyBestSIPrefix(500, "N");
      expect(r.value).toBe("500");
      expect(r.unit).toBe("N");
    });
  });

  describe("no-op cases", () => {
    it("does NOT re-scale an already-prefixed unit (kN)", () => {
      const r = applyBestSIPrefix(200, "kN");
      expect(r.unit).toBe("kN");
      expect(r.value).toBe("200");
    });

    it("does NOT re-scale an already-prefixed unit (MPa)", () => {
      const r = applyBestSIPrefix(1.5, "MPa");
      expect(r.unit).toBe("MPa");
    });

    it("does NOT re-scale an already-prefixed unit (mm)", () => {
      const r = applyBestSIPrefix(3, "mm");
      expect(r.unit).toBe("mm");
    });

    it("does NOT scale a compound unit with · (N·m)", () => {
      const r = applyBestSIPrefix(200000, "N·m");
      expect(r.unit).toBe("N·m");
    });

    it("does NOT scale a compound unit with / (m/s²)", () => {
      const r = applyBestSIPrefix(9.81, "m/s²");
      expect(r.unit).toBe("m/s²");
    });

    it("does NOT scale a compound unit with space", () => {
      const r = applyBestSIPrefix(1000, "N m");
      expect(r.unit).toBe("N m");
    });

    it("returns '0' with unchanged unit for zero value", () => {
      const r = applyBestSIPrefix(0, "N");
      expect(r.value).toBe("0");
      expect(r.unit).toBe("N");
    });

    it("falls back to formatNumber for dimensionless (empty unit)", () => {
      const r = applyBestSIPrefix(200000, "");
      expect(r.unit).toBe("");
      expect(r.value).toBe(formatNumber(200000));
    });

    it("does NOT scale non-SI units like RPM", () => {
      const r = applyBestSIPrefix(3000, "RPM");
      expect(r.unit).toBe("RPM");
    });

    it("does NOT scale °C", () => {
      const r = applyBestSIPrefix(500, "°C");
      expect(r.unit).toBe("°C");
    });

    it("does NOT scale %", () => {
      const r = applyBestSIPrefix(85, "%");
      expect(r.unit).toBe("%");
    });

    it("does NOT scale rad", () => {
      const r = applyBestSIPrefix(6.28, "rad");
      expect(r.unit).toBe("rad");
    });
  });

  describe("edge cases", () => {
    it("handles negative values correctly (−200000 N → −200 kN)", () => {
      const r = applyBestSIPrefix(-200000, "N");
      expect(r.value).toBe("-200");
      expect(r.unit).toBe("kN");
    });

    it("handles non-finite value (Infinity)", () => {
      const r = applyBestSIPrefix(Infinity, "N");
      expect(r.value).toBe("Infinity");
      expect(r.unit).toBe("N");
    });

    it("uses G prefix for very large values (2e9 Pa → 2 GPa)", () => {
      const r = applyBestSIPrefix(2e9, "Pa");
      expect(r.value).toBe("2");
      expect(r.unit).toBe("GPa");
    });

    it("uses n prefix for nano range (0.000000003 m → 3 nm)", () => {
      const r = applyBestSIPrefix(3e-9, "m");
      expect(r.value).toBe("3");
      expect(r.unit).toBe("nm");
    });
  });
});
