import { describe, it, expect } from "vitest";
import {
  geniusSymbolStrict,
  geniusSymbolStrictOptional,
  geniusInputSchema,
  geniusAssumptionSchema,
  geniusStepSchema,
  geniusResultSchema,
  geniusCalculationDocSchema,
  geniusCalculationDocSchemaStrict,
} from "../../shared/schema";

/**
 * Two-tier symbol contract tests.
 *
 * STRICT tier (AI output boundary):
 *   - geniusSymbolStrict / geniusSymbolStrictOptional
 *   - geniusCalculationDocSchemaStrict (used in genius-service.ts)
 *   - Symbols must be valid identifiers, ≤ 10 characters
 *
 * LENIENT tier (DB reads / route parsing / legacy docs):
 *   - geniusInputSchema, geniusAssumptionSchema, geniusStepSchema, geniusResultSchema
 *   - geniusCalculationDocSchema (main export)
 *   - No length or regex constraint — legacy documents round-trip safely
 */

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseInput = { id: "i1", label: "Force", value: 100, unit: "N" };
const baseAssumption = { id: "a1", label: "Efficiency", value: 0.9, unit: "" };
const baseStep = { id: "s1", title: "Compute power" };
const baseResult = { id: "r1", label: "Power output" };

const legacyDoc = {
  inputs: [{ id: "i1", symbol: "sigma_yield", label: "Yield stress", value: 250, unit: "MPa" }],
  assumptions: [{ id: "a1", symbol: "P_motor_req", label: "Motor power", value: 5000, unit: "W" }],
  steps: [{ id: "s1", symbol: "P_mechanical", title: "Mechanical power", expr: "sigma_yield * 1" }],
  results: [{ id: "r1", symbol: "P_motor_req", label: "Required motor power", value: "5000" }],
};

// ─── Strict validator: geniusSymbolStrict ──────────────────────────────────────

describe("geniusSymbolStrict — valid symbols accepted", () => {
  const valid = ["F", "v", "P_m", "eta", "sigma_y", "SF", "L_10", "tau_mx", "n", "_x"];
  for (const sym of valid) {
    it(`accepts "${sym}"`, () => {
      expect(geniusSymbolStrict.safeParse(sym).success).toBe(true);
    });
  }
});

describe("geniusSymbolStrict — rejects symbols longer than 10 chars", () => {
  const toolong = ["P_motor_req", "sigma_yield", "lead_screw1", "P_mechanical"];
  for (const sym of toolong) {
    it(`rejects "${sym}" (${sym.length} chars)`, () => {
      expect(geniusSymbolStrict.safeParse(sym).success).toBe(false);
    });
  }
});

describe("geniusSymbolStrict — rejects invalid identifier syntax", () => {
  const invalid = ["1x", "P motor", "P-m", "P.m", "$F", "F@max", ""];
  for (const sym of invalid) {
    it(`rejects "${sym}"`, () => {
      expect(geniusSymbolStrict.safeParse(sym).success).toBe(false);
    });
  }
});

describe("geniusSymbolStrictOptional — allows undefined, rejects bad strings", () => {
  it("accepts undefined", () => expect(geniusSymbolStrictOptional.safeParse(undefined).success).toBe(true));
  it("accepts valid symbol", () => expect(geniusSymbolStrictOptional.safeParse("P_m").success).toBe(true));
  it("rejects 11-char symbol", () => expect(geniusSymbolStrictOptional.safeParse("P_motor_req").success).toBe(false));
});

// ─── Strict doc schema rejects non-conforming AI output ───────────────────────

describe("geniusCalculationDocSchemaStrict — rejects 11-char symbol in new output", () => {
  it("rejects input with symbol 'sigma_yield' (11 chars)", () => {
    const r = geniusCalculationDocSchemaStrict.safeParse({
      ...legacyDoc,
      inputs: [{ id: "i1", symbol: "sigma_yield", label: "Yield stress", value: 250, unit: "MPa" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects step with symbol 'P_mechanical' (12 chars)", () => {
    const r = geniusCalculationDocSchemaStrict.safeParse({
      ...legacyDoc,
      inputs: [{ id: "i1", symbol: "F", label: "Force", value: 100, unit: "N" }],
      assumptions: [],
      steps: [{ id: "s1", symbol: "P_mechanical", title: "Power", expr: "F * 1" }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts a fully compliant document", () => {
    const r = geniusCalculationDocSchemaStrict.safeParse({
      inputs: [{ id: "i1", symbol: "F", label: "Force", value: 100, unit: "N" }],
      assumptions: [{ id: "a1", symbol: "eta", label: "Efficiency", value: 0.9, unit: "" }],
      steps: [{ id: "s1", symbol: "P_m", title: "Power", expr: "F * 1" }],
      results: [{ id: "r1", symbol: "P_m", label: "Power", value: "100" }],
    });
    expect(r.success).toBe(true);
  });
});

// ─── Lenient doc schema — backward compat with legacy long symbols ─────────────

describe("geniusCalculationDocSchema (lenient) — legacy documents load safely", () => {
  it("accepts a document with 11-char input symbol 'sigma_yield'", () => {
    const r = geniusCalculationDocSchema.safeParse(legacyDoc);
    expect(r.success).toBe(true);
  });

  it("accepts a document with 12-char step symbol 'P_mechanical'", () => {
    const r = geniusCalculationDocSchema.safeParse({
      inputs: [{ id: "i1", symbol: "F", label: "Force", value: 100, unit: "N" }],
      steps: [{ id: "s1", symbol: "P_mechanical", title: "Power", expr: "F * 1" }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a document with all legacy symbols from legacyDoc", () => {
    const r = geniusCalculationDocSchema.safeParse(legacyDoc);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.inputs[0].symbol).toBe("sigma_yield");
    }
  });
});

// ─── Lenient sub-schemas: inputs, assumptions, steps, results ────────────────

describe("geniusInputSchema (lenient) — allows long symbols", () => {
  it("accepts symbol 'sigma_yield' (11 chars)", () => {
    expect(geniusInputSchema.safeParse({ ...baseInput, symbol: "sigma_yield" }).success).toBe(true);
  });
  it("accepts symbol 'P_motor_req' (11 chars)", () => {
    expect(geniusInputSchema.safeParse({ ...baseInput, symbol: "P_motor_req" }).success).toBe(true);
  });
});

describe("geniusAssumptionSchema (lenient) — allows long symbols", () => {
  it("accepts missing symbol (optional)", () => {
    expect(geniusAssumptionSchema.safeParse({ ...baseAssumption }).success).toBe(true);
  });
  it("accepts symbol 'P_motor_req' (11 chars)", () => {
    expect(geniusAssumptionSchema.safeParse({ ...baseAssumption, symbol: "P_motor_req" }).success).toBe(true);
  });
});

describe("geniusStepSchema (lenient) — allows long symbols", () => {
  it("accepts symbol 'P_mechanical' (12 chars)", () => {
    expect(geniusStepSchema.safeParse({ ...baseStep, symbol: "P_mechanical" }).success).toBe(true);
  });
});

describe("geniusResultSchema (lenient) — allows long symbols", () => {
  it("accepts symbol 'sigma_yield' (11 chars)", () => {
    expect(geniusResultSchema.safeParse({ ...baseResult, symbol: "sigma_yield" }).success).toBe(true);
  });
});
